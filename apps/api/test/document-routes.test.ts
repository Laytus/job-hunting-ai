import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  DocumentApplicationNotFoundError,
  DocumentNotFoundError,
  InvalidDocumentDataError,
} from '../src/document/document.errors.js';
import type { DocumentRouteService } from '../src/document/document.routes.js';
import type {
  CreateDocumentInput,
  CreateDocumentVersionInput,
  DocumentVersion,
  DocumentSummary,
  DocumentWithCurrentVersion,
  UpdateDocumentMetadataInput,
} from '../src/document/document.types.js';

const candidateId = '10000000-0000-4000-8000-000000000000';
const applicationId = '20000000-0000-4000-8000-000000000000';
const documentId = '30000000-0000-4000-8000-000000000000';
const versionId = '40000000-0000-4000-8000-000000000000';
const apps: ReturnType<typeof buildApp>[] = [];

function document(): DocumentWithCurrentVersion {
  const currentVersion: DocumentVersion = {
    id: versionId,
    documentId,
    contentMarkdown: '# Resume notes',
    metadata: { origin: 'manual' },
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
  };
  return {
    id: documentId,
    candidateId,
    applicationId: null,
    type: 'MARKDOWN_NOTE',
    title: 'Resume notes',
    currentVersionId: versionId,
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    updatedAt: new Date('2026-08-22T11:00:00.000Z'),
    currentVersion,
  };
}

function serializedVersion(version: DocumentVersion) {
  return { ...version, createdAt: version.createdAt.toISOString() };
}

function serializedDocument(value: DocumentWithCurrentVersion) {
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
    currentVersion: serializedVersion(value.currentVersion),
  };
}

class FakeDocumentService implements DocumentRouteService {
  summaries: DocumentSummary[] = [];
  readonly applicationDocumentCalls: string[] = [];
  result = document();
  versions = [document().currentVersion];
  error?: unknown;
  createInput?: CreateDocumentInput;
  metadataInput?: UpdateDocumentMetadataInput;
  versionInput?: CreateDocumentVersionInput;

  private resultOrThrow() {
    if (this.error !== undefined) {
      throw this.error;
    }
    return this.result;
  }

  async getApplicationDocuments(id: string): Promise<DocumentSummary[]> {
    this.applicationDocumentCalls.push(id);
    if (this.error !== undefined) {
      throw this.error;
    }
    return this.summaries;
  }

  async createDocument(input: CreateDocumentInput) {
    this.createInput = input;
    return this.resultOrThrow();
  }

  async getDocument() {
    return this.resultOrThrow();
  }

  async updateDocumentMetadata(_id: string, input: UpdateDocumentMetadataInput) {
    this.metadataInput = input;
    return this.resultOrThrow();
  }

  async getDocumentVersions() {
    if (this.error !== undefined) {
      throw this.error;
    }
    return this.versions;
  }

  async createDocumentVersion(_id: string, input: CreateDocumentVersionInput) {
    this.versionInput = input;
    return this.resultOrThrow();
  }
}

function buildDocumentApp(service: DocumentRouteService) {
  const app = buildApp({ documentService: service });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('Document API routes', () => {
  it('lists lightweight Application Document summaries', async () => {
    const service = new FakeDocumentService();
    service.summaries = [
      {
        id: documentId,
        type: 'COVER_LETTER',
        title: 'Tailored cover letter',
        currentVersionId: versionId,
        createdAt: new Date('2026-08-22T10:00:00.000Z'),
        updatedAt: new Date('2026-08-22T11:00:00.000Z'),
      },
    ];
    const app = buildDocumentApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/documents`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      documents: service.summaries.map((summary) => ({
        ...summary,
        createdAt: summary.createdAt.toISOString(),
        updatedAt: summary.updatedAt.toISOString(),
      })),
    });
    expect(response.body).not.toContain('contentMarkdown');
    expect(response.body).not.toContain('metadata');
    expect(service.applicationDocumentCalls).toEqual([applicationId]);
  });

  it('returns an empty collection for an Application without Documents', async () => {
    const service = new FakeDocumentService();
    const app = buildDocumentApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/documents`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ documents: [] });
  });

  it('validates the Application UUID and maps missing parents centrally', async () => {
    const service = new FakeDocumentService();
    const app = buildDocumentApp(service);

    const invalid = await app.inject({
      method: 'GET',
      url: '/api/v1/applications/not-a-uuid/documents',
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: { code: 'INVALID_IDENTIFIER' },
    });
    expect(service.applicationDocumentCalls).toEqual([]);

    service.error = new DocumentApplicationNotFoundError(applicationId);
    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/documents`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The Application was not found.' },
    });
    expect(missing.body).not.toContain(applicationId);
  });

  it('creates a Document and serializes its current version', async () => {
    const service = new FakeDocumentService();
    const app = buildDocumentApp(service);
    const payload = {
      candidateId: null,
      applicationId,
      type: 'APPLICATION_BRIEF',
      title: 'Application brief',
      contentMarkdown: '# Application brief',
      metadata: { origin: 'manual' },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/api/v1/documents/${documentId}`);
    expect(response.json()).toEqual({ document: serializedDocument(document()) });
    expect(service.createInput).toEqual(payload);
  });

  it('gets a Document by UUID', async () => {
    const service = new FakeDocumentService();
    const app = buildDocumentApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ document: serializedDocument(document()) });
  });

  it('updates metadata without accepting content fields', async () => {
    const service = new FakeDocumentService();
    const app = buildDocumentApp(service);
    const payload = { type: 'COVER_LETTER', title: 'Tailored cover letter' };

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/documents/${documentId}`,
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(service.metadataInput).toEqual(payload);

    const invalid = await app.inject({
      method: 'PUT',
      url: `/api/v1/documents/${documentId}`,
      payload: { ...payload, contentMarkdown: '# Overwrite' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(service.metadataInput).toEqual(payload);
  });

  it('lists versions with serialized timestamps', async () => {
    const service = new FakeDocumentService();
    const app = buildDocumentApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}/versions`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      versions: service.versions.map(serializedVersion),
    });
  });

  it('creates an immutable version and returns the updated Document', async () => {
    const service = new FakeDocumentService();
    const app = buildDocumentApp(service);
    const payload = {
      contentMarkdown: '# Revised notes',
      metadata: { origin: 'manual' },
    };

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/versions`,
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(service.versionInput).toEqual(payload);
  });

  it.each([
    {
      label: 'both owners',
      payload: {
        candidateId,
        applicationId: '20000000-0000-4000-8000-000000000000',
        type: 'MARKDOWN_NOTE',
        title: 'Invalid',
        contentMarkdown: '# Invalid',
      },
    },
    {
      label: 'neither owner',
      payload: {
        candidateId: null,
        applicationId: null,
        type: 'MARKDOWN_NOTE',
        title: 'Invalid',
        contentMarkdown: '# Invalid',
      },
    },
    {
      label: 'unknown property',
      payload: {
        candidateId,
        applicationId: null,
        type: 'MARKDOWN_NOTE',
        title: 'Invalid',
        contentMarkdown: '# Invalid',
        rawContent: 'not allowed',
      },
    },
    {
      label: 'invalid type',
      payload: {
        candidateId,
        applicationId: null,
        type: 'RESUME',
        title: 'Invalid',
        contentMarkdown: '# Invalid',
      },
    },
  ])('rejects invalid create input: $label', async ({ payload }) => {
    const service = new FakeDocumentService();
    const app = buildDocumentApp(service);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
    });
    expect(service.createInput).toBeUndefined();
  });

  it('rejects malformed path UUIDs before calling the service', async () => {
    const service = new FakeDocumentService();
    const app = buildDocumentApp(service);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_IDENTIFIER' },
    });
  });

  it('maps safe domain errors centrally and hides unexpected details', async () => {
    const service = new FakeDocumentService();
    const app = buildDocumentApp(service);
    service.error = new DocumentNotFoundError(documentId);

    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The Document was not found.' },
    });
    expect(missing.body).not.toContain(documentId);

    service.error = new InvalidDocumentDataError([
      { path: 'title', message: 'private detail' },
    ]);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      payload: {
        candidateId,
        applicationId: null,
        type: 'MARKDOWN_NOTE',
        title: 'Boundary valid',
        contentMarkdown: '# Boundary valid',
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).not.toContain('private detail');

    service.error = new Error('database connection details');
    const unexpected = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
    });
    expect(unexpected.statusCode).toBe(500);
    expect(unexpected.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(unexpected.body).not.toContain('database connection details');
  });
});
