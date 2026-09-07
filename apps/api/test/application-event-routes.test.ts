import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { ApplicationEventApplicationNotFoundError } from '../src/application-event/application-event.errors.js';
import type { ApplicationEventRouteService } from '../src/application-event/application-event.routes.js';
import type { ApplicationEvent } from '../src/application-event/application-event.types.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const apps: ReturnType<typeof buildApp>[] = [];

function event(overrides: Partial<ApplicationEvent> = {}): ApplicationEvent {
  return {
    id: '20000000-0000-4000-8000-000000000000',
    applicationId,
    type: 'APPLICATION_STATUS_CHANGED',
    title: 'Application status changed',
    description: 'Application status changed from FOUND to APPLIED.',
    metadata: { previousStatus: 'FOUND', newStatus: 'APPLIED' },
    occurredAt: new Date('2026-08-22T12:00:00.000Z'),
    createdAt: new Date('2026-08-22T12:00:01.000Z'),
    ...overrides,
  };
}

class FakeApplicationEventService implements ApplicationEventRouteService {
  events: ApplicationEvent[] = [];
  error: unknown;
  readonly calls: string[] = [];

  async getApplicationEvents(id: string): Promise<ApplicationEvent[]> {
    this.calls.push(id);
    if (this.error !== undefined) throw this.error;
    return this.events;
  }
}

function buildEventApp(service: ApplicationEventRouteService) {
  const app = buildApp({ applicationEventService: service });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('Application Event API route', () => {
  it('returns an empty event collection', async () => {
    const service = new FakeApplicationEventService();
    const response = await buildEventApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/events`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ events: [] });
    expect(service.calls).toEqual([applicationId]);
  });

  it('serializes event metadata and timestamps', async () => {
    const service = new FakeApplicationEventService();
    service.events = [event(), event({ id: crypto.randomUUID(), metadata: null })];
    const response = await buildEventApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/events`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      events: service.events.map((value) => ({
        ...value,
        occurredAt: value.occurredAt.toISOString(),
        createdAt: value.createdAt.toISOString(),
      })),
    });
  });

  it('rejects a malformed UUID before calling the service', async () => {
    const service = new FakeApplicationEventService();
    const response = await buildEventApp(service).inject({
      method: 'GET',
      url: '/api/v1/applications/not-a-uuid/events',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_IDENTIFIER' },
    });
    expect(service.calls).toEqual([]);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'does not expose %s mutation access',
    async (method) => {
      const service = new FakeApplicationEventService();
      const response = await buildEventApp(service).inject({
        method,
        url: `/api/v1/applications/${applicationId}/events`,
        payload: { type: 'APPLICATION_UPDATED' },
      });

      expect(response.statusCode).toBe(404);
      expect(service.calls).toEqual([]);
    },
  );

  it('maps a missing parent through centralized domain error handling', async () => {
    const service = new FakeApplicationEventService();
    service.error = new ApplicationEventApplicationNotFoundError(applicationId);
    const response = await buildEventApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/events`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'The Application was not found.' },
    });
  });

  it('does not leak unexpected errors', async () => {
    const service = new FakeApplicationEventService();
    service.error = new Error('connection data and SQL');
    const response = await buildEventApp(service).inject({
      method: 'GET',
      url: `/api/v1/applications/${applicationId}/events`,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(response.body).not.toContain('connection data');
    expect(response.body).not.toContain('SQL');
  });
});
