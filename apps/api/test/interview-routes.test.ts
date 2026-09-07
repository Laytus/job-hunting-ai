import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  InterviewApplicationNotFoundError,
  InterviewNotFoundError,
} from '../src/interview/interview.errors.js';
import type { InterviewRouteService } from '../src/interview/interview.routes.js';
import type {
  Interview,
  InterviewWriteInput,
} from '../src/interview/interview.types.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const interviewId = '20000000-0000-4000-8000-000000000000';
const apps: ReturnType<typeof buildApp>[] = [];

function input(overrides: Partial<InterviewWriteInput> = {}): InterviewWriteInput {
  return {
    type: 'TECHNICAL',
    status: 'SCHEDULED',
    scheduledAt: '2026-09-01T14:00:00.000Z',
    completedAt: null,
    notesMarkdown: null,
    feedbackMarkdown: null,
    sortOrder: 1,
    ...overrides,
  };
}

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: interviewId,
    applicationId,
    type: 'TECHNICAL',
    status: 'SCHEDULED',
    scheduledAt: new Date('2026-09-01T14:00:00.000Z'),
    completedAt: null,
    notesMarkdown: null,
    feedbackMarkdown: null,
    sortOrder: 1,
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    updatedAt: new Date('2026-08-22T11:00:00.000Z'),
    ...overrides,
  };
}

function serialized(value: Interview) {
  return {
    ...value,
    scheduledAt: value.scheduledAt?.toISOString() ?? null,
    completedAt: value.completedAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

class FakeInterviewService implements InterviewRouteService {
  interviewsToGet: Interview[] = [];
  interviewToCreate: Interview = interview();
  interviewToReplace: Interview = interview();
  getError: unknown;
  createError: unknown;
  replaceError: unknown;
  readonly getCalls: string[] = [];
  readonly createCalls: { applicationId: string; input: InterviewWriteInput }[] = [];
  readonly replaceCalls: {
    applicationId: string;
    interviewId: string;
    input: InterviewWriteInput;
  }[] = [];

  async getInterviews(id: string): Promise<Interview[]> {
    this.getCalls.push(id);
    if (this.getError !== undefined) throw this.getError;
    return this.interviewsToGet;
  }

  async createInterview(
    id: string,
    value: InterviewWriteInput,
  ): Promise<Interview> {
    this.createCalls.push({ applicationId: id, input: value });
    if (this.createError !== undefined) throw this.createError;
    return this.interviewToCreate;
  }

  async replaceInterview(
    id: string,
    childId: string,
    value: InterviewWriteInput,
  ): Promise<Interview> {
    this.replaceCalls.push({
      applicationId: id,
      interviewId: childId,
      input: value,
    });
    if (this.replaceError !== undefined) throw this.replaceError;
    return this.interviewToReplace;
  }
}

function buildInterviewApp(service: InterviewRouteService) {
  const app = buildApp({ interviewService: service });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('Interview API routes', () => {
  it('returns an empty Interview list', async () => {
    const service = new FakeInterviewService();
    const app = buildInterviewApp(service);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/interviews`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ interviews: [] });
    expect(service.getCalls).toEqual([applicationId]);
  });

  it('serializes populated Interviews with explicit nulls', async () => {
    const service = new FakeInterviewService();
    service.interviewsToGet = [interview(), interview({ id: crypto.randomUUID() })];
    const app = buildInterviewApp(service);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/interviews`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      interviews: service.interviewsToGet.map(serialized),
    });
  });

  it('creates an Interview and returns its nested location', async () => {
    const service = new FakeInterviewService();
    const payload = input();
    const app = buildInterviewApp(service);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/interviews`,
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(
      `/api/v1/applications/${applicationId}/interviews/${interviewId}`,
    );
    expect(response.json()).toEqual({
      interview: serialized(service.interviewToCreate),
    });
    expect(service.createCalls).toEqual([{ applicationId, input: payload }]);
  });

  it('fully replaces an owned Interview', async () => {
    const service = new FakeInterviewService();
    const payload = input({ status: 'COMPLETED', sortOrder: 2 });
    service.interviewToReplace = interview({ status: 'COMPLETED', sortOrder: 2 });
    const app = buildInterviewApp(service);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/applications/${applicationId}/interviews/${interviewId}`,
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      interview: serialized(service.interviewToReplace),
    });
    expect(service.replaceCalls).toEqual([
      { applicationId, interviewId, input: payload },
    ]);
  });

  it.each([
    { label: 'invalid enum', payload: { ...input(), type: 'PHONE' } },
    { label: 'negative order', payload: { ...input(), sortOrder: -1 } },
    { label: 'invalid timestamp', payload: { ...input(), scheduledAt: 'tomorrow' } },
    { label: 'missing field', payload: { type: 'TECHNICAL' } },
    { label: 'unknown field', payload: { ...input(), outcome: 'PASSED' } },
  ])('returns safe validation for $label', async ({ payload }) => {
    const service = new FakeInterviewService();
    const app = buildInterviewApp(service);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/applications/${applicationId}/interviews`,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
    });
    expect(service.createCalls).toEqual([]);
  });

  it('rejects malformed nested identifiers before the service', async () => {
    const service = new FakeInterviewService();
    const app = buildInterviewApp(service);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/applications/${applicationId}/interviews/not-a-uuid`,
      payload: input(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_IDENTIFIER' },
    });
    expect(service.replaceCalls).toEqual([]);
  });

  it('maps missing parent and Interview errors centrally', async () => {
    const service = new FakeInterviewService();
    const app = buildInterviewApp(service);
    service.getError = new InterviewApplicationNotFoundError(applicationId);
    const missingParent = await app.inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/interviews`,
    });
    expect(missingParent.statusCode).toBe(404);
    expect(missingParent.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The Application was not found.' },
    });

    service.replaceError = new InterviewNotFoundError(applicationId, interviewId);
    const missingInterview = await app.inject({
      method: 'PUT',
      url: `/api/v1/applications/${applicationId}/interviews/${interviewId}`,
      payload: input(),
    });
    expect(missingInterview.statusCode).toBe(404);
    expect(missingInterview.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The Interview was not found.' },
    });
    expect(missingInterview.body).not.toContain(interviewId);
  });
});
