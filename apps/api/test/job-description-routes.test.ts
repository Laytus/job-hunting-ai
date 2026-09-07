import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  InvalidJobDescriptionDataError,
  JobDescriptionApplicationNotFoundError,
} from '../src/job-description/job-description.errors.js';
import type { JobDescriptionRouteService } from '../src/job-description/job-description.routes.js';
import type {
  JobDescription,
  JobDescriptionReplacementResult,
  JobDescriptionWriteInput,
} from '../src/job-description/job-description.types.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const jobDescriptionId = '20000000-0000-4000-8000-000000000000';
const apps: ReturnType<typeof buildApp>[] = [];

function jobDescription(
  overrides: Partial<JobDescription> = {},
): JobDescription {
  return {
    id: jobDescriptionId,
    applicationId,
    title: null,
    companyName: null,
    descriptionMarkdown: '# Senior Quant Developer',
    requirementsMarkdown: null,
    responsibilitiesMarkdown: null,
    structuredData: null,
    sourceUrl: null,
    createdAt: new Date('2026-08-21T10:00:00.000Z'),
    updatedAt: new Date('2026-08-21T11:00:00.000Z'),
    ...overrides,
  };
}

function serialized(value: JobDescription) {
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

class FakeJobDescriptionService implements JobDescriptionRouteService {
  jobDescriptionToGet: JobDescription | null = null;
  replacementResult: JobDescriptionReplacementResult = {
    created: true,
    jobDescription: jobDescription(),
  };
  getError: unknown;
  replaceError: unknown;
  readonly getCalls: string[] = [];
  readonly replacementCalls: {
    readonly applicationId: string;
    readonly input: JobDescriptionWriteInput;
  }[] = [];

  async getJobDescription(id: string): Promise<JobDescription | null> {
    this.getCalls.push(id);
    if (this.getError !== undefined) {
      throw this.getError;
    }
    return this.jobDescriptionToGet;
  }

  async replaceJobDescription(
    id: string,
    input: JobDescriptionWriteInput,
  ): Promise<JobDescriptionReplacementResult> {
    this.replacementCalls.push({ applicationId: id, input });
    if (this.replaceError !== undefined) {
      throw this.replaceError;
    }
    return this.replacementResult;
  }
}

function buildJobDescriptionApp(service: JobDescriptionRouteService) {
  const app = buildApp({ jobDescriptionService: service });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('Job Description API routes', () => {
  it('returns null when an Application has no Job Description', async () => {
    const service = new FakeJobDescriptionService();
    const app = buildJobDescriptionApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/job-description`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ jobDescription: null });
    expect(service.getCalls).toEqual([applicationId]);
  });

  it('serializes a populated Job Description', async () => {
    const service = new FakeJobDescriptionService();
    service.jobDescriptionToGet = jobDescription({
      structuredData: { skills: ['TypeScript'] },
    });
    const app = buildJobDescriptionApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/job-description`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      jobDescription: serialized(service.jobDescriptionToGet),
    });
  });

  it('creates a Job Description with a resource location', async () => {
    const service = new FakeJobDescriptionService();
    const payload = { descriptionMarkdown: '# Senior Quant Developer' };
    const app = buildJobDescriptionApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/applications/${applicationId}/job-description`,
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(
      `/api/v1/applications/${applicationId}/job-description`,
    );
    expect(response.json()).toEqual({
      jobDescription: serialized(service.replacementResult.jobDescription),
    });
    expect(service.replacementCalls).toEqual([{ applicationId, input: payload }]);
  });

  it('updates a Job Description with 200', async () => {
    const service = new FakeJobDescriptionService();
    service.replacementResult = {
      created: false,
      jobDescription: jobDescription({ title: 'Updated title' }),
    };
    const payload = {
      title: 'Updated title',
      companyName: null,
      descriptionMarkdown: '# Updated',
      requirementsMarkdown: null,
      responsibilitiesMarkdown: null,
      structuredData: null,
      sourceUrl: null,
    };
    const app = buildJobDescriptionApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/applications/${applicationId}/job-description`,
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(service.replacementCalls).toEqual([{ applicationId, input: payload }]);
  });

  it.each([
    { label: 'blank description', payload: { descriptionMarkdown: '' } },
    { label: 'missing description', payload: { title: 'Role' } },
    {
      label: 'invalid URL',
      payload: { descriptionMarkdown: '# Role', sourceUrl: 'ftp://example.com' },
    },
    {
      label: 'unknown property',
      payload: { descriptionMarkdown: '# Role', rawText: 'legacy field' },
    },
  ])('rejects an invalid payload: $label', async ({ payload }) => {
    const service = new FakeJobDescriptionService();
    const app = buildJobDescriptionApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/applications/${applicationId}/job-description`,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
    });
    expect(service.replacementCalls).toEqual([]);
  });

  it('rejects malformed Application UUIDs at the boundary', async () => {
    const service = new FakeJobDescriptionService();
    const app = buildJobDescriptionApp(service);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/applications/not-a-uuid/job-description',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_IDENTIFIER' },
    });
    expect(service.getCalls).toEqual([]);
  });

  it('maps domain validation and missing-parent errors centrally', async () => {
    const service = new FakeJobDescriptionService();
    const app = buildJobDescriptionApp(service);
    service.replaceError = new InvalidJobDescriptionDataError([
      { path: 'descriptionMarkdown', message: 'private detail' },
    ]);

    const invalid = await app.inject({
      method: 'PUT',
      url: `/api/v1/applications/${applicationId}/job-description`,
      payload: { descriptionMarkdown: '# valid boundary value' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
    });
    expect(invalid.body).not.toContain('private detail');

    service.getError = new JobDescriptionApplicationNotFoundError(applicationId);
    const missing = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/job-description`,
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The Application was not found.' },
    });
    expect(missing.body).not.toContain(applicationId);
  });
});
