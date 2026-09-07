import Fastify, { type FastifyInstance } from 'fastify';
import { AnalyzeContextBuilder } from './analyze/analyze-context-builder.js';
import { loadAnalyzeConfig } from './analyze/analyze.config.js';
import { AnalyzePromptBuilder } from './analyze/analyze-prompt.js';
import {
  analyzeRoutes,
  type AnalyzeRouteService,
} from './analyze/analyze.routes.js';
import { AnalyzeService } from './analyze/analyze-service.js';
import { JobAnalysisRepository } from './analyze/job-analysis.repository.js';
import { ApplicationEventRepository } from './application-event/application-event.repository.js';
import {
  applicationEventRoutes,
  type ApplicationEventRouteService,
} from './application-event/application-event.routes.js';
import { ApplicationEventService } from './application-event/application-event.service.js';
import { ApplicationRepository } from './application/application.repository.js';
import {
  applicationRoutes,
  type ApplicationRouteService,
} from './application/application.routes.js';
import { ApplicationService } from './application/application.service.js';
import { CandidateProfileRepository } from './candidate/candidate.repository.js';
import {
  candidateRoutes,
  type CandidateService,
} from './candidate/candidate.routes.js';
import { CandidateProfileService } from './candidate/candidate.service.js';
import { closeDatabase, getDatabase, type Database } from './db/index.js';
import { DocumentRepository } from './document/document.repository.js';
import {
  documentRoutes,
  type DocumentRouteService,
} from './document/document.routes.js';
import { DocumentService } from './document/document.service.js';
import { registerErrorHandler } from './http/errors.js';
import type { ServerDateSource } from './http/server-date.js';
import {
  generationRoutes,
  type GenerationRouteService,
} from './generation/generation.routes.js';
import { GenerationService } from './generation/generation-service.js';
import { JobDescriptionRepository } from './job-description/job-description.repository.js';
import {
  jobDescriptionRoutes,
  type JobDescriptionRouteService,
} from './job-description/job-description.routes.js';
import { JobDescriptionService } from './job-description/job-description.service.js';
import { InterviewRepository } from './interview/interview.repository.js';
import {
  interviewRoutes,
  type InterviewRouteService,
} from './interview/interview.routes.js';
import { InterviewService } from './interview/interview.service.js';
import { AiUsageGuard } from './llm/ai-usage-guard.js';
import { AiUsageRecorder } from './llm/ai-usage-recorder.js';
import { AiUsageRepository } from './llm/ai-usage.repository.js';
import { loadLlmConfig } from './llm/llm.config.js';
import { OpenAiLlmProvider } from './llm/openai-llm-provider.js';
import type { LlmExecutor } from './llm/tracked-llm.js';
import { TrackedLlmExecutor } from './llm/tracked-llm.js';
import { ResearchContextBuilder } from './research/research-context-builder.js';
import { ResearchGraphValidator } from './research/research-graph-validator.js';
import { ResearchPromptBuilder } from './research/research-prompt.js';
import { ResearchRepository } from './research/research.repository.js';
import {
  researchRoutes,
  type ResearchRouteService,
} from './research/research.routes.js';
import { ResearchService } from './research/research-service.js';

declare module 'fastify' {
  interface FastifyInstance {
    readonly resolveDatabase: () => Database;
    readonly currentDate: ServerDateSource;
  }
}

export function buildApp(
  {
    database,
    analyzeService,
    applicationService,
    applicationEventService,
    candidateService,
    documentService,
    generationService,
    jobDescriptionService,
    interviewService,
    researchService,
    logger = false,
    currentDate = () => new Date(),
  }: {
    readonly database?: Database;
    readonly analyzeService?: AnalyzeRouteService;
    readonly applicationService?: ApplicationRouteService;
    readonly applicationEventService?: ApplicationEventRouteService;
    readonly candidateService?: CandidateService;
    readonly documentService?: DocumentRouteService;
    readonly generationService?: GenerationRouteService;
    readonly jobDescriptionService?: JobDescriptionRouteService;
    readonly interviewService?: InterviewRouteService;
    readonly researchService?: ResearchRouteService;
    readonly logger?: boolean;
    readonly currentDate?: ServerDateSource;
  } = {},
): FastifyInstance {
  const app = Fastify({
    logger,
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
      },
    },
  });
  const resolveDatabase = (): Database => database ?? getDatabase();
  let resolvedAnalyzeExecutor: LlmExecutor | undefined;
  const lazyAnalyzeExecutor: LlmExecutor = {
    execute: (executionOptions) => {
      if (resolvedAnalyzeExecutor === undefined) {
        const usageRepository = new AiUsageRepository(resolveDatabase());
        resolvedAnalyzeExecutor = new TrackedLlmExecutor(
          new OpenAiLlmProvider(loadLlmConfig()),
          new AiUsageGuard(usageRepository),
          new AiUsageRecorder(usageRepository),
        );
      }
      return resolvedAnalyzeExecutor.execute(executionOptions);
    },
  };
  let resolvedAnalyzeService = analyzeService;
  const resolveAnalyzeService = (): AnalyzeRouteService => {
    if (resolvedAnalyzeService === undefined) {
      const resolvedDatabase = resolveDatabase();
      resolvedAnalyzeService = new AnalyzeService({
        applications: new ApplicationRepository(resolvedDatabase),
        candidates: new CandidateProfileRepository(resolvedDatabase),
        jobDescriptions: new JobDescriptionRepository(resolvedDatabase),
        analyses: new JobAnalysisRepository(resolvedDatabase),
        contextBuilder: new AnalyzeContextBuilder(),
        promptBuilder: new AnalyzePromptBuilder(),
        executor: lazyAnalyzeExecutor,
        config: loadAnalyzeConfig(),
      });
    }
    return resolvedAnalyzeService;
  };
  let resolvedResearchExecutor: LlmExecutor | undefined;
  const lazyResearchExecutor: LlmExecutor = {
    execute: (executionOptions) => {
      if (resolvedResearchExecutor === undefined) {
        const usageRepository = new AiUsageRepository(resolveDatabase());
        resolvedResearchExecutor = new TrackedLlmExecutor(
          new OpenAiLlmProvider(loadLlmConfig()),
          new AiUsageGuard(usageRepository),
          new AiUsageRecorder(usageRepository),
        );
      }
      return resolvedResearchExecutor.execute(executionOptions);
    },
  };
  let resolvedResearchService = researchService;
  const resolveResearchService = (): ResearchRouteService => {
    if (resolvedResearchService === undefined) {
      const resolvedDatabase = resolveDatabase();
      resolvedResearchService = new ResearchService({
        applications: new ApplicationRepository(resolvedDatabase),
        jobDescriptions: new JobDescriptionRepository(resolvedDatabase),
        researches: new ResearchRepository(resolvedDatabase),
        contextBuilder: new ResearchContextBuilder(),
        promptBuilder: new ResearchPromptBuilder(),
        executor: lazyResearchExecutor,
        validator: new ResearchGraphValidator(),
      });
    }
    return resolvedResearchService;
  };
  let resolvedGenerationExecutor: LlmExecutor | undefined;
  const lazyGenerationExecutor: LlmExecutor = {
    execute: (executionOptions) => {
      if (resolvedGenerationExecutor === undefined) {
        const usageRepository = new AiUsageRepository(resolveDatabase());
        resolvedGenerationExecutor = new TrackedLlmExecutor(
          new OpenAiLlmProvider(loadLlmConfig()),
          new AiUsageGuard(usageRepository),
          new AiUsageRecorder(usageRepository),
        );
      }
      return resolvedGenerationExecutor.execute(executionOptions);
    },
  };
  let resolvedGenerationService = generationService;
  const resolveGenerationService = (): GenerationRouteService => {
    if (resolvedGenerationService === undefined) {
      const resolvedDatabase = resolveDatabase();
      resolvedGenerationService = new GenerationService({
        applications: new ApplicationRepository(resolvedDatabase),
        candidates: new CandidateProfileRepository(resolvedDatabase),
        jobDescriptions: new JobDescriptionRepository(resolvedDatabase),
        analyses: new JobAnalysisRepository(resolvedDatabase),
        researches: new ResearchRepository(resolvedDatabase),
        documents: new DocumentRepository(resolvedDatabase),
        executor: lazyGenerationExecutor,
        now: currentDate,
      });
    }
    return resolvedGenerationService;
  };
  let resolvedApplicationService = applicationService;
  const resolveApplicationService = (): ApplicationRouteService => {
    resolvedApplicationService ??= new ApplicationService(
      new ApplicationRepository(resolveDatabase()),
      currentDate,
    );
    return resolvedApplicationService;
  };
  let resolvedApplicationEventService = applicationEventService;
  const resolveApplicationEventService = (): ApplicationEventRouteService => {
    resolvedApplicationEventService ??= new ApplicationEventService(
      new ApplicationEventRepository(resolveDatabase()),
    );
    return resolvedApplicationEventService;
  };
  let resolvedCandidateService = candidateService;
  const resolveCandidateService = (): CandidateService => {
    resolvedCandidateService ??= new CandidateProfileService(
      new CandidateProfileRepository(resolveDatabase()),
    );
    return resolvedCandidateService;
  };
  let resolvedDocumentService = documentService;
  const resolveDocumentService = (): DocumentRouteService => {
    resolvedDocumentService ??= new DocumentService(
      new DocumentRepository(resolveDatabase()),
    );
    return resolvedDocumentService;
  };
  let resolvedJobDescriptionService = jobDescriptionService;
  const resolveJobDescriptionService = (): JobDescriptionRouteService => {
    resolvedJobDescriptionService ??= new JobDescriptionService(
      new JobDescriptionRepository(resolveDatabase()),
      currentDate,
    );
    return resolvedJobDescriptionService;
  };
  let resolvedInterviewService = interviewService;
  const resolveInterviewService = (): InterviewRouteService => {
    resolvedInterviewService ??= new InterviewService(
      new InterviewRepository(resolveDatabase()),
      currentDate,
    );
    return resolvedInterviewService;
  };

  app.decorate('resolveDatabase', resolveDatabase);
  app.decorate('currentDate', currentDate);

  if (database === undefined) {
    app.addHook('onClose', async () => closeDatabase());
  }

  app.get('/api/health', async () => ({ status: 'ok' }));
  registerErrorHandler(app);
  void app.register(candidateRoutes, {
    prefix: '/api/v1',
    resolveCandidateService,
  });
  void app.register(analyzeRoutes, {
    prefix: '/api/v1',
    resolveAnalyzeService,
  });
  void app.register(researchRoutes, {
    prefix: '/api/v1',
    resolveResearchService,
  });
  void app.register(generationRoutes, {
    prefix: '/api/v1',
    resolveGenerationService,
  });
  void app.register(documentRoutes, {
    prefix: '/api/v1',
    resolveDocumentService,
  });
  void app.register(applicationRoutes, {
    prefix: '/api/v1',
    resolveApplicationService,
  });
  void app.register(applicationEventRoutes, {
    prefix: '/api/v1',
    resolveApplicationEventService,
  });
  void app.register(jobDescriptionRoutes, {
    prefix: '/api/v1',
    resolveJobDescriptionService,
  });
  void app.register(interviewRoutes, {
    prefix: '/api/v1',
    resolveInterviewService,
  });

  return app;
}
