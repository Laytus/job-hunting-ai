import type { ZodType } from 'zod';
import type { Application } from '../application/application.types.js';
import type { JobAnalysis } from '../analyze/analyze.types.js';
import type { CandidateAggregate } from '../candidate/candidate.types.js';
import type {
  CreateDocumentCommand,
  CreateDocumentVersionCommand,
  Document,
  DocumentVersion,
  DocumentWithCurrentVersion,
} from '../document/document.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { AiUsageError } from '../llm/ai-usage.errors.js';
import { LlmProviderError } from '../llm/llm.errors.js';
import type {
  LlmRequest,
  LlmResponse,
} from '../llm/llm.types.js';
import {
  generateStructured,
  StructuredLlmError,
} from '../llm/structured-llm.js';
import type { LlmExecutor } from '../llm/tracked-llm.js';
import type { Research, ResearchAggregate } from '../research/research.types.js';
import { CoverLetterProfileResolver } from './cover-letter-profile-resolver.js';
import {
  ApplicationBriefComposer,
  CoverLetterComposer,
  InterviewBriefComposer,
} from './generation-composers.js';
import { GenerationContextBuilder } from './generation-context-builder.js';
import type {
  ApplicationBriefGenerationContext,
  CoverLetterGenerationContext,
  GenerationContext,
  InterviewBriefGenerationContext,
} from './generation-context.types.js';
import {
  GenerationContextError,
  GenerationTemplateError,
  GenerationWorkflowError,
} from './generation.errors.js';
import { GenerationMetadataBuilder } from './generation-metadata.js';
import {
  ApplicationBriefPromptBuilder,
  CoverLetterPromptBuilder,
  InterviewBriefPromptBuilder,
} from './generation-prompt-builders.js';
import {
  applicationBriefOutputSchema,
  coverLetterOutputSchema,
  interviewBriefOutputSchema,
  type ApplicationBriefOutput,
  type CoverLetterOutput,
  type InterviewBriefOutput,
} from './generation.schema.js';
import { GenerationTemplateLoader } from './templates/generation-template-loader.js';
import {
  coverLetterMarkets,
  coverLetterSectors,
  generationDocumentTypes,
  generationLanguages,
  type CoverLetterProfile,
  type CoverLetterProfileSuggestion,
  type CoverLetterGenerationProfileFields,
  type GenerationDocumentRequest,
  type GenerationDocumentType,
  type GenerationLanguage,
  type GenerationOperationName,
  type GenerationPromptVersion,
  type GenerationWarning,
  type LoadedGenerationTemplate,
} from './generation.types.js';

export interface GenerationApplicationReader {
  findById(id: string): Promise<Application | null>;
}

export interface GenerationCandidateReader {
  loadAggregate(): Promise<CandidateAggregate | null>;
}

export interface GenerationJobDescriptionReader {
  findByApplicationId(applicationId: string): Promise<JobDescription | null>;
}

export interface GenerationAnalysisReader {
  findLatestCompletedByApplicationId(
    applicationId: string,
  ): Promise<JobAnalysis | null>;
}

export interface GenerationResearchReader {
  findLatestCompletedByApplicationId(
    applicationId: string,
  ): Promise<Research | null>;
  findById(id: string): Promise<ResearchAggregate | null>;
}

export interface GenerationDocumentPersistence {
  findByApplicationIdAndType(
    applicationId: string,
    type: GenerationDocumentType,
  ): Promise<DocumentWithCurrentVersion | null>;
  findById(id: string): Promise<DocumentWithCurrentVersion | null>;
  create(
    command: CreateDocumentCommand,
  ): Promise<DocumentWithCurrentVersion | null>;
  createVersion(
    id: string,
    command: CreateDocumentVersionCommand,
  ): Promise<DocumentWithCurrentVersion | null>;
}

export interface GenerationExecutionResult {
  readonly document: Document;
  readonly currentVersion: DocumentVersion;
  readonly warnings: readonly GenerationWarning[];
}

export interface GenerationServiceDependencies {
  readonly applications: GenerationApplicationReader;
  readonly candidates: GenerationCandidateReader;
  readonly jobDescriptions: GenerationJobDescriptionReader;
  readonly analyses: GenerationAnalysisReader;
  readonly researches: GenerationResearchReader;
  readonly documents: GenerationDocumentPersistence;
  readonly executor: LlmExecutor;
  readonly contextBuilder?: GenerationContextBuilder;
  readonly templateLoader?: GenerationTemplateLoader;
  readonly profileResolver?: CoverLetterProfileResolver;
  readonly coverLetterPromptBuilder?: CoverLetterPromptBuilder;
  readonly applicationBriefPromptBuilder?: ApplicationBriefPromptBuilder;
  readonly interviewBriefPromptBuilder?: InterviewBriefPromptBuilder;
  readonly coverLetterComposer?: CoverLetterComposer;
  readonly applicationBriefComposer?: ApplicationBriefComposer;
  readonly interviewBriefComposer?: InterviewBriefComposer;
  readonly metadataBuilder?: GenerationMetadataBuilder;
  readonly now?: () => Date;
}

interface RequiredSources {
  readonly application: Application;
  readonly candidate: CandidateAggregate;
  readonly jobDescription: JobDescription;
}

interface OptionalSources {
  readonly analysis: JobAnalysis | null;
  readonly research: ResearchAggregate | null;
}

interface GeneratedContent {
  readonly contentMarkdown: string;
  readonly context: GenerationContext;
  readonly template: LoadedGenerationTemplate;
  readonly promptVersion: GenerationPromptVersion;
  readonly response: LlmResponse;
}

type ResolvedGenerationDocumentRequest =
  | Extract<GenerationDocumentRequest, { readonly mode: 'GENERATE' }>
  | ({
      readonly mode: 'REGENERATE';
      readonly applicationId: string;
      readonly documentId: string;
      readonly documentType: 'COVER_LETTER';
    } & CoverLetterGenerationProfileFields)
  | {
      readonly mode: 'REGENERATE';
      readonly applicationId: string;
      readonly documentId: string;
      readonly documentType: Exclude<GenerationDocumentType, 'COVER_LETTER'>;
      readonly outputLanguage: 'en';
    };

interface ResolvedGenerationTarget {
  readonly request: ResolvedGenerationDocumentRequest;
  readonly document: DocumentWithCurrentVersion | null;
}

const operationNames: Record<
  GenerationDocumentType,
  GenerationOperationName
> = {
  COVER_LETTER: 'GENERATE_COVER_LETTER',
  APPLICATION_BRIEF: 'GENERATE_APPLICATION_BRIEF',
  INTERVIEW_BRIEF: 'GENERATE_INTERVIEW_BRIEF',
};

const titlePrefixes: Record<GenerationDocumentType, string> = {
  COVER_LETTER: 'Cover Letter',
  APPLICATION_BRIEF: 'Application Brief',
  INTERVIEW_BRIEF: 'Interview Brief',
};

function requestWithoutResponseFormat(
  request: LlmRequest,
): Omit<LlmRequest, 'responseFormat'> {
  if (request.responseFormat === undefined || request.tools !== undefined) {
    throw new GenerationWorkflowError('UNEXPECTED_GENERATION_FAILURE');
  }
  return {
    messages: request.messages,
    ...(request.model === undefined ? {} : { model: request.model }),
  };
}

function requestField(request: GenerationDocumentRequest, key: string): unknown {
  return (request as unknown as Readonly<Record<string, unknown>>)[key];
}

function hasProfileField(request: GenerationDocumentRequest): boolean {
  return (
    requestField(request, 'market') !== undefined ||
    requestField(request, 'sector') !== undefined
  );
}

function requireCoverLetterProfile(
  request: GenerationDocumentRequest | ResolvedGenerationDocumentRequest,
): CoverLetterProfile {
  const language = requestField(request, 'outputLanguage');
  const market = requestField(request, 'market');
  const sector = requestField(request, 'sector');
  if (!generationLanguages.some((value) => value === language)) {
    throw new GenerationWorkflowError('INVALID_OUTPUT_LANGUAGE');
  }
  if (
    !coverLetterMarkets.some((value) => value === market) ||
    !coverLetterSectors.some((value) => value === sector)
  ) {
    throw new GenerationWorkflowError('INVALID_GENERATION_REQUEST');
  }
  return {
    language: language as GenerationLanguage,
    market: market as CoverLetterProfile['market'],
    sector: sector as CoverLetterProfile['sector'],
  };
}

function validateRequest(request: GenerationDocumentRequest): void {
  if (
    request.mode !== 'GENERATE' &&
    request.mode !== 'REGENERATE'
  ) {
    throw new GenerationWorkflowError('INVALID_GENERATION_REQUEST');
  }
  if (request.applicationId.trim() === '') {
    throw new GenerationWorkflowError('INVALID_GENERATION_REQUEST');
  }
  if (request.mode === 'GENERATE') {
    if (!generationDocumentTypes.includes(request.documentType)) {
      throw new GenerationWorkflowError('INVALID_DOCUMENT_TYPE');
    }
    if (!generationLanguages.includes(request.outputLanguage)) {
      throw new GenerationWorkflowError('INVALID_OUTPUT_LANGUAGE');
    }
    if (request.documentType === 'COVER_LETTER') {
      requireCoverLetterProfile(request);
      return;
    }
    if (
      request.outputLanguage !== 'en' ||
      hasProfileField(request)
    ) {
      throw new GenerationWorkflowError(
        request.outputLanguage !== 'en'
          ? 'INVALID_OUTPUT_LANGUAGE'
          : 'INVALID_GENERATION_REQUEST',
      );
    }
    return;
  }
  if (request.documentId.trim() === '') {
    throw new GenerationWorkflowError('INVALID_GENERATION_REQUEST');
  }
  if (
    request.outputLanguage !== undefined &&
    !generationLanguages.includes(request.outputLanguage)
  ) {
    throw new GenerationWorkflowError('INVALID_OUTPUT_LANGUAGE');
  }
  if (hasProfileField(request)) {
    requireCoverLetterProfile(request);
  }
}

function lockKey(request: ResolvedGenerationDocumentRequest): string {
  return JSON.stringify([request.applicationId, request.documentType]);
}

function modelFrom(response: LlmResponse): string | undefined {
  const model = response.model?.trim();
  return model === undefined || model === '' ? undefined : model;
}

function isExpectedGenerationError(error: unknown): error is Error {
  return (
    error instanceof AiUsageError ||
    error instanceof LlmProviderError ||
    error instanceof StructuredLlmError ||
    error instanceof GenerationContextError ||
    error instanceof GenerationTemplateError ||
    error instanceof GenerationWorkflowError
  );
}

export class GenerationService {
  private readonly activeKeys = new Set<string>();
  private readonly contextBuilder: GenerationContextBuilder;
  private readonly templateLoader: GenerationTemplateLoader;
  private readonly profileResolver: CoverLetterProfileResolver;
  private readonly coverLetterPromptBuilder: CoverLetterPromptBuilder;
  private readonly applicationBriefPromptBuilder: ApplicationBriefPromptBuilder;
  private readonly interviewBriefPromptBuilder: InterviewBriefPromptBuilder;
  private readonly coverLetterComposer: CoverLetterComposer;
  private readonly applicationBriefComposer: ApplicationBriefComposer;
  private readonly interviewBriefComposer: InterviewBriefComposer;
  private readonly metadataBuilder: GenerationMetadataBuilder;
  private readonly now: () => Date;

  constructor(private readonly dependencies: GenerationServiceDependencies) {
    this.contextBuilder =
      dependencies.contextBuilder ?? new GenerationContextBuilder();
    this.templateLoader =
      dependencies.templateLoader ?? new GenerationTemplateLoader();
    this.profileResolver =
      dependencies.profileResolver ?? new CoverLetterProfileResolver();
    this.coverLetterPromptBuilder =
      dependencies.coverLetterPromptBuilder ?? new CoverLetterPromptBuilder();
    this.applicationBriefPromptBuilder =
      dependencies.applicationBriefPromptBuilder ??
      new ApplicationBriefPromptBuilder();
    this.interviewBriefPromptBuilder =
      dependencies.interviewBriefPromptBuilder ??
      new InterviewBriefPromptBuilder();
    this.coverLetterComposer =
      dependencies.coverLetterComposer ?? new CoverLetterComposer();
    this.applicationBriefComposer =
      dependencies.applicationBriefComposer ?? new ApplicationBriefComposer();
    this.interviewBriefComposer =
      dependencies.interviewBriefComposer ?? new InterviewBriefComposer();
    this.metadataBuilder =
      dependencies.metadataBuilder ?? new GenerationMetadataBuilder();
    this.now = dependencies.now ?? (() => new Date());
  }

  async suggestCoverLetterProfile(
    applicationId: string,
  ): Promise<CoverLetterProfileSuggestion> {
    if (applicationId.trim() === '') {
      throw new GenerationWorkflowError('INVALID_GENERATION_REQUEST');
    }
    try {
      const application = await this.dependencies.applications.findById(
        applicationId,
      );
      if (application === null) {
        throw new GenerationWorkflowError('APPLICATION_UNAVAILABLE');
      }
      const jobDescription =
        await this.dependencies.jobDescriptions.findByApplicationId(
          applicationId,
        );
      if (
        jobDescription !== null &&
        jobDescription.applicationId !== application.id
      ) {
        throw new GenerationWorkflowError('INVALID_GENERATION_REQUEST');
      }
      return this.profileResolver.suggest(application, jobDescription);
    } catch (error) {
      if (error instanceof GenerationWorkflowError) {
        throw error;
      }
      throw new GenerationWorkflowError('GENERATION_PERSISTENCE_FAILED', {
        cause: error,
      });
    }
  }

  async generateDocument(
    request: GenerationDocumentRequest,
  ): Promise<GenerationExecutionResult> {
    validateRequest(request);
    const required = await this.loadRequiredSources(request.applicationId);
    const resolved = await this.resolveGenerationTarget(request);
    const key = lockKey(resolved.request);
    if (this.activeKeys.has(key)) {
      throw new GenerationWorkflowError('GENERATION_ALREADY_RUNNING');
    }
    this.activeKeys.add(key);

    try {
      const operationDate = this.now();
      const optional = await this.loadOptionalSources(request.applicationId);
      const generated = await this.generateContent(
        resolved.request,
        required,
        optional,
        operationDate,
      );
      const model = modelFrom(generated.response);
      const metadata = this.metadataBuilder.build({
        context: generated.context,
        promptVersion: generated.promptVersion,
        template: generated.template,
        ...(model === undefined ? {} : { model }),
      });
      const persisted = await this.persist(
        resolved.request,
        required.application,
        resolved.document,
        generated.contentMarkdown,
        metadata,
      );
      const { currentVersion, ...document } = persisted;
      return {
        document,
        currentVersion,
        warnings: generated.context.warnings,
      };
    } catch (error) {
      if (isExpectedGenerationError(error)) {
        throw error;
      }
      throw new GenerationWorkflowError('UNEXPECTED_GENERATION_FAILURE', {
        cause: error,
      });
    } finally {
      this.activeKeys.delete(key);
    }
  }

  private async loadRequiredSources(
    applicationId: string,
  ): Promise<RequiredSources> {
    let application: Application | null;
    try {
      application = await this.dependencies.applications.findById(applicationId);
    } catch (error) {
      throw new GenerationWorkflowError('GENERATION_PERSISTENCE_FAILED', {
        cause: error,
      });
    }
    if (application === null) {
      throw new GenerationWorkflowError('APPLICATION_UNAVAILABLE');
    }

    let candidate: CandidateAggregate | null;
    let jobDescription: JobDescription | null;
    try {
      [candidate, jobDescription] = await Promise.all([
        this.dependencies.candidates.loadAggregate(),
        this.dependencies.jobDescriptions.findByApplicationId(applicationId),
      ]);
    } catch (error) {
      throw new GenerationWorkflowError('GENERATION_PERSISTENCE_FAILED', {
        cause: error,
      });
    }
    if (candidate === null) {
      throw new GenerationWorkflowError('CANDIDATE_UNAVAILABLE');
    }
    if (jobDescription === null) {
      throw new GenerationWorkflowError('JOB_DESCRIPTION_UNAVAILABLE');
    }
    if (jobDescription.applicationId !== application.id) {
      throw new GenerationWorkflowError('INVALID_GENERATION_REQUEST');
    }
    return { application, candidate, jobDescription };
  }

  private async loadOptionalSources(
    applicationId: string,
  ): Promise<OptionalSources> {
    try {
      const [analysis, latestResearch] = await Promise.all([
        this.dependencies.analyses.findLatestCompletedByApplicationId(
          applicationId,
        ),
        this.dependencies.researches.findLatestCompletedByApplicationId(
          applicationId,
        ),
      ]);
      if (latestResearch === null) {
        return { analysis, research: null };
      }
      const research = await this.dependencies.researches.findById(
        latestResearch.id,
      );
      if (
        research === null ||
        research.status !== 'COMPLETED' ||
        research.applicationId !== applicationId
      ) {
        throw new GenerationWorkflowError('GENERATION_PERSISTENCE_FAILED');
      }
      return { analysis, research };
    } catch (error) {
      if (error instanceof GenerationWorkflowError) {
        throw error;
      }
      throw new GenerationWorkflowError('GENERATION_PERSISTENCE_FAILED', {
        cause: error,
      });
    }
  }

  private async resolveGenerationTarget(
    request: GenerationDocumentRequest,
  ): Promise<ResolvedGenerationTarget> {
    try {
      if (request.mode === 'GENERATE') {
        const existing =
          await this.dependencies.documents.findByApplicationIdAndType(
            request.applicationId,
            request.documentType,
          );
        if (existing !== null) {
          throw new GenerationWorkflowError('DOCUMENT_ALREADY_EXISTS');
        }
        return { request, document: null };
      }

      const document = await this.dependencies.documents.findById(
        request.documentId,
      );
      if (
        document === null ||
        document.applicationId !== request.applicationId
      ) {
        throw new GenerationWorkflowError('DOCUMENT_NOT_FOUND');
      }
      if (!generationDocumentTypes.some((type) => type === document.type)) {
        throw new GenerationWorkflowError('INVALID_GENERATION_TARGET');
      }
      const documentType = document.type as GenerationDocumentType;
      if (documentType === 'COVER_LETTER') {
        const profile = requireCoverLetterProfile(request);
        return {
          request: {
            mode: request.mode,
            applicationId: request.applicationId,
            documentId: request.documentId,
            documentType,
            outputLanguage: profile.language,
            market: profile.market,
            sector: profile.sector,
          },
          document,
        };
      }
      if (hasProfileField(request)) {
        throw new GenerationWorkflowError('INVALID_GENERATION_REQUEST');
      }
      if (
        request.outputLanguage !== undefined &&
        request.outputLanguage !== 'en'
      ) {
        throw new GenerationWorkflowError('INVALID_OUTPUT_LANGUAGE');
      }
      return {
        request: {
          mode: request.mode,
          applicationId: request.applicationId,
          documentId: request.documentId,
          documentType,
          outputLanguage: 'en',
        },
        document,
      };
    } catch (error) {
      if (error instanceof GenerationWorkflowError) {
        throw error;
      }
      throw new GenerationWorkflowError('GENERATION_PERSISTENCE_FAILED', {
        cause: error,
      });
    }
  }

  private async generateContent(
    request: ResolvedGenerationDocumentRequest,
    required: RequiredSources,
    optional: OptionalSources,
    operationDate: Date,
  ): Promise<GeneratedContent> {
    const sources = {
      candidate: required.candidate,
      application: required.application,
      jobDescription: required.jobDescription,
      analysis: optional.analysis,
      research: optional.research,
    };
    try {
      switch (request.documentType) {
        case 'COVER_LETTER': {
          const specification = this.profileResolver.resolve({
            language: request.outputLanguage,
            market: request.market,
            sector: request.sector,
          });
          const context = this.contextBuilder.buildCoverLetter(
            sources,
            specification,
          );
          const template = await this.templateLoader.load(
            request.documentType,
            request.outputLanguage,
          );
          const llmRequest = this.coverLetterPromptBuilder.buildRequest(
            context,
            template,
          );
          const structured = await this.executeStructured(
            operationNames[request.documentType],
            llmRequest,
            coverLetterOutputSchema,
          );
          return {
            contentMarkdown: this.composeCoverLetter(
              context,
              structured.data,
              operationDate,
            ),
            context,
            template,
            promptVersion: this.coverLetterPromptBuilder.promptVersion,
            response: structured.response,
          };
        }
        case 'APPLICATION_BRIEF': {
          const context = this.contextBuilder.buildApplicationBrief(sources);
          const template = await this.templateLoader.load(
            request.documentType,
            request.outputLanguage,
          );
          const llmRequest = this.applicationBriefPromptBuilder.buildRequest(
            context,
            template,
          );
          const structured = await this.executeStructured(
            operationNames[request.documentType],
            llmRequest,
            applicationBriefOutputSchema,
          );
          return {
            contentMarkdown: this.composeApplicationBrief(
              context,
              structured.data,
            ),
            context,
            template,
            promptVersion: this.applicationBriefPromptBuilder.promptVersion,
            response: structured.response,
          };
        }
        case 'INTERVIEW_BRIEF': {
          const context = this.contextBuilder.buildInterviewBrief(sources);
          const template = await this.templateLoader.load(
            request.documentType,
            request.outputLanguage,
          );
          const llmRequest = this.interviewBriefPromptBuilder.buildRequest(
            context,
            template,
          );
          const structured = await this.executeStructured(
            operationNames[request.documentType],
            llmRequest,
            interviewBriefOutputSchema,
          );
          return {
            contentMarkdown: this.composeInterviewBrief(
              context,
              structured.data,
            ),
            context,
            template,
            promptVersion: this.interviewBriefPromptBuilder.promptVersion,
            response: structured.response,
          };
        }
      }
    } catch (error) {
      if (isExpectedGenerationError(error)) {
        throw error;
      }
      throw new GenerationWorkflowError('UNEXPECTED_GENERATION_FAILURE', {
        cause: error,
      });
    }
  }

  private async executeStructured<T>(
    operationName: GenerationOperationName,
    request: LlmRequest,
    runtimeSchema: ZodType<T>,
  ): Promise<{ readonly data: T; readonly response: LlmResponse }> {
    const responseFormat = request.responseFormat;
    if (responseFormat === undefined) {
      throw new GenerationWorkflowError('UNEXPECTED_GENERATION_FAILURE');
    }
    return generateStructured(this.dependencies.executor, {
      operationName,
      request: requestWithoutResponseFormat(request),
      responseFormat,
      runtimeSchema,
    });
  }

  private composeCoverLetter(
    context: CoverLetterGenerationContext,
    output: CoverLetterOutput,
    operationDate: Date,
  ): string {
    try {
      return this.coverLetterComposer.compose(context, output, {
        date: operationDate,
      });
    } catch (error) {
      throw new GenerationWorkflowError('GENERATION_COMPOSITION_FAILED', {
        cause: error,
      });
    }
  }

  private composeApplicationBrief(
    context: ApplicationBriefGenerationContext,
    output: ApplicationBriefOutput,
  ): string {
    try {
      return this.applicationBriefComposer.compose(context, output);
    } catch (error) {
      throw new GenerationWorkflowError('GENERATION_COMPOSITION_FAILED', {
        cause: error,
      });
    }
  }

  private composeInterviewBrief(
    context: InterviewBriefGenerationContext,
    output: InterviewBriefOutput,
  ): string {
    try {
      return this.interviewBriefComposer.compose(context, output);
    } catch (error) {
      throw new GenerationWorkflowError('GENERATION_COMPOSITION_FAILED', {
        cause: error,
      });
    }
  }

  private async persist(
    request: ResolvedGenerationDocumentRequest,
    application: Application,
    target: DocumentWithCurrentVersion | null,
    contentMarkdown: string,
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<DocumentWithCurrentVersion> {
    try {
      const persisted =
        request.mode === 'GENERATE'
          ? await this.dependencies.documents.create({
              candidateId: null,
              applicationId: application.id,
              type: request.documentType,
              title: `${titlePrefixes[request.documentType]} — ${application.companyName} — ${application.roleTitle}`,
              contentMarkdown,
              metadata,
            })
          : await this.dependencies.documents.createVersion(
              target?.id ?? request.documentId,
              { contentMarkdown, metadata },
            );
      if (persisted === null) {
        throw new GenerationWorkflowError('GENERATION_PERSISTENCE_FAILED');
      }
      return persisted;
    } catch (error) {
      if (error instanceof GenerationWorkflowError) {
        throw error;
      }
      throw new GenerationWorkflowError('GENERATION_PERSISTENCE_FAILED', {
        cause: error,
      });
    }
  }
}
