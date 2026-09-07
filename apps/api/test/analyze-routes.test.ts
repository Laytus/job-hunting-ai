import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { AnalyzeContextError } from '../src/analyze/analyze-context.errors.js';
import {
  AnalysisAlreadyRunningError,
  AnalysisNotFoundError,
  AnalyzeApplicationNotFoundError,
  AnalyzePersistenceError,
  AnalyzeScoringError,
  UnexpectedAnalyzeFailureError,
} from '../src/analyze/analyze.errors.js';
import type { AnalyzeRouteService } from '../src/analyze/analyze.routes.js';
import type { AnalyzeOutput } from '../src/analyze/analyze.schema.js';
import type {
  AnalyzeExecutionResult,
  JobAnalysis,
} from '../src/analyze/analyze.types.js';
import { AiUsageError } from '../src/llm/ai-usage.errors.js';
import { LlmProviderError } from '../src/llm/llm.errors.js';
import { StructuredLlmError } from '../src/llm/structured-llm.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const otherApplicationId = '11000000-0000-4000-8000-000000000000';
const analysisId = '20000000-0000-4000-8000-000000000000';
const timestamp = new Date('2026-08-25T12:00:00.000Z');
const apps: ReturnType<typeof buildApp>[] = [];

const output: AnalyzeOutput = {
  roleSummary: 'Build backend systems.',
  fitSummary: 'Strong fit.',
  requirements: [
    {
      requirement: 'TypeScript',
      importance: 'REQUIRED',
      matchStrength: 'STRONG',
      evidence: ['Built TypeScript services.'],
    },
  ],
  candidateEvidence: [
    { claim: 'Backend experience', evidence: ['Built backend services.'] },
  ],
  strengths: ['TypeScript'],
  gaps: [],
  keywords: ['TypeScript'],
  hardConstraints: [],
  warnings: [],
};

function jobAnalysis(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return {
    id: analysisId,
    applicationId,
    status: 'COMPLETED',
    analysisData: output,
    suggestedScore: 100,
    failureCode: null,
    failureMessage: null,
    promptVersion: 'analyze-v1',
    startedAt: timestamp,
    completedAt: new Date('2026-08-25T12:00:30.000Z'),
    failedAt: null,
    createdAt: timestamp,
    updatedAt: new Date('2026-08-25T12:00:30.000Z'),
    ...overrides,
  };
}

function serialized(analysis: JobAnalysis) {
  return {
    id: analysis.id,
    applicationId: analysis.applicationId,
    status: analysis.status,
    suggestedScore: analysis.suggestedScore,
    failureCode: analysis.failureCode,
    failureMessage: analysis.failureMessage,
    promptVersion: analysis.promptVersion,
    startedAt: analysis.startedAt.toISOString(),
    completedAt: analysis.completedAt?.toISOString() ?? null,
    failedAt: analysis.failedAt?.toISOString() ?? null,
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
    analysisData: analysis.analysisData,
  };
}

class FakeAnalyzeService implements AnalyzeRouteService {
  execution: AnalyzeExecutionResult = {
    analysisId,
    applicationId,
    status: 'COMPLETED',
    output,
    suggestedScore: 100,
    promptVersion: 'analyze-v1',
  };
  analysisToGet = jobAnalysis();
  analysesToGet: JobAnalysis[] = [];
  latestCompleted = jobAnalysis();
  analyzeError: unknown;
  getError: unknown;
  listError: unknown;
  latestError: unknown;
  readonly analyzeCalls: string[] = [];
  readonly getCalls: Array<{ applicationId: string; analysisId: string }> = [];
  readonly listCalls: string[] = [];
  readonly latestCalls: string[] = [];

  async analyzeApplication(id: string): Promise<AnalyzeExecutionResult> {
    this.analyzeCalls.push(id);
    if (this.analyzeError !== undefined) throw this.analyzeError;
    return this.execution;
  }

  async getAnalysis(appId: string, runId: string): Promise<JobAnalysis> {
    this.getCalls.push({ applicationId: appId, analysisId: runId });
    if (this.getError !== undefined) throw this.getError;
    return this.analysisToGet;
  }

  async getAnalyses(id: string): Promise<JobAnalysis[]> {
    this.listCalls.push(id);
    if (this.listError !== undefined) throw this.listError;
    return this.analysesToGet;
  }

  async getLatestCompletedAnalysis(id: string): Promise<JobAnalysis> {
    this.latestCalls.push(id);
    if (this.latestError !== undefined) throw this.latestError;
    return this.latestCompleted;
  }
}

function buildAnalyzeApp(service: AnalyzeRouteService) {
  const app = buildApp({ analyzeService: service });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('Analyze API routes', () => {
  it('executes Analyze synchronously and returns the full completed resource', async () => {
    const service = new FakeAnalyzeService();
    const response = await buildAnalyzeApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/analyze`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(
      `/api/v1/applications/${applicationId}/analyses/${analysisId}`,
    );
    expect(response.json()).toEqual(serialized(service.analysisToGet));
    expect(service.analyzeCalls).toEqual([applicationId]);
    expect(service.getCalls).toEqual([{ applicationId, analysisId }]);
    expect(response.body).not.toContain('provider');
    expect(response.body).not.toContain('usage');
    expect(response.body).not.toContain('promptBody');
  });

  it('returns 201 when the deterministic score is null', async () => {
    const service = new FakeAnalyzeService();
    service.analysisToGet = jobAnalysis({ suggestedScore: null });
    service.execution = {
      ...service.execution,
      suggestedScore: null,
    };

    const response = await buildAnalyzeApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/analyze`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().suggestedScore).toBeNull();
  });

  it('rejects HTTP-owned provider/model overrides', async () => {
    const service = new FakeAnalyzeService();
    const response = await buildAnalyzeApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/analyze`,
      payload: { model: 'client-model', provider: 'client-provider' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
    });
    expect(service.analyzeCalls).toEqual([]);
  });

  it('rejects malformed Application and Job Analysis UUIDs before service calls', async () => {
    const service = new FakeAnalyzeService();
    const app = buildAnalyzeApp(service);

    const execute = await app.inject({
      method: 'POST',
      url: '/api/v1/applications/not-a-uuid/analyze',
    });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/analyses/not-a-uuid`,
    });

    for (const response of [execute, detail]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: 'INVALID_IDENTIFIER' },
      });
    }
    expect(service.analyzeCalls).toEqual([]);
    expect(service.getCalls).toEqual([]);
  });

  it('maps missing Applications and active runs through centralized metadata', async () => {
    const service = new FakeAnalyzeService();
    const app = buildAnalyzeApp(service);

    service.analyzeError = new AnalyzeApplicationNotFoundError();
    const missing = await app.inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/analyze`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: {
        code: 'APPLICATION_NOT_FOUND',
        message: 'The Application was not found.',
      },
    });

    service.analyzeError = new AnalysisAlreadyRunningError();
    const active = await app.inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/analyze`,
    });
    expect(active.statusCode).toBe(409);
    expect(active.json()).toEqual({
      error: {
        code: 'ANALYSIS_ALREADY_RUNNING',
        message: 'An Analyze run is already in progress for this Application.',
      },
    });
  });

  it.each([
    'CANDIDATE_PROFILE_UNAVAILABLE',
    'JOB_DESCRIPTION_UNAVAILABLE',
    'INVALID_SOURCE_CONTEXT',
  ] as const)('maps %s source preflight failure to 409', async (code) => {
    const service = new FakeAnalyzeService();
    service.analyzeError = new AnalyzeContextError(code);

    const response = await buildAnalyzeApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/analyze`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code } });
  });

  it.each([
    {
      label: 'provider failure',
      error: new LlmProviderError('private upstream payload'),
      code: 'LLM_PROVIDER_FAILED',
    },
    {
      label: 'invalid JSON',
      error: new StructuredLlmError('INVALID_JSON'),
      code: 'INVALID_JSON',
    },
    {
      label: 'schema validation',
      error: new StructuredLlmError('SCHEMA_VALIDATION_FAILED'),
      code: 'SCHEMA_VALIDATION_FAILED',
    },
  ])('maps $label to a safe 502 response', async ({ error, code }) => {
    const service = new FakeAnalyzeService();
    service.analyzeError = error;
    const response = await buildAnalyzeApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/analyze`,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code } });
    expect(response.body).not.toContain('private upstream payload');
    expect(response.body).not.toContain('stack');
  });

  it.each([
    'USAGE_METADATA_UNAVAILABLE',
    'USAGE_CHECK_FAILED',
    'USAGE_RECORDING_FAILED',
  ] as const)('maps %s usage infrastructure failure to 503', async (code) => {
    const service = new FakeAnalyzeService();
    service.analyzeError = new AiUsageError(code);
    const response = await buildAnalyzeApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/analyze`,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code, message: 'AI usage infrastructure is unavailable.' },
    });
  });

  it('maps an explicit usage denial to 429', async () => {
    const service = new FakeAnalyzeService();
    service.analyzeError = new AiUsageError('USAGE_NOT_ALLOWED');
    const response = await buildAnalyzeApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/analyze`,
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: { code: 'USAGE_NOT_ALLOWED' },
    });
  });

  it.each([
    new AnalyzePersistenceError({ cause: new Error('database secret') }),
    new AnalyzeScoringError({ cause: new Error('scoring internals') }),
    new UnexpectedAnalyzeFailureError({ cause: new Error('stack detail') }),
  ])('maps internal workflow failures safely', async (error) => {
    const service = new FakeAnalyzeService();
    service.analyzeError = error;
    const response = await buildAnalyzeApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/analyze`,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: error.code } });
    expect(response.body).not.toContain('secret');
    expect(response.body).not.toContain('internals');
    expect(response.body).not.toContain('stack detail');
  });

  it('returns compact history in service-provided order and supports an empty list', async () => {
    const service = new FakeAnalyzeService();
    const newest = jobAnalysis({ id: '30000000-0000-4000-8000-000000000000' });
    const failed = jobAnalysis({
      id: '25000000-0000-4000-8000-000000000000',
      status: 'FAILED',
      analysisData: null,
      suggestedScore: null,
      failureCode: 'LLM_PROVIDER_FAILED',
      failureMessage: 'The LLM provider could not complete the analysis.',
      completedAt: null,
      failedAt: timestamp,
    });
    const running = jobAnalysis({
      id: '20000000-0000-4000-8000-000000000000',
      status: 'RUNNING',
      analysisData: null,
      suggestedScore: null,
      completedAt: null,
    });
    service.analysesToGet = [newest, failed, running];
    const app = buildAnalyzeApp(service);

    const populated = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/analyses`,
    });
    expect(populated.statusCode).toBe(200);
    expect(populated.json().items.map((item: { id: string }) => item.id)).toEqual(
      service.analysesToGet.map(({ id }) => id),
    );
    expect(populated.json().items).toHaveLength(3);
    expect(populated.json().items[0]).not.toHaveProperty('analysisData');

    service.analysesToGet = [];
    const empty = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/analyses`,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ items: [] });
  });

  it('distinguishes a missing Application from empty history', async () => {
    const service = new FakeAnalyzeService();
    service.listError = new AnalyzeApplicationNotFoundError();
    const response = await buildAnalyzeApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/analyses`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'APPLICATION_NOT_FOUND' },
    });
  });

  it.each([
    jobAnalysis(),
    jobAnalysis({
      status: 'FAILED',
      analysisData: null,
      suggestedScore: null,
      failureCode: 'INVALID_JSON',
      failureMessage: 'The LLM response was not valid JSON.',
      completedAt: null,
      failedAt: timestamp,
    }),
    jobAnalysis({
      status: 'RUNNING',
      analysisData: null,
      suggestedScore: null,
      completedAt: null,
    }),
  ])('returns full detail for $status state', async (analysis) => {
    const service = new FakeAnalyzeService();
    service.analysisToGet = analysis;
    const response = await buildAnalyzeApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/analyses/${analysisId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(serialized(analysis));
  });

  it('returns ANALYSIS_NOT_FOUND for unknown or cross-Application detail', async () => {
    for (const requestedApplicationId of [applicationId, otherApplicationId]) {
      const service = new FakeAnalyzeService();
      service.getError = new AnalysisNotFoundError();
      const response = await buildAnalyzeApp(service).inject({
        method: 'GET',
        url: `/api/v1/applications/${requestedApplicationId}/analyses/${analysisId}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'ANALYSIS_NOT_FOUND',
          message: 'The Job Analysis was not found.',
        },
      });
      expect(response.body).not.toContain(analysisId);
    }
  });

  it('returns the explicit latest completed resource and handles no completed run', async () => {
    const service = new FakeAnalyzeService();
    service.latestCompleted = jobAnalysis({
      id: '30000000-0000-4000-8000-000000000000',
    });
    service.analysesToGet = [
      jobAnalysis({
        id: '50000000-0000-4000-8000-000000000000',
        status: 'RUNNING',
        analysisData: null,
        suggestedScore: null,
        completedAt: null,
      }),
      jobAnalysis({
        id: '40000000-0000-4000-8000-000000000000',
        status: 'FAILED',
        analysisData: null,
        suggestedScore: null,
        failureCode: 'INVALID_JSON',
        failureMessage: 'The LLM response was not valid JSON.',
        completedAt: null,
        failedAt: timestamp,
      }),
    ];
    const app = buildAnalyzeApp(service);

    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/analyses/latest-completed`,
    });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual(serialized(service.latestCompleted));
    expect(service.latestCalls).toEqual([applicationId]);
    expect(service.listCalls).toEqual([]);

    service.latestError = new AnalysisNotFoundError();
    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/analyses/latest-completed`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      error: { code: 'ANALYSIS_NOT_FOUND' },
    });
  });

  it('keeps app construction and health independent from database and OpenAI config', async () => {
    const originalDatabaseUrl = process.env['DATABASE_URL'];
    const originalApiKey = process.env['OPENAI_API_KEY'];
    delete process.env['DATABASE_URL'];
    delete process.env['OPENAI_API_KEY'];
    const app = buildApp();
    apps.push(app);

    try {
      const response = await app.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env['DATABASE_URL'];
      else process.env['DATABASE_URL'] = originalDatabaseUrl;
      if (originalApiKey === undefined) delete process.env['OPENAI_API_KEY'];
      else process.env['OPENAI_API_KEY'] = originalApiKey;
    }
  });
});
