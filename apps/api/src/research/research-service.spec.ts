import { describe, expect, it, vi } from 'vitest';
import type { Application } from '../application/application.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { AiUsageGuard } from '../llm/ai-usage-guard.js';
import { AiUsageRecorder } from '../llm/ai-usage-recorder.js';
import { FakeLlmProvider } from '../llm/fake-llm-provider.js';
import { LlmProviderError } from '../llm/llm.errors.js';
import type { LlmExecutionOptions, LlmExecutor } from '../llm/tracked-llm.js';
import { TrackedLlmExecutor } from '../llm/tracked-llm.js';
import { ResearchContextBuilder } from './research-context-builder.js';
import { ResearchContextError } from './research-context.errors.js';
import {
  ResearchAlreadyRunningError,
  ResearchNotFoundError,
  ResearchPersistenceError,
  ResearchRunningConflictError,
  ResearchValidationError,
} from './research.errors.js';
import { ResearchGraphValidator } from './research-graph-validator.js';
import { ResearchPromptBuilder } from './research-prompt.js';
import type { ResearchOutput } from './research.schema.js';
import {
  RESEARCH_STALE_AFTER_MS,
  ResearchService,
  type ResearchPersistence,
  type ResearchServiceDependencies,
} from './research-service.js';
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

const applicationId = '10000000-0000-4000-8000-000000000000';
const jobDescriptionId = '20000000-0000-4000-8000-000000000000';
const researchId = '30000000-0000-4000-8000-000000000000';
const oldResearchId = '40000000-0000-4000-8000-000000000000';
const researchDate = new Date('2026-08-26T10:00:00.000Z');
const retrievedAt = new Date('2026-08-26T10:00:03.000Z');
const completedAt = new Date('2026-08-26T10:00:04.000Z');
const failedAt = new Date('2026-08-26T10:00:05.000Z');

const structuredValue = {
  amount: null,
  amountMin: null,
  amountMax: null,
  currency: null,
  period: null,
  location: null,
  role: null,
  seniority: null,
  dataYear: null,
  stageOrder: null,
  frequency: null,
} as const;

const validOutput: ResearchOutput = {
  summaryMarkdown: '## Company\n\nAnalytical Engines builds computing systems.',
  sources: [
    {
      id: 'official',
      url: 'https://example.com/about',
      title: 'About Analytical Engines',
      publisher: 'Analytical Engines',
      sourceType: 'OFFICIAL',
      sourceQuality: 'HIGH',
      publishedAt: '2026-08-01',
    },
    {
      id: 'report',
      url: 'https://news.example.com/company',
      title: 'Company report',
      publisher: 'Example News',
      sourceType: 'NEWS',
      sourceQuality: 'MEDIUM',
      publishedAt: '2026-08-10',
    },
  ],
  claims: [
    {
      id: 'company',
      type: 'COMPANY_DESCRIPTION',
      valueText: 'The company builds computing systems.',
      valueJson: structuredValue,
      evidenceType: 'FACT',
      sourceLinks: [
        {
          sourceId: 'official',
          relationship: 'SUPPORTS',
          evidenceText: 'The official page describes its computing systems.',
        },
      ],
    },
  ],
  warnings: [],
};

const validatedGraph: ValidatedResearchGraph = {
  summaryMarkdown: validOutput.summaryMarkdown,
  warnings: [],
  sources: [
    {
      key: 'official',
      url: 'https://example.com/about',
      normalizedUrl: 'https://example.com/about',
      title: 'About Analytical Engines',
      publisher: 'Analytical Engines',
      sourceType: 'OFFICIAL',
      sourceQuality: 'HIGH',
      publishedAt: '2026-08-01',
      independenceGroup: 'example.com',
    },
    {
      key: 'report',
      url: 'https://news.example.com/company',
      normalizedUrl: 'https://news.example.com/company',
      title: 'Company report',
      publisher: 'Example News',
      sourceType: 'NEWS',
      sourceQuality: 'MEDIUM',
      publishedAt: '2026-08-10',
      independenceGroup: 'news.example.com',
    },
  ],
  claims: [
    {
      key: 'company',
      type: 'COMPANY_DESCRIPTION',
      valueText: 'The company builds computing systems.',
      valueJson: structuredValue,
      evidenceType: 'FACT',
      confidence: 'HIGH',
    },
  ],
  relationships: [
    {
      claimKey: 'company',
      sourceKey: 'official',
      relationship: 'SUPPORTS',
      evidenceText: 'The official page describes its computing systems.',
    },
  ],
};

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: applicationId,
    companyName: 'Analytical Engines Ltd',
    roleTitle: 'Research Engineer',
    location: 'Paris',
    jobUrl: 'https://jobs.example/research-engineer',
    source: 'CAREER_PAGE',
    status: 'FOUND',
    priority: 'HIGH',
    dateFound: '2026-08-20',
    dateApplied: null,
    notesMarkdown: null,
    createdAt: researchDate,
    updatedAt: researchDate,
    ...overrides,
  };
}

function jobDescription(
  overrides: Partial<JobDescription> = {},
): JobDescription {
  return {
    id: jobDescriptionId,
    applicationId,
    title: 'Research Engineer',
    companyName: 'Analytical Engines Ltd',
    descriptionMarkdown: 'Research and build computing systems.',
    requirementsMarkdown: 'TypeScript and distributed systems.',
    responsibilitiesMarkdown: null,
    structuredData: null,
    sourceUrl: 'https://jobs.example/research-engineer',
    createdAt: researchDate,
    updatedAt: researchDate,
    ...overrides,
  };
}

function research(overrides: Partial<Research> = {}): Research {
  return {
    id: researchId,
    applicationId,
    status: 'RUNNING',
    summaryMarkdown: null,
    warnings: [],
    promptVersion: RESEARCH_PROMPT_VERSION,
    researchDate,
    failureCode: null,
    failureMessage: null,
    startedAt: researchDate,
    completedAt: null,
    failedAt: null,
    createdAt: researchDate,
    updatedAt: researchDate,
    ...overrides,
  };
}

function aggregate(
  command: CompleteResearchGraphCommand,
  overrides: Partial<ResearchAggregate> = {},
): ResearchAggregate {
  return {
    ...research({
      status: 'COMPLETED',
      summaryMarkdown: command.summaryMarkdown,
      warnings: command.warnings,
      completedAt: command.completedAt,
    }),
    sources: command.sources.map((source, index) => ({
      id: `50000000-0000-4000-8000-00000000000${index}`,
      researchId,
      url: source.url,
      normalizedUrl: source.normalizedUrl,
      title: source.title,
      publisher: source.publisher,
      sourceType: source.sourceType,
      sourceQuality: source.sourceQuality,
      publishedAt: source.publishedAt,
      retrievedAt: source.retrievedAt,
      notes: source.notes,
      createdAt: command.completedAt,
    })),
    claims: command.claims.map((claim, index) => ({
      id: `60000000-0000-4000-8000-00000000000${index}`,
      researchId,
      type: claim.type,
      valueText: claim.valueText,
      valueJson: claim.valueJson,
      evidenceType: claim.evidenceType,
      confidence: claim.confidence,
      notes: claim.notes,
      createdAt: command.completedAt,
    })),
    relationships: command.relationships.map((relationship) => ({
      researchId,
      claimId: '60000000-0000-4000-8000-000000000000',
      sourceId: '50000000-0000-4000-8000-000000000000',
      relationship: relationship.relationship,
      evidenceText: relationship.evidenceText,
    })),
    ...overrides,
  };
}

class FakeResearchPersistence implements ResearchPersistence {
  running: Research | null = null;
  researchToFind: ResearchAggregate | null = null;
  latestCompleted: Research | null = null;
  researchesToList: Research[] = [];
  createError: unknown;
  failError: unknown;
  completeError: unknown;
  findError: unknown;
  latestError: unknown;
  listError: unknown;
  failResult: Research | null | undefined;
  completeResult: ResearchAggregate | null | undefined;
  readonly createCommands: CreateRunningResearchCommand[] = [];
  readonly failCalls: Array<{ id: string; command: FailResearchCommand }> = [];
  readonly completeCalls: Array<{
    id: string;
    command: CompleteResearchGraphCommand;
  }> = [];
  readonly findCalls: string[] = [];
  readonly latestCalls: string[] = [];
  readonly listCalls: string[] = [];

  constructor(private readonly events?: string[]) {}

  async findRunningByApplicationId(): Promise<Research | null> {
    this.events?.push('find-running');
    return this.running;
  }

  async findById(id: string): Promise<ResearchAggregate | null> {
    this.findCalls.push(id);
    if (this.findError !== undefined) {
      throw this.findError;
    }
    return this.researchToFind;
  }

  async findLatestCompletedByApplicationId(
    applicationIdToFind: string,
  ): Promise<Research | null> {
    this.latestCalls.push(applicationIdToFind);
    if (this.latestError !== undefined) {
      throw this.latestError;
    }
    return this.latestCompleted;
  }

  async listByApplicationId(applicationIdToList: string): Promise<Research[]> {
    this.listCalls.push(applicationIdToList);
    if (this.listError !== undefined) {
      throw this.listError;
    }
    return this.researchesToList;
  }

  async createRunning(command: CreateRunningResearchCommand): Promise<Research> {
    this.events?.push('create-running');
    this.createCommands.push(command);
    if (this.createError !== undefined) {
      throw this.createError;
    }
    return research({
      applicationId: command.applicationId,
      researchDate: command.researchDate,
      startedAt: command.startedAt,
      promptVersion: command.promptVersion ?? null,
    });
  }

  async markFailed(
    id: string,
    command: FailResearchCommand,
  ): Promise<Research | null> {
    this.events?.push('mark-failed');
    this.failCalls.push({ id, command });
    if (this.failError !== undefined) {
      throw this.failError;
    }
    if (this.failResult !== undefined) {
      return this.failResult;
    }
    return research({
      id,
      status: 'FAILED',
      failureCode: command.failureCode,
      failureMessage: command.failureMessage,
      failedAt: command.failedAt,
    });
  }

  async persistCompletedGraph(
    id: string,
    command: CompleteResearchGraphCommand,
  ): Promise<ResearchAggregate | null> {
    this.events?.push('persist-completed');
    this.completeCalls.push({ id, command });
    if (this.completeError !== undefined) {
      throw this.completeError;
    }
    if (this.completeResult !== undefined) {
      return this.completeResult;
    }
    return aggregate(command, { id });
  }
}

class RecordingExecutor implements LlmExecutor {
  readonly calls: LlmExecutionOptions[] = [];

  constructor(
    private readonly response = JSON.stringify(validOutput),
    private readonly error?: Error,
    private readonly events?: string[],
    private readonly webSources: readonly { readonly url: string }[] =
      validOutput.sources.map(({ url }) => ({ url })),
  ) {}

  async execute(options: LlmExecutionOptions) {
    this.events?.push('execute');
    this.calls.push(options);
    if (this.error !== undefined) {
      throw this.error;
    }
    return {
      content: this.response,
      model: 'fake-model',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      webSources: this.webSources,
    };
  }
}

class RecordingValidator {
  readonly inputs: ResearchValidationInput[] = [];

  constructor(
    private readonly result: ValidatedResearchGraph = validatedGraph,
    private readonly error?: Error,
    private readonly events?: string[],
  ) {}

  validate(input: ResearchValidationInput): ValidatedResearchGraph {
    this.events?.push('validate');
    this.inputs.push(input);
    if (this.error !== undefined) {
      throw this.error;
    }
    return this.result;
  }
}

function fixedClock(...dates: readonly Date[]): () => Date {
  let index = 0;
  return () => new Date(dates[Math.min(index++, dates.length - 1)] ?? researchDate);
}

function dependencies(
  overrides: Partial<ResearchServiceDependencies> = {},
): ResearchServiceDependencies {
  return {
    applications: { findById: async () => application() },
    jobDescriptions: { findByApplicationId: async () => jobDescription() },
    researches: new FakeResearchPersistence(),
    contextBuilder: new ResearchContextBuilder(),
    promptBuilder: new ResearchPromptBuilder(),
    executor: new RecordingExecutor(),
    validator: new RecordingValidator(),
    now: fixedClock(researchDate, retrievedAt, completedAt, failedAt),
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
    webSources: validOutput.sources.map(({ url }) => ({ url })),
  });
  provider.setError(options.providerError ?? null);
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
        id: '70000000-0000-4000-8000-000000000000',
        ...command,
        createdAt: researchDate,
      };
    },
  });

  return {
    executor: new TrackedLlmExecutor(provider, guard, recorder),
    provider,
    usageCommands,
  };
}

describe('ResearchService', () => {
  it('executes one tracked request and persists the validated graph with deterministic time', async () => {
    const events: string[] = [];
    const researches = new FakeResearchPersistence(events);
    const executor = new RecordingExecutor(
      JSON.stringify(validOutput),
      undefined,
      events,
    );
    const validator = new RecordingValidator(validatedGraph, undefined, events);
    const contextBuilder = new ResearchContextBuilder();
    const promptBuilder = new ResearchPromptBuilder();
    const service = new ResearchService(
      dependencies({
        applications: {
          findById: async () => {
            events.push('load-application');
            return application();
          },
        },
        jobDescriptions: {
          findByApplicationId: async () => {
            events.push('load-job-description');
            return jobDescription();
          },
        },
        researches,
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
        executor,
        validator,
      }),
    );

    const result = await service.researchApplication(applicationId);

    expect(result.status).toBe('COMPLETED');
    expect(researches.createCommands).toEqual([
      {
        applicationId,
        researchDate,
        startedAt: researchDate,
        promptVersion: RESEARCH_PROMPT_VERSION,
      },
    ]);
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]).toMatchObject({
      operationName: RESEARCH_OPERATION_NAME,
      request: { tools: [{ type: 'web_search' }] },
    });
    expect(validator.inputs).toEqual([
      {
        output: {
          ...validOutput,
          sources: [validOutput.sources[0]],
        },
        providerWebSources: validOutput.sources.map(({ url }) => ({ url })),
        researchDate,
      },
    ]);
    expect(researches.completeCalls).toHaveLength(1);
    expect(researches.completeCalls[0]?.command.sources).toHaveLength(2);
    expect(
      researches.completeCalls[0]?.command.sources.every(
        (source) => source.retrievedAt.getTime() === retrievedAt.getTime(),
      ),
    ).toBe(true);
    expect(researches.completeCalls[0]?.command.completedAt).toEqual(completedAt);
    expect(researches.failCalls).toHaveLength(0);
    expect(events).toEqual([
      'load-application',
      'load-job-description',
      'build-context',
      'find-running',
      'create-running',
      'build-request',
      'execute',
      'validate',
      'persist-completed',
    ]);
  });

  it.each([
    ['Application unavailable', null, jobDescription()],
    ['Job Description unavailable', application(), null],
    [
      'invalid source ownership',
      application(),
      jobDescription({
        applicationId: '90000000-0000-4000-8000-000000000000',
      }),
    ],
  ])('rejects %s during preflight without side effects', async (_label, app, jd) => {
    const researches = new FakeResearchPersistence();
    const executor = new RecordingExecutor();
    const service = new ResearchService(
      dependencies({
        applications: { findById: async () => app },
        jobDescriptions: { findByApplicationId: async () => jd },
        researches,
        executor,
      }),
    );

    await expect(service.researchApplication(applicationId)).rejects.toBeInstanceOf(
      ResearchContextError,
    );
    expect(researches.createCommands).toHaveLength(0);
    expect(researches.completeCalls).toHaveLength(0);
    expect(executor.calls).toHaveLength(0);
  });

  it('rejects a fresh RUNNING row one millisecond inside the stale boundary', async () => {
    const researches = new FakeResearchPersistence();
    researches.running = research({
      startedAt: new Date(researchDate.getTime() - RESEARCH_STALE_AFTER_MS + 1),
    });
    const executor = new RecordingExecutor();
    const service = new ResearchService(dependencies({ researches, executor }));

    await expect(service.researchApplication(applicationId)).rejects.toBeInstanceOf(
      ResearchAlreadyRunningError,
    );
    expect(researches.failCalls).toHaveLength(0);
    expect(researches.createCommands).toHaveLength(0);
    expect(executor.calls).toHaveLength(0);
  });

  it.each([RESEARCH_STALE_AFTER_MS, RESEARCH_STALE_AFTER_MS + 1])(
    'recovers a RUNNING row at age %i ms before starting one new execution',
    async (ageMs) => {
      const researches = new FakeResearchPersistence();
      researches.running = research({
        id: oldResearchId,
        startedAt: new Date(researchDate.getTime() - ageMs),
      });
      const executor = new RecordingExecutor();
      const service = new ResearchService(dependencies({ researches, executor }));

      await expect(service.researchApplication(applicationId)).resolves.toMatchObject({
        status: 'COMPLETED',
      });
      expect(researches.failCalls[0]).toEqual({
        id: oldResearchId,
        command: {
          failureCode: 'STALE_RUN_RECOVERED',
          failureMessage:
            'The previous Research execution exceeded the stale-run threshold.',
          failedAt: researchDate,
        },
      });
      expect(researches.createCommands).toHaveLength(1);
      expect(executor.calls).toHaveLength(1);
    },
  );

  it('aborts when stale recovery cannot be persisted', async () => {
    const researches = new FakeResearchPersistence();
    researches.running = research({
      id: oldResearchId,
      startedAt: new Date(researchDate.getTime() - RESEARCH_STALE_AFTER_MS),
    });
    researches.failError = new Error('database unavailable');
    const executor = new RecordingExecutor();
    const service = new ResearchService(dependencies({ researches, executor }));

    await expect(service.researchApplication(applicationId)).rejects.toBeInstanceOf(
      ResearchPersistenceError,
    );
    expect(researches.createCommands).toHaveLength(0);
    expect(executor.calls).toHaveLength(0);
  });

  it('maps the createRunning race without executing or retrying', async () => {
    const researches = new FakeResearchPersistence();
    researches.createError = new ResearchRunningConflictError();
    const executor = new RecordingExecutor();
    const service = new ResearchService(dependencies({ researches, executor }));

    await expect(service.researchApplication(applicationId)).rejects.toBeInstanceOf(
      ResearchAlreadyRunningError,
    );
    expect(researches.createCommands).toHaveLength(1);
    expect(executor.calls).toHaveLength(0);
  });

  it.each([
    ['usage guard rejection', { guardFails: true }, 'USAGE_CHECK_FAILED', 0],
    [
      'provider failure',
      { providerError: new LlmProviderError('provider secret') },
      'LLM_PROVIDER_FAILED',
      1,
    ],
    ['usage recording failure', { recorderFails: true }, 'USAGE_RECORDING_FAILED', 1],
    ['invalid JSON', { response: '{ invalid' }, 'INVALID_JSON', 1],
    [
      'schema validation failure',
      { response: JSON.stringify({ ...validOutput, sources: 'invalid' }) },
      'SCHEMA_VALIDATION_FAILED',
      1,
    ],
  ] as const)(
    'marks the run FAILED for %s with no second provider call',
    async (_label, options, expectedCode, providerCalls) => {
      const researches = new FakeResearchPersistence();
      const tracked = trackedExecutor(options);
      const service = new ResearchService(
        dependencies({ researches, executor: tracked.executor }),
      );

      const execution = service.researchApplication(applicationId);
      if (expectedCode === 'LLM_PROVIDER_FAILED') {
        await expect(execution).rejects.toBeInstanceOf(LlmProviderError);
      } else {
        await expect(execution).rejects.toMatchObject({ code: expectedCode });
      }
      expect(tracked.provider.requests).toHaveLength(providerCalls);
      expect(researches.failCalls[0]?.command.failureCode).toBe(expectedCode);
      expect(researches.completeCalls).toHaveLength(0);
    },
  );

  it('persists a provenance validation failure without retrying the provider', async () => {
    const researches = new FakeResearchPersistence();
    const executor = new RecordingExecutor();
    const error = new ResearchValidationError(
      'UNVERIFIED_RESEARCH_SOURCE',
      'SOURCE_NOT_REPORTED_BY_PROVIDER',
    );
    const validator = new RecordingValidator(validatedGraph, error);
    const service = new ResearchService(
      dependencies({ researches, executor, validator }),
    );

    await expect(service.researchApplication(applicationId)).rejects.toBe(error);
    expect(executor.calls).toHaveLength(1);
    expect(researches.failCalls[0]?.command.failureCode).toBe(
      'UNVERIFIED_RESEARCH_SOURCE',
    );
    expect(researches.completeCalls).toHaveLength(0);
  });

  it('preserves a non-provenance graph validation error', async () => {
    const researches = new FakeResearchPersistence();
    const error = new ResearchValidationError(
      'INVALID_RESEARCH_CLAIM',
      'INVALID_COMPENSATION_AMOUNT',
    );
    const service = new ResearchService(
      dependencies({
        researches,
        validator: new RecordingValidator(validatedGraph, error),
      }),
    );

    await expect(service.researchApplication(applicationId)).rejects.toBe(error);
    expect(researches.failCalls[0]?.command.failureCode).toBe(
      'INVALID_RESEARCH_CLAIM',
    );
    expect(researches.completeCalls).toHaveLength(0);
  });

  it('marks the run FAILED when atomic graph persistence fails', async () => {
    const researches = new FakeResearchPersistence();
    researches.completeError = new Error('transaction failed');
    const executor = new RecordingExecutor();
    const service = new ResearchService(dependencies({ researches, executor }));

    await expect(service.researchApplication(applicationId)).rejects.toBeInstanceOf(
      ResearchPersistenceError,
    );
    expect(executor.calls).toHaveLength(1);
    expect(researches.completeCalls).toHaveLength(1);
    expect(researches.failCalls[0]?.command.failureCode).toBe(
      'RESEARCH_PERSISTENCE_FAILED',
    );
  });

  it('matches Analyze double-failure semantics when markFailed also fails', async () => {
    const researches = new FakeResearchPersistence();
    researches.failError = new Error('failure transition failed');
    const executor = new RecordingExecutor(
      JSON.stringify(validOutput),
      new LlmProviderError('provider failed'),
    );
    const service = new ResearchService(dependencies({ researches, executor }));

    await expect(service.researchApplication(applicationId)).rejects.toBeInstanceOf(
      ResearchPersistenceError,
    );
    expect(executor.calls).toHaveLength(1);
    expect(researches.failCalls).toHaveLength(1);
    expect(researches.completeCalls).toHaveLength(0);
  });

  it('uses the real validator with exact provider provenance in the service path', async () => {
    const researches = new FakeResearchPersistence();
    const executor = new RecordingExecutor();
    const service = new ResearchService(
      dependencies({
        researches,
        executor,
        validator: new ResearchGraphValidator(),
      }),
    );

    await expect(service.researchApplication(applicationId)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
    expect(executor.calls).toHaveLength(1);
    expect(researches.completeCalls).toHaveLength(1);
  });

  it('H — projects unverified raw sources before validation and persistence', async () => {
    const unverifiedSource = {
      ...validOutput.sources[1]!,
      id: 'unverified',
      url: 'https://news.example.com/unverified',
    };
    const mixedOutput: ResearchOutput = {
      ...validOutput,
      sources: [validOutput.sources[0]!, unverifiedSource],
      claims: [
        {
          ...validOutput.claims[0]!,
          sourceLinks: [
            validOutput.claims[0]!.sourceLinks[0]!,
            {
              sourceId: unverifiedSource.id,
              relationship: 'SUPPORTS',
              evidenceText: 'Unverified evidence.',
            },
          ],
        },
      ],
    };
    const providerWebSources = [{ url: validOutput.sources[0]!.url }];
    const executor = new RecordingExecutor(
      JSON.stringify(mixedOutput),
      undefined,
      undefined,
      providerWebSources,
    );
    const validatorInputs: ResearchValidationInput[] = [];
    const realValidator = new ResearchGraphValidator();
    const researches = new FakeResearchPersistence();
    const service = new ResearchService(
      dependencies({
        executor,
        researches,
        validator: {
          validate: (input) => {
            validatorInputs.push(input);
            return realValidator.validate(input);
          },
        },
      }),
    );

    await expect(service.researchApplication(applicationId)).resolves.toMatchObject({
      status: 'COMPLETED',
    });

    expect(validatorInputs[0]?.output.sources.map(({ id }) => id)).toEqual([
      'official',
    ]);
    expect(validatorInputs[0]?.output.claims[0]?.sourceLinks).toHaveLength(1);
    expect(researches.completeCalls[0]?.command.sources.map(({ key }) => key)).toEqual(
      ['official'],
    );
    expect(
      researches.completeCalls[0]?.command.relationships.map(({ sourceKey }) =>
        sourceKey,
      ),
    ).toEqual(['official']);
  });

  it('completes and persists a sparse no-evidence result with one execution', async () => {
    const sparseOutput: ResearchOutput = {
      summaryMarkdown: 'Unsupported model-authored detail.',
      sources: [],
      claims: [],
      warnings: [],
    };
    const researches = new FakeResearchPersistence();
    const executor = new RecordingExecutor(JSON.stringify(sparseOutput));
    const service = new ResearchService(
      dependencies({
        researches,
        executor,
        validator: new ResearchGraphValidator(),
      }),
    );

    const result = await service.researchApplication(applicationId);

    expect(result).toMatchObject({
      status: 'COMPLETED',
      summaryMarkdown:
        'No reliable external Research findings were available for this opportunity.',
      warnings: [
        'NO_RELIABLE_COMPENSATION_DATA',
        'INSUFFICIENT_ROLE_SPECIFIC_DATA',
      ],
      sources: [],
      claims: [],
      relationships: [],
    });
    expect(executor.calls).toHaveLength(1);
    expect(researches.completeCalls).toHaveLength(1);
    expect(researches.failCalls).toHaveLength(0);
  });

  it('fails closed when stale markFailed returns null', async () => {
    const researches = new FakeResearchPersistence();
    researches.running = research({
      id: oldResearchId,
      startedAt: new Date(researchDate.getTime() - RESEARCH_STALE_AFTER_MS),
    });
    researches.failResult = null;
    const executor = new RecordingExecutor();
    const service = new ResearchService(dependencies({ researches, executor }));

    await expect(service.researchApplication(applicationId)).rejects.toBeInstanceOf(
      ResearchPersistenceError,
    );
    expect(executor.calls).toHaveLength(0);
  });

  it('does not expose provider error details in persisted failure metadata', async () => {
    const researches = new FakeResearchPersistence();
    const providerError = new LlmProviderError('secret provider payload');
    const service = new ResearchService(
      dependencies({
        researches,
        executor: new RecordingExecutor(JSON.stringify(validOutput), providerError),
      }),
    );

    await expect(service.researchApplication(applicationId)).rejects.toBe(
      providerError,
    );
    expect(researches.failCalls[0]?.command).toMatchObject({
      failureCode: 'LLM_PROVIDER_FAILED',
      failureMessage: 'The LLM provider could not complete the research.',
    });
  });

  it('wraps source repository reads before any Research lifecycle mutation', async () => {
    const researches = new FakeResearchPersistence();
    const executor = new RecordingExecutor();
    const service = new ResearchService(
      dependencies({
        applications: {
          findById: async () => {
            throw new Error('database unavailable');
          },
        },
        researches,
        executor,
      }),
    );

    await expect(service.researchApplication(applicationId)).rejects.toBeInstanceOf(
      ResearchPersistenceError,
    );
    expect(researches.createCommands).toHaveLength(0);
    expect(executor.calls).toHaveLength(0);
  });

  it('fails the run when the prompt builder omits structured output', async () => {
    const researches = new FakeResearchPersistence();
    const executor = new RecordingExecutor();
    const service = new ResearchService(
      dependencies({
        researches,
        executor,
        promptBuilder: { buildRequest: () => ({ messages: [] }) },
      }),
    );

    await expect(service.researchApplication(applicationId)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESEARCH_FAILURE',
    });
    expect(executor.calls).toHaveLength(0);
    expect(researches.failCalls[0]?.command.failureCode).toBe(
      'UNEXPECTED_RESEARCH_FAILURE',
    );
  });

  it('does not accept a null completion aggregate', async () => {
    const researches = new FakeResearchPersistence();
    researches.completeResult = null;
    const executor = new RecordingExecutor();
    const service = new ResearchService(dependencies({ researches, executor }));

    await expect(service.researchApplication(applicationId)).rejects.toBeInstanceOf(
      ResearchPersistenceError,
    );
    expect(executor.calls).toHaveLength(1);
    expect(researches.completeCalls).toHaveLength(1);
    expect(researches.failCalls).toHaveLength(1);
  });

  it('does not use a wall clock when all lifecycle times are injected', async () => {
    const now = vi.fn(
      fixedClock(researchDate, retrievedAt, completedAt, failedAt),
    );
    const researches = new FakeResearchPersistence();
    const service = new ResearchService(dependencies({ researches, now }));

    await service.researchApplication(applicationId);

    expect(now).toHaveBeenCalledTimes(3);
    expect(researches.createCommands[0]?.researchDate).toEqual(researchDate);
    expect(researches.completeCalls[0]?.command.sources[0]?.retrievedAt).toEqual(
      retrievedAt,
    );
  });

  it('returns Research history in repository order without execution or graph loading', async () => {
    const researches = new FakeResearchPersistence();
    researches.researchesToList = [
      research({ id: oldResearchId, status: 'FAILED' }),
      research(),
    ];
    const executor = new RecordingExecutor();
    const service = new ResearchService(dependencies({ researches, executor }));

    await expect(service.getResearches(applicationId)).resolves.toEqual(
      researches.researchesToList,
    );
    expect(researches.listCalls).toEqual([applicationId]);
    expect(researches.findCalls).toEqual([]);
    expect(executor.calls).toEqual([]);
  });

  it('returns owned detail and hides missing or cross-Application Research', async () => {
    const researches = new FakeResearchPersistence();
    const detail = aggregate({
      summaryMarkdown: 'Summary',
      warnings: [],
      promptVersion: RESEARCH_PROMPT_VERSION,
      completedAt,
      sources: [],
      claims: [],
      relationships: [],
    });
    researches.researchToFind = detail;
    const service = new ResearchService(dependencies({ researches }));

    await expect(service.getResearch(applicationId, researchId)).resolves.toBe(
      detail,
    );

    researches.researchToFind = {
      ...detail,
      applicationId: '90000000-0000-4000-8000-000000000000',
    };
    await expect(
      service.getResearch(applicationId, researchId),
    ).rejects.toBeInstanceOf(ResearchNotFoundError);

    researches.researchToFind = null;
    await expect(
      service.getResearch(applicationId, researchId),
    ).rejects.toBeInstanceOf(ResearchNotFoundError);
  });

  it('resolves latest-completed metadata to the canonical aggregate', async () => {
    const researches = new FakeResearchPersistence();
    const detail = aggregate({
      summaryMarkdown: 'Summary',
      warnings: [],
      promptVersion: RESEARCH_PROMPT_VERSION,
      completedAt,
      sources: [],
      claims: [],
      relationships: [],
    });
    researches.latestCompleted = detail;
    researches.researchToFind = detail;
    const service = new ResearchService(dependencies({ researches }));

    await expect(
      service.getLatestCompletedResearch(applicationId),
    ).resolves.toBe(detail);
    expect(researches.latestCalls).toEqual([applicationId]);
    expect(researches.findCalls).toEqual([researchId]);

    researches.latestCompleted = null;
    await expect(
      service.getLatestCompletedResearch(applicationId),
    ).rejects.toBeInstanceOf(ResearchNotFoundError);
  });

  it('rejects reads for an unavailable parent Application before repository access', async () => {
    const researches = new FakeResearchPersistence();
    const executor = new RecordingExecutor();
    const service = new ResearchService(
      dependencies({
        applications: { findById: async () => null },
        researches,
        executor,
      }),
    );

    await expect(service.getResearches(applicationId)).rejects.toMatchObject({
      code: 'APPLICATION_UNAVAILABLE',
    });
    expect(researches.listCalls).toEqual([]);
    expect(executor.calls).toEqual([]);
  });

  it('wraps Research read persistence failures safely', async () => {
    const researches = new FakeResearchPersistence();
    researches.listError = new Error('database secret');
    const service = new ResearchService(dependencies({ researches }));

    await expect(service.getResearches(applicationId)).rejects.toBeInstanceOf(
      ResearchPersistenceError,
    );
  });
});
