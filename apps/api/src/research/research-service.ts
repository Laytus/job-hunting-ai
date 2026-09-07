import type { Application } from '../application/application.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { AiUsageError } from '../llm/ai-usage.errors.js';
import { LlmProviderError } from '../llm/llm.errors.js';
import type { LlmRequest } from '../llm/llm.types.js';
import {
  generateStructured,
  StructuredLlmError,
} from '../llm/structured-llm.js';
import type { LlmExecutor } from '../llm/tracked-llm.js';
import type { ResearchContextSources } from './research-context-builder.js';
import { ResearchContextError } from './research-context.errors.js';
import type { ResearchContext } from './research-context.types.js';
import {
  ResearchAlreadyRunningError,
  ResearchNotFoundError,
  ResearchPersistenceError,
  ResearchRunningConflictError,
  ResearchValidationError,
  UnexpectedResearchFailureError,
} from './research.errors.js';
import { researchOutputSchema } from './research.schema.js';
import type {
  CompleteResearchGraphCommand,
  CreateRunningResearchCommand,
  FailResearchCommand,
  Research,
  ResearchAggregate,
} from './research.types.js';
import {
  RESEARCH_OPERATION_NAME,
  RESEARCH_PROMPT_VERSION,
} from './research.types.js';
import type {
  ResearchValidationInput,
  ValidatedResearchGraph,
} from './research-validation.types.js';
import { projectVerifiedResearchSubgraph } from './research-verified-subgraph.js';

export const RESEARCH_STALE_AFTER_MS = 600_000;

export interface ResearchApplicationReader {
  findById(id: string): Promise<Application | null>;
}

export interface ResearchJobDescriptionReader {
  findByApplicationId(applicationId: string): Promise<JobDescription | null>;
}

export interface ResearchPersistence {
  createRunning(command: CreateRunningResearchCommand): Promise<Research>;
  markFailed(id: string, command: FailResearchCommand): Promise<Research | null>;
  findRunningByApplicationId(applicationId: string): Promise<Research | null>;
  findById(id: string): Promise<ResearchAggregate | null>;
  findLatestCompletedByApplicationId(
    applicationId: string,
  ): Promise<Research | null>;
  listByApplicationId(applicationId: string): Promise<Research[]>;
  persistCompletedGraph(
    id: string,
    command: CompleteResearchGraphCommand,
  ): Promise<ResearchAggregate | null>;
}

export interface ResearchContextFactory {
  build(sources: ResearchContextSources): ResearchContext;
}

export interface ResearchRequestFactory {
  buildRequest(context: ResearchContext): LlmRequest;
}

export interface ResearchGraphValidation {
  validate(input: ResearchValidationInput): ValidatedResearchGraph;
}

export interface ResearchServiceDependencies {
  readonly applications: ResearchApplicationReader;
  readonly jobDescriptions: ResearchJobDescriptionReader;
  readonly researches: ResearchPersistence;
  readonly contextBuilder: ResearchContextFactory;
  readonly promptBuilder: ResearchRequestFactory;
  readonly executor: LlmExecutor;
  readonly validator: ResearchGraphValidation;
  readonly now?: () => Date;
}

interface PersistedFailure {
  readonly code: string;
  readonly message: string;
  readonly surfacedError: Error;
}

const staleRecoveryMessage =
  'The previous Research execution exceeded the stale-run threshold.';

function normalizeExecutionFailure(error: unknown): PersistedFailure {
  if (error instanceof AiUsageError) {
    return { code: error.code, message: error.message, surfacedError: error };
  }

  if (error instanceof LlmProviderError) {
    return {
      code: 'LLM_PROVIDER_FAILED',
      message: 'The LLM provider could not complete the research.',
      surfacedError: error,
    };
  }

  if (error instanceof StructuredLlmError || error instanceof ResearchValidationError) {
    return { code: error.code, message: error.message, surfacedError: error };
  }

  if (error instanceof ResearchPersistenceError) {
    return { code: error.code, message: error.message, surfacedError: error };
  }

  const surfacedError = new UnexpectedResearchFailureError({ cause: error });
  return {
    code: surfacedError.code,
    message: surfacedError.message,
    surfacedError,
  };
}

function requestWithoutResponseFormat(request: LlmRequest): Omit<
  LlmRequest,
  'responseFormat'
> {
  return {
    messages: request.messages,
    ...(request.model === undefined ? {} : { model: request.model }),
    ...(request.tools === undefined ? {} : { tools: request.tools }),
  };
}

function completionCommand(
  graph: ValidatedResearchGraph,
  retrievedAt: Date,
  completedAt: Date,
): CompleteResearchGraphCommand {
  return {
    summaryMarkdown: graph.summaryMarkdown,
    warnings: graph.warnings,
    promptVersion: RESEARCH_PROMPT_VERSION,
    completedAt,
    sources: graph.sources.map((source) => ({
      key: source.key,
      url: source.url,
      normalizedUrl: source.normalizedUrl,
      title: source.title,
      publisher: source.publisher,
      sourceType: source.sourceType,
      sourceQuality: source.sourceQuality,
      publishedAt: source.publishedAt,
      retrievedAt,
      notes: null,
    })),
    claims: graph.claims.map((claim) => ({
      key: claim.key,
      type: claim.type,
      valueText: claim.valueText,
      valueJson: claim.valueJson,
      evidenceType: claim.evidenceType,
      confidence: claim.confidence,
      notes: null,
    })),
    relationships: graph.relationships.map((relationship) => ({
      claimKey: relationship.claimKey,
      sourceKey: relationship.sourceKey,
      relationship: relationship.relationship,
      evidenceText: relationship.evidenceText,
    })),
  };
}

export class ResearchService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: ResearchServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async researchApplication(applicationId: string): Promise<ResearchAggregate> {
    const context = await this.preflight(applicationId);
    const researchDate = this.now();
    await this.handleActiveRun(applicationId, researchDate);
    const running = await this.createRunning(applicationId, researchDate);

    return this.executeAndPersist(running.id, context, researchDate);
  }

  async getResearches(applicationId: string): Promise<Research[]> {
    await this.loadApplication(applicationId);

    try {
      return await this.dependencies.researches.listByApplicationId(applicationId);
    } catch (error) {
      throw new ResearchPersistenceError({ cause: error });
    }
  }

  async getResearch(
    applicationId: string,
    researchId: string,
  ): Promise<ResearchAggregate> {
    await this.loadApplication(applicationId);

    let research: ResearchAggregate | null;
    try {
      research = await this.dependencies.researches.findById(researchId);
    } catch (error) {
      throw new ResearchPersistenceError({ cause: error });
    }

    if (research === null || research.applicationId !== applicationId) {
      throw new ResearchNotFoundError();
    }

    return research;
  }

  async getLatestCompletedResearch(
    applicationId: string,
  ): Promise<ResearchAggregate> {
    await this.loadApplication(applicationId);

    let latest: Research | null;
    try {
      latest = await this.dependencies.researches.findLatestCompletedByApplicationId(
        applicationId,
      );
    } catch (error) {
      throw new ResearchPersistenceError({ cause: error });
    }

    if (latest === null) {
      throw new ResearchNotFoundError();
    }

    let aggregate: ResearchAggregate | null;
    try {
      aggregate = await this.dependencies.researches.findById(latest.id);
    } catch (error) {
      throw new ResearchPersistenceError({ cause: error });
    }

    if (aggregate === null || aggregate.applicationId !== applicationId) {
      throw new ResearchNotFoundError();
    }

    return aggregate;
  }

  private async loadApplication(applicationId: string): Promise<Application> {
    let application: Application | null;
    try {
      application = await this.dependencies.applications.findById(applicationId);
    } catch (error) {
      throw new ResearchPersistenceError({ cause: error });
    }

    if (application === null) {
      throw new ResearchContextError('APPLICATION_UNAVAILABLE');
    }

    return application;
  }

  private async preflight(applicationId: string): Promise<ResearchContext> {
    let application: Application | null;
    let jobDescription: JobDescription | null;
    try {
      application = await this.dependencies.applications.findById(applicationId);
      jobDescription = await this.dependencies.jobDescriptions.findByApplicationId(
        applicationId,
      );
    } catch (error) {
      throw new ResearchPersistenceError({ cause: error });
    }

    try {
      return this.dependencies.contextBuilder.build({
        application,
        jobDescription,
      });
    } catch (error) {
      if (error instanceof ResearchContextError) {
        throw error;
      }
      throw new UnexpectedResearchFailureError({ cause: error });
    }
  }

  private async handleActiveRun(
    applicationId: string,
    researchDate: Date,
  ): Promise<void> {
    let running: Research | null;
    try {
      running = await this.dependencies.researches.findRunningByApplicationId(
        applicationId,
      );
    } catch (error) {
      throw new ResearchPersistenceError({ cause: error });
    }

    if (running === null) {
      return;
    }

    const ageMs = researchDate.getTime() - running.startedAt.getTime();
    if (ageMs < RESEARCH_STALE_AFTER_MS) {
      throw new ResearchAlreadyRunningError();
    }

    try {
      const failed = await this.dependencies.researches.markFailed(running.id, {
        failureCode: 'STALE_RUN_RECOVERED',
        failureMessage: staleRecoveryMessage,
        failedAt: researchDate,
      });
      if (failed === null) {
        throw new Error('The stale RUNNING Research could not be transitioned.');
      }
    } catch (error) {
      throw new ResearchPersistenceError({ cause: error });
    }
  }

  private async createRunning(
    applicationId: string,
    researchDate: Date,
  ): Promise<Research> {
    try {
      return await this.dependencies.researches.createRunning({
        applicationId,
        researchDate,
        startedAt: researchDate,
        promptVersion: RESEARCH_PROMPT_VERSION,
      });
    } catch (error) {
      if (error instanceof ResearchRunningConflictError) {
        throw new ResearchAlreadyRunningError();
      }
      throw new ResearchPersistenceError({ cause: error });
    }
  }

  private async executeAndPersist(
    researchId: string,
    context: ResearchContext,
    researchDate: Date,
  ): Promise<ResearchAggregate> {
    try {
      const request = this.dependencies.promptBuilder.buildRequest(context);
      const responseFormat = request.responseFormat;
      if (responseFormat === undefined) {
        throw new UnexpectedResearchFailureError();
      }

      const structured = await generateStructured(this.dependencies.executor, {
        operationName: RESEARCH_OPERATION_NAME,
        request: requestWithoutResponseFormat(request),
        responseFormat,
        runtimeSchema: researchOutputSchema,
      });
      const retrievedAt = this.now();
      const providerWebSources = structured.response.webSources ?? [];
      const projected = projectVerifiedResearchSubgraph(
        structured.data,
        providerWebSources,
      );
      const graph = this.dependencies.validator.validate({
        output: projected.output,
        providerWebSources,
        researchDate,
      });

      let completed: ResearchAggregate | null;
      try {
        completed = await this.dependencies.researches.persistCompletedGraph(
          researchId,
          completionCommand(graph, retrievedAt, this.now()),
        );
      } catch (error) {
        throw new ResearchPersistenceError({ cause: error });
      }

      if (completed?.status !== 'COMPLETED') {
        throw new ResearchPersistenceError();
      }

      return completed;
    } catch (error) {
      return this.failRunningResearch(researchId, error);
    }
  }

  private async failRunningResearch(
    researchId: string,
    originalError: unknown,
  ): Promise<never> {
    const failure = normalizeExecutionFailure(originalError);

    try {
      const failed = await this.dependencies.researches.markFailed(researchId, {
        failureCode: failure.code,
        failureMessage: failure.message,
        failedAt: this.now(),
      });
      if (failed === null) {
        throw new Error('The RUNNING Research could not be transitioned.');
      }
    } catch (persistenceError) {
      throw new ResearchPersistenceError({
        cause: new AggregateError(
          [failure.surfacedError, persistenceError],
          'Research execution and failure persistence both failed.',
        ),
      });
    }

    throw failure.surfacedError;
  }
}
