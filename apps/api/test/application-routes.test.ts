import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  ApplicationNotFoundError,
  InvalidApplicationDataError,
  InvalidApplicationIdentifierError,
} from '../src/application/application.errors.js';
import type { ApplicationRouteService } from '../src/application/application.routes.js';
import type {
  Application,
  ApplicationWriteCommand,
} from '../src/application/application.types.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const createdAt = new Date('2026-08-01T10:00:00.000Z');
const updatedAt = new Date('2026-08-02T11:00:00.000Z');
const apps: ReturnType<typeof buildApp>[] = [];

function command(
  overrides: Partial<ApplicationWriteCommand> = {},
): ApplicationWriteCommand {
  return {
    companyName: 'Analytical Engines Ltd',
    roleTitle: 'Software Engineer',
    location: null,
    jobUrl: 'https://example.com/jobs/software-engineer',
    source: 'CAREER_PAGE',
    status: 'FOUND',
    priority: 'HIGH',
    dateFound: '2026-08-01',
    dateApplied: null,
    notesMarkdown: null,
    ...overrides,
  };
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: applicationId,
    ...command(),
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function serializedApplication(value: Application) {
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

class FakeApplicationService implements ApplicationRouteService {
  applicationsToGet: Application[] = [];
  applicationToGet: Application = application();
  applicationToCreate: Application = application();
  applicationToReplace: Application = application();
  getApplicationsError: unknown;
  getApplicationError: unknown;
  createError: unknown;
  replaceError: unknown;
  readonly requestedIds: string[] = [];
  readonly createCommands: ApplicationWriteCommand[] = [];
  readonly replacementCalls: {
    readonly id: string;
    readonly command: ApplicationWriteCommand;
  }[] = [];

  async getApplications(): Promise<Application[]> {
    if (this.getApplicationsError !== undefined) {
      throw this.getApplicationsError;
    }
    return this.applicationsToGet;
  }

  async getApplication(id: string): Promise<Application> {
    this.requestedIds.push(id);
    if (this.getApplicationError !== undefined) {
      throw this.getApplicationError;
    }
    return this.applicationToGet;
  }

  async createApplication(
    commandToCreate: ApplicationWriteCommand,
  ): Promise<Application> {
    this.createCommands.push(commandToCreate);
    if (this.createError !== undefined) {
      throw this.createError;
    }
    return this.applicationToCreate;
  }

  async replaceApplication(
    id: string,
    commandToReplace: ApplicationWriteCommand,
  ): Promise<Application> {
    this.replacementCalls.push({ id, command: commandToReplace });
    if (this.replaceError !== undefined) {
      throw this.replaceError;
    }
    return this.applicationToReplace;
  }
}

function buildApplicationApp(service: ApplicationRouteService) {
  const app = buildApp({ applicationService: service });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('Application API routes', () => {
  it('lists Applications with explicit nulls and serialized timestamps', async () => {
    const service = new FakeApplicationService();
    const first = application();
    const second = application({
      id: '20000000-0000-4000-8000-000000000000',
      companyName: 'Second Company',
      location: 'Remote',
    });
    service.applicationsToGet = [first, second];
    const app = buildApplicationApp(service);

    const response = await app.inject({ method: 'GET', url: '/api/v1/applications' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      applications: [serializedApplication(first), serializedApplication(second)],
    });
  });

  it('returns an empty Application collection', async () => {
    const app = buildApplicationApp(new FakeApplicationService());

    const response = await app.inject({ method: 'GET', url: '/api/v1/applications' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ applications: [] });
  });

  it('creates an Application and returns its resource location', async () => {
    const service = new FakeApplicationService();
    const createCommand = command();
    const app = buildApplicationApp(service);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: createCommand,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/api/v1/applications/${applicationId}`);
    expect(response.json()).toEqual({
      application: serializedApplication(service.applicationToCreate),
    });
    expect(service.createCommands).toEqual([createCommand]);
  });

  it('gets one Application by UUID', async () => {
    const service = new FakeApplicationService();
    const app = buildApplicationApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      application: serializedApplication(service.applicationToGet),
    });
    expect(service.requestedIds).toEqual([applicationId]);
  });

  it('replaces one Application with a complete body', async () => {
    const service = new FakeApplicationService();
    const replacement = command({ companyName: 'Replacement Company' });
    service.applicationToReplace = application({
      companyName: 'Replacement Company',
    });
    const app = buildApplicationApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/applications/${applicationId}`,
      payload: replacement,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      application: serializedApplication(service.applicationToReplace),
    });
    expect(service.replacementCalls).toEqual([
      { id: applicationId, command: replacement },
    ]);
  });

  it('rejects malformed UUID parameters before calling the service', async () => {
    const service = new FakeApplicationService();
    const app = buildApplicationApp(service);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/applications/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_IDENTIFIER' },
    });
    expect(service.requestedIds).toEqual([]);
  });

  it.each([
    {
      label: 'blank required values',
      payload: command({ companyName: '   ' }),
    },
    {
      label: 'invalid URLs',
      payload: command({ jobUrl: 'ftp://example.com/job' }),
    },
    {
      label: 'invalid enums',
      payload: { ...command(), priority: 'URGENT' },
    },
    {
      label: 'unknown properties',
      payload: { ...command(), score: 100 },
    },
  ])('returns safe validation errors for $label', async ({ payload }) => {
    const service = new FakeApplicationService();
    const app = buildApplicationApp(service);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
    });
    expect(service.createCommands).toEqual([]);
  });

  it('maps service validation errors centrally', async () => {
    const service = new FakeApplicationService();
    service.createError = new InvalidApplicationDataError([
      { path: 'dateApplied', message: 'Internal validation detail.' },
    ]);
    const app = buildApplicationApp(service);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: command({ dateFound: '2026-08-02', dateApplied: '2026-08-01' }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
    });
    expect(response.body).not.toContain('Internal validation detail');
  });

  it('maps service identifier errors centrally', async () => {
    const service = new FakeApplicationService();
    service.getApplicationError = new InvalidApplicationIdentifierError('internal-id');
    const app = buildApplicationApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_IDENTIFIER',
        message: 'An Application identifier is invalid.',
      },
    });
    expect(response.body).not.toContain('internal-id');
  });

  it('returns a safe not-found envelope', async () => {
    const service = new FakeApplicationService();
    service.getApplicationError = new ApplicationNotFoundError(applicationId);
    const app = buildApplicationApp(service);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The Application was not found.' },
    });
    expect(response.body).not.toContain(applicationId);
  });

  it('hides unexpected internal errors', async () => {
    const service = new FakeApplicationService();
    service.getApplicationsError = new Error('relation applications_secret missing');
    const app = buildApplicationApp(service);

    const response = await app.inject({ method: 'GET', url: '/api/v1/applications' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(response.body).not.toContain('applications_secret');
  });

  it('keeps health and app construction independent from PostgreSQL', async () => {
    const originalDatabaseUrl = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    const app = buildApplicationApp(new FakeApplicationService());

    try {
      const response = await app.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete process.env['DATABASE_URL'];
      } else {
        process.env['DATABASE_URL'] = originalDatabaseUrl;
      }
    }
  });
});
