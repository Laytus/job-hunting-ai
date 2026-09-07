import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { AiUsageError } from '../src/llm/ai-usage.errors.js';
import { LlmProviderError } from '../src/llm/llm.errors.js';
import { StructuredLlmError } from '../src/llm/structured-llm.js';
import { ResearchContextError } from '../src/research/research-context.errors.js';
import {
  ResearchAlreadyRunningError,
  ResearchNotFoundError,
  ResearchPersistenceError,
  ResearchValidationError,
  UnexpectedResearchFailureError,
} from '../src/research/research.errors.js';
import type { ResearchRouteService } from '../src/research/research.routes.js';
import type {
  Research,
  ResearchAggregate,
} from '../src/research/research.types.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const otherApplicationId = '11000000-0000-4000-8000-000000000000';
const researchId = '20000000-0000-4000-8000-000000000000';
const sourceId = '30000000-0000-4000-8000-000000000000';
const contradictingSourceId = '31000000-0000-4000-8000-000000000000';
const claimId = '40000000-0000-4000-8000-000000000000';
const timestamp = new Date('2026-08-27T10:00:00.000Z');
const completedAt = new Date('2026-08-27T10:01:00.000Z');
const apps: ReturnType<typeof buildApp>[] = [];

function research(overrides: Partial<Research> = {}): Research {
  return {
    id: researchId,
    applicationId,
    status: 'COMPLETED',
    summaryMarkdown: '## Research\n\nEvidence-backed findings.',
    warnings: ['CONFLICTING_SALARY_DATA'],
    promptVersion: 'research-v1',
    researchDate: timestamp,
    failureCode: null,
    failureMessage: null,
    startedAt: timestamp,
    completedAt,
    failedAt: null,
    createdAt: timestamp,
    updatedAt: completedAt,
    ...overrides,
  };
}

function aggregate(overrides: Partial<ResearchAggregate> = {}): ResearchAggregate {
  return {
    ...research(),
    sources: [
      {
        id: sourceId,
        researchId,
        url: 'https://example.com/company?view=research',
        normalizedUrl: 'https://example.com/company?view=research',
        title: 'Company research',
        publisher: 'Example',
        sourceType: 'OFFICIAL',
        sourceQuality: 'HIGH',
        publishedAt: '2026-08-20',
        retrievedAt: completedAt,
        notes: null,
        createdAt: completedAt,
      },
      {
        id: contradictingSourceId,
        researchId,
        url: 'https://reports.example.net/company',
        normalizedUrl: 'https://reports.example.net/company',
        title: 'Independent report',
        publisher: 'Reports Example',
        sourceType: 'NEWS',
        sourceQuality: 'MEDIUM',
        publishedAt: null,
        retrievedAt: completedAt,
        notes: 'Independent evidence.',
        createdAt: completedAt,
      },
    ],
    claims: [
      {
        id: claimId,
        researchId,
        type: 'SALARY_BASE',
        valueText: null,
        valueJson: {
          amount: 85_000,
          currency: 'EUR',
          period: 'YEAR',
          location: 'Paris',
          role: 'Research Engineer',
        },
        evidenceType: 'REPORTED',
        confidence: 'MEDIUM',
        notes: null,
        createdAt: completedAt,
      },
    ],
    relationships: [
      {
        researchId,
        claimId,
        sourceId,
        relationship: 'SUPPORTS',
        evidenceText: 'The official source reports this range.',
      },
      {
        researchId,
        claimId,
        sourceId: contradictingSourceId,
        relationship: 'CONTRADICTS',
        evidenceText: 'The independent report gives a different range.',
      },
    ],
    ...overrides,
  };
}

function serializedSummary(value: Research) {
  return {
    id: value.id,
    applicationId: value.applicationId,
    status: value.status,
    promptVersion: value.promptVersion,
    researchDate: value.researchDate.toISOString(),
    failureCode: value.failureCode,
    failureMessage: value.failureMessage,
    startedAt: value.startedAt.toISOString(),
    completedAt: value.completedAt?.toISOString() ?? null,
    failedAt: value.failedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function serializedDetail(value: ResearchAggregate) {
  return {
    ...serializedSummary(value),
    summaryMarkdown: value.summaryMarkdown,
    warnings: value.warnings,
    sources: value.sources.map((source) => ({
      id: source.id,
      url: source.url,
      title: source.title,
      publisher: source.publisher,
      sourceType: source.sourceType,
      sourceQuality: source.sourceQuality,
      publishedAt: source.publishedAt,
      retrievedAt: source.retrievedAt.toISOString(),
      notes: source.notes,
      createdAt: source.createdAt.toISOString(),
    })),
    claims: value.claims.map((claim) => ({
      id: claim.id,
      type: claim.type,
      valueText: claim.valueText,
      valueJson: claim.valueJson,
      confidence: claim.confidence,
      evidenceType: claim.evidenceType,
      notes: claim.notes,
      createdAt: claim.createdAt.toISOString(),
    })),
    relationships: value.relationships.map((relationship) => ({
      claimId: relationship.claimId,
      sourceId: relationship.sourceId,
      relationship: relationship.relationship,
      evidenceText: relationship.evidenceText,
    })),
  };
}

class FakeResearchService implements ResearchRouteService {
  execution = aggregate();
  researchToGet = aggregate();
  researchesToGet: Research[] = [];
  latestCompleted = aggregate();
  executeError: unknown;
  getError: unknown;
  listError: unknown;
  latestError: unknown;
  readonly executeCalls: string[] = [];
  readonly getCalls: Array<{ applicationId: string; researchId: string }> = [];
  readonly listCalls: string[] = [];
  readonly latestCalls: string[] = [];

  async researchApplication(id: string): Promise<ResearchAggregate> {
    this.executeCalls.push(id);
    if (this.executeError !== undefined) throw this.executeError;
    return this.execution;
  }

  async getResearch(appId: string, runId: string): Promise<ResearchAggregate> {
    this.getCalls.push({ applicationId: appId, researchId: runId });
    if (this.getError !== undefined) throw this.getError;
    return this.researchToGet;
  }

  async getResearches(id: string): Promise<Research[]> {
    this.listCalls.push(id);
    if (this.listError !== undefined) throw this.listError;
    return this.researchesToGet;
  }

  async getLatestCompletedResearch(id: string): Promise<ResearchAggregate> {
    this.latestCalls.push(id);
    if (this.latestError !== undefined) throw this.latestError;
    return this.latestCompleted;
  }
}

function buildResearchApp(service: ResearchRouteService) {
  const app = buildApp({ researchService: service });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('Research API routes', () => {
  it('executes Research synchronously exactly once and returns 201 detail', async () => {
    const service = new FakeResearchService();
    const response = await buildResearchApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/research`,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(
      `/api/v1/applications/${applicationId}/researches/${researchId}`,
    );
    expect(response.json()).toEqual(serializedDetail(service.execution));
    expect(service.executeCalls).toEqual([applicationId]);
    expect(service.getCalls).toEqual([]);
    expect(response.body).not.toContain('normalizedUrl');
    expect(response.body).not.toContain('provider');
    expect(response.body).not.toContain('usage');
  });

  it('rejects client-controlled AI configuration before execution', async () => {
    const service = new FakeResearchService();
    const response = await buildResearchApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/research`,
      payload: {
        model: 'client-model',
        provider: 'client-provider',
        webSearch: false,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
    });
    expect(service.executeCalls).toEqual([]);
  });

  it('rejects malformed Application and Research UUIDs before delegation', async () => {
    const service = new FakeResearchService();
    const app = buildResearchApp(service);
    const execute = await app.inject({
      method: 'POST',
      url: '/api/v1/applications/not-a-uuid/research',
    });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/researches/not-a-uuid`,
    });

    for (const response of [execute, detail]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: 'INVALID_IDENTIFIER' },
      });
    }
    expect(service.executeCalls).toEqual([]);
    expect(service.getCalls).toEqual([]);
  });

  it('maps an unavailable Application to 404', async () => {
    const service = new FakeResearchService();
    service.executeError = new ResearchContextError('APPLICATION_UNAVAILABLE');
    const response = await buildResearchApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/research`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'APPLICATION_UNAVAILABLE',
        message: 'An Application is required for Research.',
      },
    });
  });

  it.each(['JOB_DESCRIPTION_UNAVAILABLE', 'INVALID_SOURCE_CONTEXT'] as const)(
    'maps %s source state to 409',
    async (code) => {
      const service = new FakeResearchService();
      service.executeError = new ResearchContextError(code);
      const response = await buildResearchApp(service).inject({
        method: 'POST',
        url: `/api/v1/applications/${applicationId}/research`,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code } });
    },
  );

  it('maps an active Research run to 409', async () => {
    const service = new FakeResearchService();
    service.executeError = new ResearchAlreadyRunningError();
    const response = await buildResearchApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/research`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: 'RESEARCH_ALREADY_RUNNING',
        message: 'A Research run is already in progress for this Application.',
      },
    });
  });

  it('maps explicit usage denial to 429', async () => {
    const service = new FakeResearchService();
    service.executeError = new AiUsageError('USAGE_NOT_ALLOWED');
    const response = await buildResearchApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/research`,
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: { code: 'USAGE_NOT_ALLOWED' },
    });
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
    const service = new FakeResearchService();
    service.executeError = error;
    const response = await buildResearchApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/research`,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code } });
    expect(response.body).not.toContain('private upstream payload');
    expect(response.body).not.toContain('stack');
  });

  it.each([
    ['INVALID_RESEARCH_SOURCE', 'INVALID_URL'],
    ['UNVERIFIED_RESEARCH_SOURCE', 'SOURCE_NOT_REPORTED_BY_PROVIDER'],
    ['INVALID_RESEARCH_CLAIM', 'MISSING_CLAIM_VALUE'],
    ['INVALID_CLAIM_SOURCE_RELATIONSHIP', 'UNKNOWN_SOURCE_REFERENCE'],
    ['RESEARCH_SOURCE_LIMIT_EXCEEDED', 'TOO_MANY_SOURCES'],
    ['RESEARCH_CONFIDENCE_FAILED', 'IMPOSSIBLE_CONFIDENCE_STATE'],
  ] as const)('maps %s generated Research validation to 502', async (code, reason) => {
    const service = new FakeResearchService();
    service.executeError = new ResearchValidationError(code, reason);
    const response = await buildResearchApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/research`,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code,
        message: 'The AI provider returned an unusable Research result.',
      },
    });
    expect(response.body).not.toContain(reason);
  });

  it.each([
    'USAGE_METADATA_UNAVAILABLE',
    'USAGE_CHECK_FAILED',
    'USAGE_RECORDING_FAILED',
  ] as const)('maps %s usage infrastructure failure to 503', async (code) => {
    const service = new FakeResearchService();
    service.executeError = new AiUsageError(code);
    const response = await buildResearchApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/research`,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code, message: 'AI usage infrastructure is unavailable.' },
    });
  });

  it.each([
    new ResearchPersistenceError({ cause: new Error('database secret') }),
    new UnexpectedResearchFailureError({ cause: new Error('stack detail') }),
  ])('maps internal Research failures safely', async (error) => {
    const service = new FakeResearchService();
    service.executeError = error;
    const response = await buildResearchApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/research`,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: error.code } });
    expect(response.body).not.toContain('secret');
    expect(response.body).not.toContain('stack detail');
  });

  it('returns compact mixed history in service-provided order without graph expansion', async () => {
    const service = new FakeResearchService();
    service.researchesToGet = [
      research({
        id: '23000000-0000-4000-8000-000000000000',
        promptVersion: 'research-v2',
      }),
      research({
        id: '22000000-0000-4000-8000-000000000000',
        status: 'FAILED',
        summaryMarkdown: null,
        warnings: [],
        failureCode: 'INVALID_JSON',
        failureMessage: 'The LLM response was not valid JSON.',
        completedAt: null,
        failedAt: completedAt,
      }),
      research({
        id: '21000000-0000-4000-8000-000000000000',
        status: 'RUNNING',
        summaryMarkdown: null,
        warnings: [],
        completedAt: null,
      }),
    ];
    const response = await buildResearchApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/researches`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((item: { id: string }) => item.id)).toEqual(
      service.researchesToGet.map(({ id }) => id),
    );
    expect(response.json().items).toHaveLength(3);
    expect(
      response.json().items.map((item: { promptVersion: string }) =>
        item.promptVersion,
      ),
    ).toEqual(['research-v2', 'research-v1', 'research-v1']);
    expect(response.json().items[0]).not.toHaveProperty('summaryMarkdown');
    expect(response.json().items[0]).not.toHaveProperty('sources');
    expect(service.listCalls).toEqual([applicationId]);
    expect(service.getCalls).toEqual([]);
  });

  it('distinguishes an unavailable parent Application from empty history', async () => {
    const service = new FakeResearchService();
    service.listError = new ResearchContextError('APPLICATION_UNAVAILABLE');
    const response = await buildResearchApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/researches`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'APPLICATION_UNAVAILABLE' },
    });
  });

  it('returns the complete owned graph without internal normalized fields', async () => {
    const service = new FakeResearchService();
    const response = await buildResearchApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/researches/${researchId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(serializedDetail(service.researchToGet));
    expect(response.json().claims[0]).toMatchObject({
      confidence: 'MEDIUM',
      valueJson: { amount: 85_000, currency: 'EUR' },
    });
    expect(
      response.json().relationships.map(
        (item: { relationship: string }) => item.relationship,
      ),
    ).toEqual(['SUPPORTS', 'CONTRADICTS']);
    expect(response.body).not.toContain('normalizedUrl');
    expect(response.json().sources[0]).not.toHaveProperty('researchId');
  });

  it.each([
    aggregate({
      status: 'FAILED',
      summaryMarkdown: null,
      warnings: [],
      failureCode: 'INVALID_JSON',
      failureMessage: 'The LLM response was not valid JSON.',
      completedAt: null,
      failedAt: completedAt,
      sources: [],
      claims: [],
      relationships: [],
    }),
    aggregate({
      status: 'RUNNING',
      summaryMarkdown: null,
      warnings: [],
      completedAt: null,
      sources: [],
      claims: [],
      relationships: [],
    }),
  ])('maps $status detail safely with an empty graph', async (value) => {
    const service = new FakeResearchService();
    service.researchToGet = value;
    const response = await buildResearchApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/researches/${researchId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(serializedDetail(value));
    expect(response.json().sources).toEqual([]);
    expect(response.json().claims).toEqual([]);
    expect(response.json().relationships).toEqual([]);
  });

  it('serializes a sparse COMPLETED Research as a successful bounded result', async () => {
    const service = new FakeResearchService();
    service.researchToGet = aggregate({
      promptVersion: 'research-v2',
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

    const response = await buildResearchApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/researches/${researchId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'COMPLETED',
      promptVersion: 'research-v2',
      summaryMarkdown:
        'No reliable external Research findings were available for this opportunity.',
      sources: [],
      claims: [],
      relationships: [],
    });
  });

  it('returns RESEARCH_NOT_FOUND for unknown and cross-Application detail', async () => {
    for (const requestedApplicationId of [applicationId, otherApplicationId]) {
      const service = new FakeResearchService();
      service.getError = new ResearchNotFoundError();
      const response = await buildResearchApp(service).inject({
        method: 'GET',
        url: `/api/v1/applications/${requestedApplicationId}/researches/${researchId}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: 'RESEARCH_NOT_FOUND',
          message: 'The Research was not found.',
        },
      });
      expect(response.body).not.toContain(researchId);
    }
  });

  it('returns latest completed detail, 404 empty state, and static-route precedence', async () => {
    const service = new FakeResearchService();
    const app = buildResearchApp(service);
    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/researches/latest-completed`,
    });

    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual(serializedDetail(service.latestCompleted));
    expect(service.latestCalls).toEqual([applicationId]);
    expect(service.getCalls).toEqual([]);

    service.latestError = new ResearchNotFoundError();
    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/researches/latest-completed`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      error: { code: 'RESEARCH_NOT_FOUND' },
    });
    expect(service.getCalls).toEqual([]);
  });
});
