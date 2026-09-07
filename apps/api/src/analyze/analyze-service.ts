import type { Application } from '../application/application.types.js';
import type { CandidateAggregate } from '../candidate/candidate.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { AiUsageError } from '../llm/ai-usage.errors.js';
import { LlmProviderError } from '../llm/llm.errors.js';
import type { LlmRequest } from '../llm/llm.types.js';
import {
  generateStructured,
  StructuredLlmError,
} from '../llm/structured-llm.js';
import type { LlmExecutor } from '../llm/tracked-llm.js';
import type { AnalyzeConfig } from './analyze.config.js';
import type { AnalyzeContextSources } from './analyze-context-builder.js';
import { AnalyzeContextError } from './analyze-context.errors.js';
import type { AnalyzeContext } from './analyze-context.types.js';
import {
  AnalysisAlreadyRunningError,
  AnalysisNotFoundError,
  AnalyzeApplicationNotFoundError,
  AnalyzePersistenceError,
  AnalyzeScoringError,
  JobAnalysisRunningConflictError,
  UnexpectedAnalyzeFailureError,
} from './analyze.errors.js';
import type { AnalyzeOutput } from './analyze.schema.js';
import { analyzeOutputSchema } from './analyze.schema.js';
import { calculateSuggestedScore } from './analyze-scoring.js';
import type {
  AnalyzeExecutionResult,
  CompleteJobAnalysisCommand,
  CreateRunningJobAnalysisCommand,
  FailJobAnalysisCommand,
  JobAnalysis,
} from './analyze.types.js';
import {
  ANALYZE_OPERATION_NAME,
  ANALYZE_PROMPT_VERSION,
} from './analyze.types.js';

export interface AnalyzeApplicationReader {
  findById(id: string): Promise<Application | null>;
}

export interface AnalyzeCandidateReader {
  loadAggregate(): Promise<CandidateAggregate | null>;
}

export interface AnalyzeJobDescriptionReader {
  findByApplicationId(applicationId: string): Promise<JobDescription | null>;
}

export interface AnalyzeJobAnalysisPersistence {
  createRunning(command: CreateRunningJobAnalysisCommand): Promise<JobAnalysis>;
  markCompleted(
    id: string,
    command: CompleteJobAnalysisCommand,
  ): Promise<JobAnalysis | null>;
  markFailed(
    id: string,
    command: FailJobAnalysisCommand,
  ): Promise<JobAnalysis | null>;
  findRunningByApplicationId(applicationId: string): Promise<JobAnalysis | null>;
  findById(id: string): Promise<JobAnalysis | null>;
  findLatestCompletedByApplicationId(
    applicationId: string,
  ): Promise<JobAnalysis | null>;
  listByApplicationId(applicationId: string): Promise<JobAnalysis[]>;
}

export interface AnalyzeContextFactory {
  build(sources: AnalyzeContextSources): AnalyzeContext;
}

export interface AnalyzeRequestFactory {
  buildRequest(context: AnalyzeContext): LlmRequest;
}

export type AnalyzeScorer = (
  requirements: AnalyzeOutput['requirements'],
) => number | null;

export interface AnalyzeServiceDependencies {
  readonly applications: AnalyzeApplicationReader;
  readonly candidates: AnalyzeCandidateReader;
  readonly jobDescriptions: AnalyzeJobDescriptionReader;
  readonly analyses: AnalyzeJobAnalysisPersistence;
  readonly contextBuilder: AnalyzeContextFactory;
  readonly promptBuilder: AnalyzeRequestFactory;
  readonly executor: LlmExecutor;
  readonly config: AnalyzeConfig;
  readonly scorer?: AnalyzeScorer;
  readonly now?: () => Date;
}

interface AnalyzePreflight {
  readonly request: LlmRequest;
}

interface PersistedFailure {
  readonly code: string;
  readonly message: string;
  readonly surfacedError: Error;
}

interface SuccessfulAnalyzeExecution {
  readonly output: AnalyzeOutput;
  readonly suggestedScore: number | null;
}

const staleRecoveryMessage =
  'The previous Analyze execution exceeded the stale-run threshold.';

function normalizeExecutionFailure(error: unknown): PersistedFailure {
  if (error instanceof AiUsageError) {
    return {
      code: error.code,
      message: error.message,
      surfacedError: error,
    };
  }

  if (error instanceof LlmProviderError) {
    return {
      code: 'LLM_PROVIDER_FAILED',
      message: 'The LLM provider could not complete the analysis.',
      surfacedError: error,
    };
  }

  if (error instanceof StructuredLlmError) {
    return {
      code: error.code,
      message: error.message,
      surfacedError: error,
    };
  }

  if (error instanceof AnalyzeScoringError) {
    return {
      code: error.code,
      message: error.message,
      surfacedError: error,
    };
  }

  const surfacedError = new UnexpectedAnalyzeFailureError({ cause: error });
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
  };
}

export class AnalyzeService {
  private readonly scorer: AnalyzeScorer;
  private readonly now: () => Date;

  constructor(private readonly dependencies: AnalyzeServiceDependencies) {
    if (
      !Number.isSafeInteger(dependencies.config.staleRunAfterMs) ||
      dependencies.config.staleRunAfterMs <= 0
    ) {
      throw new RangeError('Analyze stale-run threshold must be a positive safe integer.');
    }

    this.scorer = dependencies.scorer ?? calculateSuggestedScore;
    this.now = dependencies.now ?? (() => new Date());
  }

  async analyzeApplication(applicationId: string): Promise<AnalyzeExecutionResult> {
    const preflight = await this.preflight(applicationId);
    const startedAt = this.now();
    await this.handleActiveRun(applicationId, startedAt);
    const running = await this.createRunning(applicationId, startedAt);

    const execution = await this.executeStructuredAnalysis(
      running.id,
      preflight.request,
    );

    let completed: JobAnalysis | null;
    try {
      completed = await this.dependencies.analyses.markCompleted(running.id, {
        analysisData: execution.output,
        suggestedScore: execution.suggestedScore,
        completedAt: this.now(),
      });
    } catch (error) {
      throw new AnalyzePersistenceError({ cause: error });
    }

    if (completed?.status !== 'COMPLETED' || completed.analysisData === null) {
      throw new AnalyzePersistenceError();
    }

    return {
      analysisId: completed.id,
      applicationId: completed.applicationId,
      status: 'COMPLETED',
      output: completed.analysisData,
      suggestedScore: completed.suggestedScore,
      promptVersion: completed.promptVersion,
    };
  }

  async getAnalyses(applicationId: string): Promise<JobAnalysis[]> {
    await this.loadApplication(applicationId);

    try {
      return await this.dependencies.analyses.listByApplicationId(applicationId);
    } catch (error) {
      throw new AnalyzePersistenceError({ cause: error });
    }
  }

  async getAnalysis(
    applicationId: string,
    analysisId: string,
  ): Promise<JobAnalysis> {
    await this.loadApplication(applicationId);

    let analysis: JobAnalysis | null;
    try {
      analysis = await this.dependencies.analyses.findById(analysisId);
    } catch (error) {
      throw new AnalyzePersistenceError({ cause: error });
    }

    if (analysis === null || analysis.applicationId !== applicationId) {
      throw new AnalysisNotFoundError();
    }

    return analysis;
  }

  async getLatestCompletedAnalysis(applicationId: string): Promise<JobAnalysis> {
    await this.loadApplication(applicationId);

    let analysis: JobAnalysis | null;
    try {
      analysis = await this.dependencies.analyses.findLatestCompletedByApplicationId(
        applicationId,
      );
    } catch (error) {
      throw new AnalyzePersistenceError({ cause: error });
    }

    if (analysis === null) {
      throw new AnalysisNotFoundError();
    }

    return analysis;
  }

  private async executeStructuredAnalysis(
    analysisId: string,
    request: LlmRequest,
  ): Promise<SuccessfulAnalyzeExecution> {
    try {
      const responseFormat = request.responseFormat;
      if (responseFormat === undefined) {
        throw new UnexpectedAnalyzeFailureError();
      }

      const structured = await generateStructured(this.dependencies.executor, {
        operationName: ANALYZE_OPERATION_NAME,
        request: requestWithoutResponseFormat(request),
        responseFormat,
        runtimeSchema: analyzeOutputSchema,
      });
      const output = structured.data;

      let suggestedScore: number | null;
      try {
        suggestedScore = this.scorer(output.requirements);
      } catch (error) {
        throw new AnalyzeScoringError({ cause: error });
      }

      if (
        suggestedScore !== null &&
        (!Number.isInteger(suggestedScore) ||
          suggestedScore < 0 ||
          suggestedScore > 100)
      ) {
        throw new AnalyzeScoringError();
      }

      return { output, suggestedScore };
    } catch (error) {
      return this.failRunningAnalysis(analysisId, error);
    }
  }

  private async preflight(applicationId: string): Promise<AnalyzePreflight> {
    const application = await this.loadApplication(applicationId);

    let candidate: CandidateAggregate | null;
    let jobDescription: JobDescription | null;
    try {
      candidate = await this.dependencies.candidates.loadAggregate();
      jobDescription = await this.dependencies.jobDescriptions.findByApplicationId(
        applicationId,
      );
    } catch (error) {
      throw new AnalyzePersistenceError({ cause: error });
    }

    try {
      const context = this.dependencies.contextBuilder.build({
        candidate,
        application,
        jobDescription,
      });
      const request = this.dependencies.promptBuilder.buildRequest(context);
      if (request.responseFormat === undefined) {
        throw new UnexpectedAnalyzeFailureError();
      }
      return { request };
    } catch (error) {
      if (
        error instanceof AnalyzeContextError ||
        error instanceof UnexpectedAnalyzeFailureError
      ) {
        throw error;
      }
      throw new UnexpectedAnalyzeFailureError({ cause: error });
    }
  }

  private async loadApplication(applicationId: string): Promise<Application> {
    let application: Application | null;
    try {
      application = await this.dependencies.applications.findById(applicationId);
    } catch (error) {
      throw new AnalyzePersistenceError({ cause: error });
    }

    if (application === null) {
      throw new AnalyzeApplicationNotFoundError();
    }

    return application;
  }

  private async handleActiveRun(
    applicationId: string,
    startedAt: Date,
  ): Promise<void> {
    let running: JobAnalysis | null;
    try {
      running = await this.dependencies.analyses.findRunningByApplicationId(
        applicationId,
      );
    } catch (error) {
      throw new AnalyzePersistenceError({ cause: error });
    }

    if (running === null) {
      return;
    }

    const ageMs = startedAt.getTime() - running.startedAt.getTime();
    if (ageMs < this.dependencies.config.staleRunAfterMs) {
      throw new AnalysisAlreadyRunningError();
    }

    try {
      await this.dependencies.analyses.markFailed(running.id, {
        failureCode: 'STALE_RUN_RECOVERED',
        failureMessage: staleRecoveryMessage,
        failedAt: startedAt,
      });
    } catch (error) {
      throw new AnalyzePersistenceError({ cause: error });
    }
  }

  private async createRunning(
    applicationId: string,
    startedAt: Date,
  ): Promise<JobAnalysis> {
    try {
      return await this.dependencies.analyses.createRunning({
        applicationId,
        promptVersion: ANALYZE_PROMPT_VERSION,
        startedAt,
      });
    } catch (error) {
      if (error instanceof JobAnalysisRunningConflictError) {
        throw new AnalysisAlreadyRunningError();
      }
      throw new AnalyzePersistenceError({ cause: error });
    }
  }

  private async failRunningAnalysis(
    analysisId: string,
    originalError: unknown,
  ): Promise<never> {
    const failure = normalizeExecutionFailure(originalError);

    try {
      const failed = await this.dependencies.analyses.markFailed(analysisId, {
        failureCode: failure.code,
        failureMessage: failure.message,
        failedAt: this.now(),
      });
      if (failed === null) {
        throw new Error('The RUNNING Job Analysis could not be transitioned.');
      }
    } catch (persistenceError) {
      throw new AnalyzePersistenceError({
        cause: new AggregateError(
          [failure.surfacedError, persistenceError],
          'Analyze execution and failure persistence both failed.',
        ),
      });
    }

    throw failure.surfacedError;
  }
}
