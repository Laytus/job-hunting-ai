import { describe, expect, it, vi } from 'vitest';
import type { Application } from '../application/application.types.js';
import type { CandidateAggregate } from '../candidate/candidate.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { AiUsageError } from '../llm/ai-usage.errors.js';
import { AiUsageGuard } from '../llm/ai-usage-guard.js';
import { AiUsageRecorder } from '../llm/ai-usage-recorder.js';
import { FakeLlmProvider } from '../llm/fake-llm-provider.js';
import { LlmProviderError } from '../llm/llm.errors.js';
import type { LlmExecutionOptions, LlmExecutor } from '../llm/tracked-llm.js';
import { TrackedLlmExecutor } from '../llm/tracked-llm.js';
import { AnalyzeContextBuilder } from './analyze-context-builder.js';
import { AnalyzeContextError } from './analyze-context.errors.js';
import {
  AnalysisAlreadyRunningError,
  AnalysisNotFoundError,
  AnalyzeApplicationNotFoundError,
  AnalyzePersistenceError,
  AnalyzeScoringError,
  JobAnalysisRunningConflictError,
} from './analyze.errors.js';
import { AnalyzePromptBuilder } from './analyze-prompt.js';
import type { AnalyzeOutput } from './analyze.schema.js';
import {
  AnalyzeService,
  type AnalyzeJobAnalysisPersistence,
  type AnalyzeServiceDependencies,
} from './analyze-service.js';
import type {
  CompleteJobAnalysisCommand,
  CreateRunningJobAnalysisCommand,
  FailJobAnalysisCommand,
  JobAnalysis,
} from './analyze.types.js';
import {
  ANALYZE_OPERATION_NAME,
  ANALYZE_PROMPT_VERSION,
} from './analyze.types.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const candidateId = '20000000-0000-4000-8000-000000000000';
const jobDescriptionId = '30000000-0000-4000-8000-000000000000';
const analysisId = '40000000-0000-4000-8000-000000000000';
const now = new Date('2026-08-25T12:00:00.000Z');

const validOutput: AnalyzeOutput = {
  roleSummary: 'Build backend systems.',
  fitSummary: 'Strong fit with a partial preference match.',
  requirements: [
    {
      requirement: 'TypeScript',
      importance: 'REQUIRED',
      matchStrength: 'STRONG',
      evidence: ['Built TypeScript services.'],
    },
    {
      requirement: 'PostgreSQL',
      importance: 'PREFERRED',
      matchStrength: 'PARTIAL',
      evidence: ['Used PostgreSQL in production.'],
    },
  ],
  candidateEvidence: [
    { claim: 'Backend experience', evidence: ['Built backend services.'] },
  ],
  strengths: ['TypeScript'],
  gaps: ['Limited database operations evidence'],
  keywords: ['TypeScript', 'PostgreSQL'],
  hardConstraints: [],
  warnings: [],
};

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: applicationId,
    companyName: 'Analytical Engines Ltd',
    roleTitle: 'Backend Engineer',
    location: 'Remote',
    jobUrl: 'https://jobs.example/backend',
    source: 'CAREER_PAGE',
    status: 'FOUND',
    priority: 'CRITICAL',
    dateFound: '2026-08-20',
    dateApplied: null,
    notesMarkdown: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function candidate(): CandidateAggregate {
  return {
    id: candidateId,
    fullName: 'Ada Lovelace',
    headline: 'Backend Engineer',
    summaryMarkdown: 'Builds dependable systems.',
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
    location: 'Santiago',
    targetRoles: ['Backend Engineer'],
    targetLocations: ['Remote'],
    careerGoalsMarkdown: null,
    cvMarkdown: null,
    additionalContext: null,
    createdAt: now,
    updatedAt: now,
    experiences: [],
    education: [],
    projects: [],
    skills: [],
    languages: [],
  };
}

function jobDescription(
  overrides: Partial<JobDescription> = {},
): JobDescription {
  return {
    id: jobDescriptionId,
    applicationId,
    title: 'Backend Engineer',
    companyName: 'Analytical Engines Ltd',
    descriptionMarkdown: 'Build TypeScript services.',
    requirementsMarkdown: 'TypeScript required. PostgreSQL preferred.',
    responsibilitiesMarkdown: null,
    structuredData: null,
    sourceUrl: 'https://jobs.example/backend',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function analysis(
  overrides: Partial<JobAnalysis> = {},
): JobAnalysis {
  return {
    id: analysisId,
    applicationId,
    status: 'RUNNING',
    analysisData: null,
    suggestedScore: null,
    failureCode: null,
    failureMessage: null,
    promptVersion: ANALYZE_PROMPT_VERSION,
    startedAt: now,
    completedAt: null,
    failedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class FakeAnalysisPersistence implements AnalyzeJobAnalysisPersistence {
  running: JobAnalysis | null = null;
  analysisToFind: JobAnalysis | null = analysis();
  latestCompleted: JobAnalysis | null = analysis({
    status: 'COMPLETED',
    analysisData: validOutput,
    suggestedScore: 91,
    completedAt: now,
  });
  analysesToList: JobAnalysis[] = [];
  createError: unknown;
  completeError: unknown;
  failError: unknown;
  completeResult: JobAnalysis | null | undefined;
  failResult: JobAnalysis | null | undefined;
  readonly createCommands: CreateRunningJobAnalysisCommand[] = [];
  readonly completeCalls: Array<{
    id: string;
    command: CompleteJobAnalysisCommand;
  }> = [];
  readonly failCalls: Array<{ id: string; command: FailJobAnalysisCommand }> = [];
  readonly findByIdCalls: string[] = [];
  readonly latestCompletedCalls: string[] = [];
  readonly listCalls: string[] = [];

  constructor(private readonly events?: string[]) {}

  async findRunningByApplicationId(): Promise<JobAnalysis | null> {
    this.events?.push('find-running');
    return this.running;
  }

  async findById(id: string): Promise<JobAnalysis | null> {
    this.findByIdCalls.push(id);
    return this.analysisToFind;
  }

  async findLatestCompletedByApplicationId(
    applicationIdToFind: string,
  ): Promise<JobAnalysis | null> {
    this.latestCompletedCalls.push(applicationIdToFind);
    return this.latestCompleted;
  }

  async listByApplicationId(applicationIdToList: string): Promise<JobAnalysis[]> {
    this.listCalls.push(applicationIdToList);
    return this.analysesToList;
  }

  async createRunning(
    command: CreateRunningJobAnalysisCommand,
  ): Promise<JobAnalysis> {
    this.events?.push('create-running');
    this.createCommands.push(command);
    if (this.createError !== undefined) {
      throw this.createError;
    }
    return analysis({
      applicationId: command.applicationId,
      promptVersion: command.promptVersion,
      startedAt: command.startedAt,
    });
  }

  async markCompleted(
    id: string,
    command: CompleteJobAnalysisCommand,
  ): Promise<JobAnalysis | null> {
    this.events?.push('mark-completed');
    this.completeCalls.push({ id, command });
    if (this.completeError !== undefined) {
      throw this.completeError;
    }
    if (this.completeResult !== undefined) {
      return this.completeResult;
    }
    return analysis({
      id,
      status: 'COMPLETED',
      analysisData: command.analysisData,
      suggestedScore: command.suggestedScore,
      completedAt: command.completedAt,
    });
  }

  async markFailed(
    id: string,
    command: FailJobAnalysisCommand,
  ): Promise<JobAnalysis | null> {
    this.events?.push('mark-failed');
    this.failCalls.push({ id, command });
    if (this.failError !== undefined) {
      throw this.failError;
    }
    if (this.failResult !== undefined) {
      return this.failResult;
    }
    return analysis({
      id,
      status: 'FAILED',
      failureCode: command.failureCode,
      failureMessage: command.failureMessage,
      failedAt: command.failedAt,
    });
  }
}

class RecordingExecutor implements LlmExecutor {
  readonly calls: LlmExecutionOptions[] = [];

  constructor(
    private readonly content = JSON.stringify(validOutput),
    private readonly error?: Error,
    private readonly events?: string[],
  ) {}

  async execute(options: LlmExecutionOptions) {
    this.events?.push('execute');
    this.calls.push(options);
    if (this.error !== undefined) {
      throw this.error;
    }
    return {
      content: this.content,
      model: 'fake-model',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    };
  }
}

function dependencies(
  overrides: Partial<AnalyzeServiceDependencies> = {},
): AnalyzeServiceDependencies {
  return {
    applications: { findById: async () => application() },
    candidates: { loadAggregate: async () => candidate() },
    jobDescriptions: { findByApplicationId: async () => jobDescription() },
    analyses: new FakeAnalysisPersistence(),
    contextBuilder: new AnalyzeContextBuilder(),
    promptBuilder: new AnalyzePromptBuilder(),
    executor: new RecordingExecutor(),
    config: { staleRunAfterMs: 600_000 },
    now: () => new Date(now),
    ...overrides,
  };
}

function trackedExecutor(options: {
  response?: string;
  providerError?: LlmProviderError;
  guardFails?: boolean;
  recorderFails?: boolean;
}) {
  const provider = new FakeLlmProvider({
    content: options.response ?? JSON.stringify(validOutput),
    model: 'fake-model',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  });
  if (options.providerError !== undefined) {
    provider.setError(options.providerError);
  }
  const usageCommands: unknown[] = [];
  const guard = new AiUsageGuard({
    getUsageForGuard: async () => {
      if (options.guardFails === true) {
        throw new Error('database unavailable');
      }
      return { recordedCalls: 0 };
    },
  });
  const recorder = new AiUsageRecorder({
    recordUsage: async (command) => {
      if (options.recorderFails === true) {
        throw new Error('database unavailable');
      }
      usageCommands.push(command);
      return {
        id: '50000000-0000-4000-8000-000000000000',
        ...command,
        createdAt: now,
      };
    },
  });

  return {
    executor: new TrackedLlmExecutor(provider, guard, recorder),
    provider,
    usageCommands,
  };
}

describe('AnalyzeService', () => {
  it('executes the complete workflow once and persists deterministic scoring', async () => {
    const events: string[] = [];
    const analyses = new FakeAnalysisPersistence(events);
    const executor = new RecordingExecutor(
      JSON.stringify(validOutput),
      undefined,
      events,
    );
    const originalApplication = application();
    const contextBuilder = new AnalyzeContextBuilder();
    const promptBuilder = new AnalyzePromptBuilder();
    const service = new AnalyzeService(
      dependencies({
        applications: {
          findById: async () => {
            events.push('load-application');
            return originalApplication;
          },
        },
        candidates: {
          loadAggregate: async () => {
            events.push('load-candidate');
            return candidate();
          },
        },
        jobDescriptions: {
          findByApplicationId: async () => {
            events.push('load-job-description');
            return jobDescription();
          },
        },
        analyses,
        executor,
        contextBuilder: {
          build: (sources) => {
            events.push('build-context');
            return contextBuilder.build(sources);
          },
        },
        promptBuilder: {
          buildRequest: (context) => {
            events.push('build-request');
            return promptBuilder.buildRequest(context);
          },
        },
        scorer: () => {
          events.push('score');
          return 91;
        },
      }),
    );

    const result = await service.analyzeApplication(applicationId);

    expect(result).toEqual({
      analysisId,
      applicationId,
      status: 'COMPLETED',
      output: validOutput,
      suggestedScore: 91,
      promptVersion: ANALYZE_PROMPT_VERSION,
    });
    expect(analyses.createCommands).toEqual([
      { applicationId, promptVersion: 'analyze-v1', startedAt: now },
    ]);
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]?.operationName).toBe(ANALYZE_OPERATION_NAME);
    expect(analyses.completeCalls[0]).toMatchObject({
      id: analysisId,
      command: { suggestedScore: 91, analysisData: validOutput },
    });
    expect(analyses.failCalls).toHaveLength(0);
    expect(originalApplication.priority).toBe('CRITICAL');
    expect(events).toEqual([
      'load-application',
      'load-candidate',
      'load-job-description',
      'build-context',
      'build-request',
      'find-running',
      'create-running',
      'execute',
      'score',
      'mark-completed',
    ]);
  });

  it('fails missing source preflight without a run or execution', async () => {
    const cases = [
      {
        override: { applications: { findById: async () => null } },
        error: AnalyzeApplicationNotFoundError,
      },
      {
        override: { candidates: { loadAggregate: async () => null } },
        error: AnalyzeContextError,
      },
      {
        override: {
          jobDescriptions: { findByApplicationId: async () => null },
        },
        error: AnalyzeContextError,
      },
      {
        override: {
          jobDescriptions: {
            findByApplicationId: async () =>
              jobDescription({
                applicationId: '90000000-0000-4000-8000-000000000000',
              }),
          },
        },
        error: AnalyzeContextError,
      },
    ] as const;

    for (const testCase of cases) {
      const analyses = new FakeAnalysisPersistence();
      const executor = new RecordingExecutor();
      const service = new AnalyzeService(
        dependencies({ ...testCase.override, analyses, executor }),
      );

      await expect(service.analyzeApplication(applicationId)).rejects.toBeInstanceOf(
        testCase.error,
      );
      expect(analyses.createCommands).toHaveLength(0);
      expect(executor.calls).toHaveLength(0);
    }
  });

  it('rejects a fresh active run just inside the stale threshold', async () => {
    const analyses = new FakeAnalysisPersistence();
    analyses.running = analysis({
      startedAt: new Date(now.getTime() - 599_999),
    });
    const executor = new RecordingExecutor();
    const service = new AnalyzeService(dependencies({ analyses, executor }));

    await expect(service.analyzeApplication(applicationId)).rejects.toBeInstanceOf(
      AnalysisAlreadyRunningError,
    );
    expect(analyses.createCommands).toHaveLength(0);
    expect(analyses.failCalls).toHaveLength(0);
    expect(executor.calls).toHaveLength(0);
  });

  it('recovers a run at the exact stale threshold before executing a new run', async () => {
    const analyses = new FakeAnalysisPersistence();
    analyses.running = analysis({
      id: '41000000-0000-4000-8000-000000000000',
      startedAt: new Date(now.getTime() - 600_000),
    });
    const executor = new RecordingExecutor();
    const service = new AnalyzeService(dependencies({ analyses, executor }));

    await expect(service.analyzeApplication(applicationId)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    expect(analyses.failCalls[0]).toEqual({
      id: '41000000-0000-4000-8000-000000000000',
      command: {
        failureCode: 'STALE_RUN_RECOVERED',
        failureMessage:
          'The previous Analyze execution exceeded the stale-run threshold.',
        failedAt: now,
      },
    });
    expect(analyses.createCommands).toHaveLength(1);
    expect(executor.calls).toHaveLength(1);
  });

  it('maps the database running-run race and never calls the executor', async () => {
    const analyses = new FakeAnalysisPersistence();
    analyses.createError = new JobAnalysisRunningConflictError();
    const executor = new RecordingExecutor();
    const service = new AnalyzeService(dependencies({ analyses, executor }));

    await expect(service.analyzeApplication(applicationId)).rejects.toBeInstanceOf(
      AnalysisAlreadyRunningError,
    );
    expect(executor.calls).toHaveLength(0);
  });

  it('fails closed when usage cannot be checked and marks the new run FAILED', async () => {
    const analyses = new FakeAnalysisPersistence();
    const tracked = trackedExecutor({ guardFails: true });
    const service = new AnalyzeService(
      dependencies({ analyses, executor: tracked.executor }),
    );

    await expect(service.analyzeApplication(applicationId)).rejects.toMatchObject({
      code: 'USAGE_CHECK_FAILED',
    });
    expect(tracked.provider.requests).toHaveLength(0);
    expect(analyses.failCalls[0]?.command.failureCode).toBe('USAGE_CHECK_FAILED');
    expect(analyses.completeCalls).toHaveLength(0);
  });

  it('does not retry or fabricate usage when the provider fails', async () => {
    const analyses = new FakeAnalysisPersistence();
    const providerError = new LlmProviderError('provider unavailable');
    const tracked = trackedExecutor({ providerError });
    const service = new AnalyzeService(
      dependencies({ analyses, executor: tracked.executor }),
    );

    await expect(service.analyzeApplication(applicationId)).rejects.toBe(
      providerError,
    );
    expect(tracked.provider.requests).toHaveLength(1);
    expect(tracked.usageCommands).toHaveLength(0);
    expect(analyses.failCalls[0]?.command.failureCode).toBe('LLM_PROVIDER_FAILED');
  });

  it('does not retry the provider when usage recording fails', async () => {
    const analyses = new FakeAnalysisPersistence();
    const tracked = trackedExecutor({ recorderFails: true });
    const service = new AnalyzeService(
      dependencies({ analyses, executor: tracked.executor }),
    );

    await expect(service.analyzeApplication(applicationId)).rejects.toMatchObject({
      code: 'USAGE_RECORDING_FAILED',
    });
    expect(tracked.provider.requests).toHaveLength(1);
    expect(analyses.failCalls[0]?.command.failureCode).toBe(
      'USAGE_RECORDING_FAILED',
    );
  });

  it.each([
    ['invalid JSON', '{ invalid json', 'INVALID_JSON'],
    [
      'schema-invalid JSON',
      JSON.stringify({ ...validOutput, roleSummary: 123 }),
      'SCHEMA_VALIDATION_FAILED',
    ],
  ])('marks the run FAILED for %s without scoring', async (_label, content, code) => {
    const analyses = new FakeAnalysisPersistence();
    const tracked = trackedExecutor({ response: content });
    const scorer = vi.fn(() => 50);
    const service = new AnalyzeService(
      dependencies({ analyses, executor: tracked.executor, scorer }),
    );

    await expect(service.analyzeApplication(applicationId)).rejects.toMatchObject({
      code,
    });
    expect(tracked.provider.requests).toHaveLength(1);
    expect(tracked.usageCommands).toHaveLength(1);
    expect(scorer).not.toHaveBeenCalled();
    expect(analyses.failCalls[0]?.command.failureCode).toBe(code);
    expect(analyses.completeCalls).toHaveLength(0);
  });

  it('completes successfully with a null score when no requirement is evaluable', async () => {
    const output: AnalyzeOutput = {
      ...validOutput,
      requirements: [
        {
          requirement: 'Unclear requirement',
          importance: 'UNKNOWN',
          matchStrength: 'UNKNOWN',
          evidence: [],
        },
      ],
    };
    const analyses = new FakeAnalysisPersistence();
    const service = new AnalyzeService(
      dependencies({
        analyses,
        executor: new RecordingExecutor(JSON.stringify(output)),
      }),
    );

    await expect(service.analyzeApplication(applicationId)).resolves.toMatchObject({
      status: 'COMPLETED',
      suggestedScore: null,
    });
    expect(analyses.completeCalls[0]?.command.suggestedScore).toBeNull();
  });

  it('marks the run FAILED when deterministic scoring unexpectedly fails', async () => {
    const analyses = new FakeAnalysisPersistence();
    const executor = new RecordingExecutor();
    const service = new AnalyzeService(
      dependencies({
        analyses,
        executor,
        scorer: () => {
          throw new Error('scoring defect');
        },
      }),
    );

    await expect(service.analyzeApplication(applicationId)).rejects.toBeInstanceOf(
      AnalyzeScoringError,
    );
    expect(executor.calls).toHaveLength(1);
    expect(analyses.failCalls[0]?.command.failureCode).toBe('SCORING_FAILED');
    expect(analyses.completeCalls).toHaveLength(0);
  });

  it('surfaces completion persistence failure without retrying or marking failed', async () => {
    const analyses = new FakeAnalysisPersistence();
    analyses.completeError = new Error('database unavailable');
    const executor = new RecordingExecutor();
    const service = new AnalyzeService(dependencies({ analyses, executor }));

    await expect(service.analyzeApplication(applicationId)).rejects.toBeInstanceOf(
      AnalyzePersistenceError,
    );
    expect(executor.calls).toHaveLength(1);
    expect(analyses.completeCalls).toHaveLength(1);
    expect(analyses.failCalls).toHaveLength(0);
  });

  it('surfaces failure persistence errors without retrying or recursing', async () => {
    const analyses = new FakeAnalysisPersistence();
    analyses.failError = new Error('database unavailable');
    const executor = new RecordingExecutor(
      JSON.stringify(validOutput),
      new LlmProviderError('provider unavailable'),
    );
    const service = new AnalyzeService(dependencies({ analyses, executor }));

    await expect(service.analyzeApplication(applicationId)).rejects.toBeInstanceOf(
      AnalyzePersistenceError,
    );
    expect(executor.calls).toHaveLength(1);
    expect(analyses.failCalls).toHaveLength(1);
    expect(analyses.completeCalls).toHaveLength(0);
  });

  it('validates stale configuration at construction', () => {
    expect(
      () =>
        new AnalyzeService(
          dependencies({ config: { staleRunAfterMs: Number.NaN } }),
        ),
    ).toThrow(RangeError);
  });

  it('preserves explicit usage errors from the executor', async () => {
    const error = new AiUsageError('USAGE_NOT_ALLOWED');
    const analyses = new FakeAnalysisPersistence();
    const service = new AnalyzeService(
      dependencies({ analyses, executor: new RecordingExecutor('', error) }),
    );

    await expect(service.analyzeApplication(applicationId)).rejects.toBe(error);
    expect(analyses.failCalls[0]?.command.failureCode).toBe('USAGE_NOT_ALLOWED');
  });

  it('returns side-effect-free history for an existing Application', async () => {
    const analyses = new FakeAnalysisPersistence();
    analyses.analysesToList = [analysis(), analysis({ id: crypto.randomUUID() })];
    const executor = new RecordingExecutor();
    const service = new AnalyzeService(dependencies({ analyses, executor }));

    await expect(service.getAnalyses(applicationId)).resolves.toEqual(
      analyses.analysesToList,
    );
    expect(analyses.listCalls).toEqual([applicationId]);
    expect(executor.calls).toHaveLength(0);
    expect(analyses.createCommands).toHaveLength(0);
  });

  it('returns detail only when the Job Analysis belongs to the Application', async () => {
    const analyses = new FakeAnalysisPersistence();
    const service = new AnalyzeService(dependencies({ analyses }));

    await expect(service.getAnalysis(applicationId, analysisId)).resolves.toEqual(
      analyses.analysisToFind,
    );
    analyses.analysisToFind = analysis({
      applicationId: '90000000-0000-4000-8000-000000000000',
    });
    await expect(
      service.getAnalysis(applicationId, analysisId),
    ).rejects.toBeInstanceOf(AnalysisNotFoundError);
    analyses.analysisToFind = null;
    await expect(
      service.getAnalysis(applicationId, analysisId),
    ).rejects.toBeInstanceOf(AnalysisNotFoundError);
  });

  it('uses the explicit latest-completed repository semantic', async () => {
    const analyses = new FakeAnalysisPersistence();
    const service = new AnalyzeService(dependencies({ analyses }));

    await expect(
      service.getLatestCompletedAnalysis(applicationId),
    ).resolves.toEqual(analyses.latestCompleted);
    expect(analyses.latestCompletedCalls).toEqual([applicationId]);

    analyses.latestCompleted = null;
    await expect(
      service.getLatestCompletedAnalysis(applicationId),
    ).rejects.toBeInstanceOf(AnalysisNotFoundError);
  });

  it('rejects read operations for a missing Application before querying history', async () => {
    const analyses = new FakeAnalysisPersistence();
    const service = new AnalyzeService(
      dependencies({
        applications: { findById: async () => null },
        analyses,
      }),
    );

    await expect(service.getAnalyses(applicationId)).rejects.toBeInstanceOf(
      AnalyzeApplicationNotFoundError,
    );
    expect(analyses.listCalls).toHaveLength(0);
  });
});
