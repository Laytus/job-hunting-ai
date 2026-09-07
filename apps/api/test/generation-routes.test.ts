import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Document, DocumentVersion } from '../src/document/document.types.js';
import {
  GenerationContextError,
  GenerationTemplateError,
  GenerationWorkflowError,
} from '../src/generation/generation.errors.js';
import type {
  GenerationExecutionResult,
} from '../src/generation/generation-service.js';
import type { GenerationRouteService } from '../src/generation/generation.routes.js';
import type {
  CoverLetterProfileSuggestion,
  GenerationDocumentRequest,
  GenerationDocumentType,
  GenerationWarning,
} from '../src/generation/generation.types.js';
import { AiUsageError } from '../src/llm/ai-usage.errors.js';
import { LlmProviderError } from '../src/llm/llm.errors.js';
import { StructuredLlmError } from '../src/llm/structured-llm.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const otherApplicationId = '11000000-0000-4000-8000-000000000000';
const documentId = '20000000-0000-4000-8000-000000000000';
const versionId = '30000000-0000-4000-8000-000000000000';
const timestamp = new Date('2026-08-28T12:00:00.000Z');
const apps: ReturnType<typeof buildApp>[] = [];

function executionResult(
  type: GenerationDocumentType = 'COVER_LETTER',
  warnings: readonly GenerationWarning[] = ['NO_RESEARCH_AVAILABLE'],
): GenerationExecutionResult {
  const document: Document = {
    id: documentId,
    candidateId: null,
    applicationId,
    type,
    title: `${type} title`,
    currentVersionId: versionId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const currentVersion: DocumentVersion = {
    id: versionId,
    documentId,
    contentMarkdown: '# Generated\n\nSafe content.',
    metadata: {
      generation: {
        documentType: type,
        promptVersion: 'safe-version',
      },
    },
    createdAt: timestamp,
  };
  return { document, currentVersion, warnings };
}

class FakeGenerationService implements GenerationRouteService {
  result = executionResult();
  error: unknown;
  readonly calls: GenerationDocumentRequest[] = [];
  readonly suggestionCalls: string[] = [];
  suggestion: CoverLetterProfileSuggestion = {
    market: { value: 'UNITED_KINGDOM', source: 'APPLICATION_LOCATION' },
    sector: { value: 'QUANT_TRADING', source: 'ROLE_TITLE' },
  };

  async generateDocument(
    request: GenerationDocumentRequest,
  ): Promise<GenerationExecutionResult> {
    this.calls.push(request);
    if (this.error !== undefined) throw this.error;
    return this.result;
  }

  async suggestCoverLetterProfile(
    requestedApplicationId: string,
  ): Promise<CoverLetterProfileSuggestion> {
    this.suggestionCalls.push(requestedApplicationId);
    if (this.error !== undefined) throw this.error;
    return this.suggestion;
  }
}

function buildGenerationApp(service: GenerationRouteService) {
  const app = buildApp({ generationService: service });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('Generation API routes', () => {
  it.each([
    {
      label: 'France/French Cover Letter',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'fr',
        market: 'FRANCE',
        sector: 'ASSET_MANAGEMENT',
      },
      expectedRequest: {
        outputLanguage: 'fr',
        market: 'FRANCE',
        sector: 'ASSET_MANAGEMENT',
      },
    },
    {
      label: 'France/English Cover Letter',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'en',
        market: 'FRANCE',
        sector: 'QUANT_TRADING',
      },
      expectedRequest: {
        outputLanguage: 'en',
        market: 'FRANCE',
        sector: 'QUANT_TRADING',
      },
    },
    {
      label: 'UK/English Cover Letter',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'en',
        market: 'UNITED_KINGDOM',
        sector: 'INVESTMENT_BANKING',
      },
      expectedRequest: {
        outputLanguage: 'en',
        market: 'UNITED_KINGDOM',
        sector: 'INVESTMENT_BANKING',
      },
    },
    {
      label: 'UK/French Cover Letter',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'fr',
        market: 'UNITED_KINGDOM',
        sector: 'GENERAL',
      },
      expectedRequest: {
        outputLanguage: 'fr',
        market: 'UNITED_KINGDOM',
        sector: 'GENERAL',
      },
    },
    {
      label: 'US/English Cover Letter',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'en',
        market: 'UNITED_STATES',
        sector: 'SOFTWARE_TECH',
      },
      expectedRequest: {
        outputLanguage: 'en',
        market: 'UNITED_STATES',
        sector: 'SOFTWARE_TECH',
      },
    },
    {
      label: 'US/French Cover Letter',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'fr',
        market: 'UNITED_STATES',
        sector: 'CONSULTING',
      },
      expectedRequest: {
        outputLanguage: 'fr',
        market: 'UNITED_STATES',
        sector: 'CONSULTING',
      },
    },
    {
      label: 'Application Brief',
      payload: { documentType: 'APPLICATION_BRIEF' },
      expectedRequest: { outputLanguage: 'en' },
    },
    {
      label: 'Interview Brief',
      payload: { documentType: 'INTERVIEW_BRIEF' },
      expectedRequest: { outputLanguage: 'en' },
    },
  ] as const)('generates an $label synchronously', async (testCase) => {
    const service = new FakeGenerationService();
    service.result = executionResult(testCase.payload.documentType);
    const response = await buildGenerationApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/generation`,
      payload: testCase.payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/api/v1/documents/${documentId}`);
    expect(response.json()).toEqual({
      document: {
        id: documentId,
        candidateId: null,
        applicationId,
        type: testCase.payload.documentType,
        title: `${testCase.payload.documentType} title`,
        currentVersionId: versionId,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
      },
      currentVersion: {
        id: versionId,
        documentId,
        contentMarkdown: '# Generated\n\nSafe content.',
        metadata: {
          generation: {
            documentType: testCase.payload.documentType,
            promptVersion: 'safe-version',
          },
        },
        createdAt: timestamp.toISOString(),
      },
      warnings: ['NO_RESEARCH_AVAILABLE'],
    });
    expect(service.calls).toEqual([
      {
        mode: 'GENERATE',
        applicationId,
        documentType: testCase.payload.documentType,
        ...testCase.expectedRequest,
      },
    ]);
    expect(response.body).not.toContain('provider');
    expect(response.body).not.toContain('usage');
    expect(response.body).not.toContain('template content');
  });

  it.each([
    { label: 'missing body', payload: undefined },
    { label: 'missing document type', payload: {} },
    { label: 'unknown document type', payload: { documentType: 'NOTE' } },
    { label: 'missing Cover Letter language', payload: { documentType: 'COVER_LETTER' } },
    {
      label: 'missing Cover Letter market',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'en',
        sector: 'GENERAL',
      },
    },
    {
      label: 'missing Cover Letter sector',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'en',
        market: 'FRANCE',
      },
    },
    {
      label: 'invalid Cover Letter language',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'EN',
        market: 'FRANCE',
        sector: 'GENERAL',
      },
    },
    {
      label: 'invalid Cover Letter market',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'en',
        market: 'CANADA',
        sector: 'GENERAL',
      },
    },
    {
      label: 'invalid Cover Letter sector',
      payload: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'en',
        market: 'FRANCE',
        sector: 'LEGAL',
      },
    },
    { label: 'French Application Brief', payload: { documentType: 'APPLICATION_BRIEF', outputLanguage: 'fr' } },
    { label: 'French Interview Brief', payload: { documentType: 'INTERVIEW_BRIEF', outputLanguage: 'fr' } },
    { label: 'profiled Application Brief', payload: { documentType: 'APPLICATION_BRIEF', market: 'FRANCE', sector: 'GENERAL' } },
    { label: 'unexpected field', payload: { documentType: 'APPLICATION_BRIEF', model: 'private-model' } },
  ])('rejects $label before calling Generation', async ({ payload }) => {
    const service = new FakeGenerationService();
    const response = await buildGenerationApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/generation`,
      ...(payload === undefined ? {} : { payload }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
    });
    expect(service.calls).toEqual([]);
  });

  it('rejects malformed Generate and Regenerate identifiers before service calls', async () => {
    const service = new FakeGenerationService();
    const app = buildGenerationApp(service);
    const invalidApplication = await app.inject({
      method: 'POST',
      url: '/api/v1/applications/not-a-uuid/generation',
      payload: { documentType: 'APPLICATION_BRIEF' },
    });
    const invalidDocument = await app.inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/documents/not-a-uuid/regenerate`,
      payload: {},
    });

    for (const response of [invalidApplication, invalidDocument]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: 'INVALID_IDENTIFIER' },
      });
    }
    expect(service.calls).toEqual([]);
  });

  it('returns the provider-free Cover Letter profile suggestion contract', async () => {
    const service = new FakeGenerationService();
    const response = await buildGenerationApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/generation/cover-letter-profile`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ suggestion: service.suggestion });
    expect(service.suggestionCalls).toEqual([applicationId]);
    expect(service.calls).toEqual([]);
  });

  it('preserves nullable ambiguous market suggestions', async () => {
    const service = new FakeGenerationService();
    service.suggestion = {
      market: { value: null, source: 'AMBIGUOUS' },
      sector: { value: 'GENERAL', source: 'DEFAULT_GENERAL' },
    };
    const response = await buildGenerationApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/generation/cover-letter-profile`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ suggestion: service.suggestion });
  });

  it('maps a missing suggestion Application without exposing internals', async () => {
    const service = new FakeGenerationService();
    service.error = new GenerationWorkflowError('APPLICATION_UNAVAILABLE');
    const response = await buildGenerationApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/generation/cover-letter-profile`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'APPLICATION_UNAVAILABLE' },
    });
    expect(service.calls).toEqual([]);
  });

  it.each([
    {
      label: 'English Cover Letter',
      type: 'COVER_LETTER',
      payload: {
        outputLanguage: 'en',
        market: 'UNITED_KINGDOM',
        sector: 'QUANT_TRADING',
      },
      expectedRequest: {
        outputLanguage: 'en',
        market: 'UNITED_KINGDOM',
        sector: 'QUANT_TRADING',
      },
    },
    {
      label: 'French Cover Letter',
      type: 'COVER_LETTER',
      payload: {
        outputLanguage: 'fr',
        market: 'UNITED_STATES',
        sector: 'SOFTWARE_TECH',
      },
      expectedRequest: {
        outputLanguage: 'fr',
        market: 'UNITED_STATES',
        sector: 'SOFTWARE_TECH',
      },
    },
    {
      label: 'Application Brief',
      type: 'APPLICATION_BRIEF',
      payload: undefined,
      expectedRequest: {},
    },
    {
      label: 'Interview Brief',
      type: 'INTERVIEW_BRIEF',
      payload: {},
      expectedRequest: {},
    },
  ] as const)('regenerates an $label with one service call', async (testCase) => {
    const service = new FakeGenerationService();
    service.result = executionResult(testCase.type);
    const response = await buildGenerationApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/documents/${documentId}/regenerate`,
      ...(testCase.payload === undefined ? {} : { payload: testCase.payload }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      document: { id: documentId, type: testCase.type },
      currentVersion: {
        id: versionId,
        documentId,
        contentMarkdown: '# Generated\n\nSafe content.',
      },
      warnings: ['NO_RESEARCH_AVAILABLE'],
    });
    expect(service.calls).toEqual([
      {
        mode: 'REGENERATE',
        applicationId,
        documentId,
        ...testCase.expectedRequest,
      },
    ]);
  });

  it.each([
    { label: 'invalid language', payload: { outputLanguage: 'French' } },
    {
      label: 'missing market',
      payload: { outputLanguage: 'en', sector: 'GENERAL' },
    },
    {
      label: 'missing sector',
      payload: { outputLanguage: 'en', market: 'FRANCE' },
    },
    {
      label: 'invalid market',
      payload: {
        outputLanguage: 'en',
        market: 'CANADA',
        sector: 'GENERAL',
      },
    },
    {
      label: 'invalid sector',
      payload: {
        outputLanguage: 'en',
        market: 'FRANCE',
        sector: 'LEGAL',
      },
    },
    { label: 'unexpected field', payload: { documentType: 'COVER_LETTER' } },
  ])('rejects Regenerate $label before service execution', async ({ payload }) => {
    const service = new FakeGenerationService();
    const response = await buildGenerationApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/documents/${documentId}/regenerate`,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(service.calls).toEqual([]);
  });

  it.each([
    ['INVALID_GENERATION_REQUEST', 400],
    ['INVALID_DOCUMENT_TYPE', 400],
    ['INVALID_OUTPUT_LANGUAGE', 400],
    ['APPLICATION_UNAVAILABLE', 404],
    ['CANDIDATE_UNAVAILABLE', 404],
    ['JOB_DESCRIPTION_UNAVAILABLE', 404],
    ['DOCUMENT_NOT_FOUND', 404],
    ['DOCUMENT_ALREADY_EXISTS', 409],
    ['INVALID_GENERATION_TARGET', 409],
    ['GENERATION_ALREADY_RUNNING', 409],
    ['GENERATION_COMPOSITION_FAILED', 502],
    ['GENERATION_PERSISTENCE_FAILED', 500],
    ['UNEXPECTED_GENERATION_FAILURE', 500],
  ] as const)('maps %s to HTTP %i', async (code, statusCode) => {
    const service = new FakeGenerationService();
    service.error = new GenerationWorkflowError(code, {
      cause: new Error('private workflow detail'),
    });
    const response = await buildGenerationApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/generation`,
      payload: { documentType: 'APPLICATION_BRIEF' },
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toMatchObject({ error: { code } });
    expect(response.body).not.toContain('private workflow detail');
    expect(service.calls).toHaveLength(1);
  });

  it.each([
    {
      label: 'usage denial',
      error: new AiUsageError('USAGE_NOT_ALLOWED'),
      code: 'USAGE_NOT_ALLOWED',
      statusCode: 429,
    },
    {
      label: 'usage check failure',
      error: new AiUsageError('USAGE_CHECK_FAILED'),
      code: 'USAGE_CHECK_FAILED',
      statusCode: 503,
    },
    {
      label: 'usage metadata failure',
      error: new AiUsageError('USAGE_METADATA_UNAVAILABLE'),
      code: 'USAGE_METADATA_UNAVAILABLE',
      statusCode: 503,
    },
    {
      label: 'usage recording failure',
      error: new AiUsageError('USAGE_RECORDING_FAILED'),
      code: 'USAGE_RECORDING_FAILED',
      statusCode: 503,
    },
    {
      label: 'provider failure',
      error: new LlmProviderError('private provider detail'),
      code: 'LLM_PROVIDER_FAILED',
      statusCode: 502,
    },
    {
      label: 'invalid JSON',
      error: new StructuredLlmError('INVALID_JSON'),
      code: 'INVALID_JSON',
      statusCode: 502,
    },
    {
      label: 'schema validation',
      error: new StructuredLlmError('SCHEMA_VALIDATION_FAILED'),
      code: 'SCHEMA_VALIDATION_FAILED',
      statusCode: 502,
    },
    {
      label: 'template unavailable',
      error: new GenerationTemplateError('GENERATION_TEMPLATE_NOT_FOUND'),
      code: 'GENERATION_TEMPLATE_NOT_FOUND',
      statusCode: 502,
    },
    {
      label: 'invalid source context',
      error: new GenerationContextError('INVALID_SOURCE_CONTEXT'),
      code: 'INVALID_SOURCE_CONTEXT',
      statusCode: 409,
    },
  ])('maps $label through the safe envelope', async (testCase) => {
    const service = new FakeGenerationService();
    service.error = testCase.error;
    const response = await buildGenerationApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/generation`,
      payload: { documentType: 'APPLICATION_BRIEF' },
    });

    expect(response.statusCode).toBe(testCase.statusCode);
    expect(response.json()).toMatchObject({
      error: { code: testCase.code },
    });
    expect(response.body).not.toContain('private provider detail');
    expect(response.body).not.toContain('stack');
  });

  it('preserves privacy-safe DOCUMENT_NOT_FOUND on cross-Application Regenerate', async () => {
    const service = new FakeGenerationService();
    service.error = new GenerationWorkflowError('DOCUMENT_NOT_FOUND');
    const response = await buildGenerationApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${otherApplicationId}/documents/${documentId}/regenerate`,
      payload: { outputLanguage: 'en' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: 'DOCUMENT_NOT_FOUND',
        message: 'The Generation target Document was not found.',
      },
    });
    expect(response.body).not.toContain(applicationId);
    expect(response.body).not.toContain(documentId);
    expect(service.calls).toHaveLength(1);
  });

  it('maps unexpected failures without exposing exception details', async () => {
    const service = new FakeGenerationService();
    service.error = new Error('private unexpected detail');
    const response = await buildGenerationApp(service).inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/generation`,
      payload: { documentType: 'APPLICATION_BRIEF' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(response.body).not.toContain('private unexpected detail');
  });

  it('keeps app startup and ordinary GET routes independent from OpenAI config', async () => {
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
