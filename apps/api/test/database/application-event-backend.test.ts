import { eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import { buildApp } from '../../src/app.js';
import { ApplicationEventRepository } from '../../src/application-event/application-event.repository.js';
import { applicationEventTypes } from '../../src/application-event/application-event.types.js';
import { ApplicationRepository } from '../../src/application/application.repository.js';
import type { ApplicationWriteCommand } from '../../src/application/application.types.js';
import * as schema from '../../src/db/schema.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

let client: Sql;
let database: TestDatabase;
let eventRepository: ApplicationEventRepository;

function applicationCommand(
  overrides: Partial<ApplicationWriteCommand> = {},
): ApplicationWriteCommand {
  return {
    companyName: 'Analytical Engines Ltd',
    roleTitle: 'Senior Quant Developer',
    location: 'Remote',
    jobUrl: 'https://example.com/jobs/quant-developer',
    source: 'CAREER_PAGE',
    status: 'FOUND',
    priority: 'HIGH',
    dateFound: '2026-08-22',
    dateApplied: null,
    notesMarkdown: null,
    ...overrides,
  };
}

async function createApplication() {
  const [application] = await database
    .insert(schema.applications)
    .values(applicationCommand())
    .returning();
  if (application === undefined) {
    throw new Error('Test Application insert did not return a row.');
  }
  return application;
}

async function resetApplicationState(): Promise<void> {
  await client.unsafe('truncate table applications cascade');
}

beforeAll(async () => {
  const target = getTestDatabaseTarget();
  client = postgres(target.url, { max: 5, onnotice: () => undefined });
  database = drizzle(client, { schema });
  eventRepository = new ApplicationEventRepository(database);
  await resetApplicationState();
});

afterEach(resetApplicationState);

afterAll(async () => {
  await client.end();
});

describe('Application Event persistence', () => {
  it('is created by the migration with every approved enum value', async () => {
    const tables = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = 'application_events'
    `;
    const enumRows = await client<{ enumlabel: string }[]>`
      select enumlabel
      from pg_enum
      join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'application_event_type'
      order by enumsortorder
    `;

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'application_events',
    ]);
    expect(enumRows.map(({ enumlabel }) => enumlabel)).toEqual(
      applicationEventTypes,
    );
  });

  it('persists generated identity, timestamps, metadata, and all event types', async () => {
    const application = await createApplication();
    const occurredAt = new Date('2026-08-22T12:00:00.000Z');
    const inserted = await database
      .insert(schema.applicationEvents)
      .values(
        applicationEventTypes.map((type, index) => ({
          applicationId: application.id,
          type,
          title: `Event ${index}`,
          description: `Description ${index}`,
          metadata: { index, nested: { safe: true } },
          occurredAt: new Date(occurredAt.getTime() + index * 1_000),
        })),
      )
      .returning();

    expect(inserted).toHaveLength(applicationEventTypes.length);
    expect(inserted[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(inserted[0]?.createdAt).toBeInstanceOf(Date);
    expect(inserted[0]?.metadata).toEqual({ index: 0, nested: { safe: true } });
  });

  it('orders newest occurrence first with deterministic timestamp and UUID ties', async () => {
    const application = await createApplication();
    const sameOccurrence = new Date('2026-08-22T12:00:00.000Z');
    const sameCreation = new Date('2026-08-22T12:00:01.000Z');
    await database.insert(schema.applicationEvents).values([
      {
        id: '10000000-0000-4000-8000-000000000000',
        applicationId: application.id,
        type: 'APPLICATION_CREATED',
        title: 'Oldest',
        description: 'Oldest occurrence',
        occurredAt: new Date('2026-08-22T11:00:00.000Z'),
        createdAt: sameCreation,
      },
      {
        id: '20000000-0000-4000-8000-000000000000',
        applicationId: application.id,
        type: 'APPLICATION_UPDATED',
        title: 'Lower UUID',
        description: 'Same timestamps and lower UUID',
        occurredAt: sameOccurrence,
        createdAt: sameCreation,
      },
      {
        id: '30000000-0000-4000-8000-000000000000',
        applicationId: application.id,
        type: 'APPLICATION_UPDATED',
        title: 'Higher UUID',
        description: 'Same timestamps and higher UUID',
        occurredAt: sameOccurrence,
        createdAt: sameCreation,
      },
      {
        id: '40000000-0000-4000-8000-000000000000',
        applicationId: application.id,
        type: 'APPLICATION_UPDATED',
        title: 'Latest creation',
        description: 'Same occurrence and later creation',
        occurredAt: sameOccurrence,
        createdAt: new Date('2026-08-22T12:00:02.000Z'),
      },
    ]);

    const events = await eventRepository.findAllByApplicationId(application.id);
    expect(events.map(({ title }) => title)).toEqual([
      'Latest creation',
      'Higher UUID',
      'Lower UUID',
      'Oldest',
    ]);
  });

  it('enforces ownership, content, and object metadata constraints', async () => {
    const application = await createApplication();
    const valid = {
      applicationId: application.id,
      type: 'APPLICATION_UPDATED' as const,
      title: 'Application updated',
      description: 'Application details changed.',
      occurredAt: new Date(),
    };

    await expect(
      database.insert(schema.applicationEvents).values({
        ...valid,
        applicationId: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await expect(
      database.insert(schema.applicationEvents).values({ ...valid, title: '   ' }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(
      database
        .insert(schema.applicationEvents)
        .values({
          ...valid,
          metadata: [] as unknown as Record<string, unknown>,
        }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('cascades history with its Application and leaves other history intact', async () => {
    const first = await createApplication();
    const second = await createApplication();
    const values = [first, second].map((application) => ({
      applicationId: application.id,
      type: 'APPLICATION_CREATED' as const,
      title: 'Application created',
      description: 'Application was created.',
      occurredAt: new Date(),
    }));
    await database.insert(schema.applicationEvents).values(values);

    await database.delete(schema.applications).where(eq(schema.applications.id, first.id));

    await expect(eventRepository.findAllByApplicationId(first.id)).resolves.toEqual([]);
    await expect(
      eventRepository.findAllByApplicationId(second.id),
    ).resolves.toHaveLength(1);
  });

  it('rolls back a domain mutation when its event cannot be persisted', async () => {
    const repository = new ApplicationRepository(database);

    await expect(
      repository.create(applicationCommand(), {
        type: 'APPLICATION_CREATED',
        title: '   ',
        description: 'Application was created.',
        metadata: null,
        occurredAt: new Date(),
      }),
    ).rejects.toBeDefined();

    await expect(repository.findAll()).resolves.toEqual([]);
  });
});

describe('Application Event API and automatic generation with PostgreSQL', () => {
  it('returns an empty history and 404 for a missing parent', async () => {
    const application = await createApplication();
    const app = buildApp({ database });
    try {
      const empty = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${application.id}/events`,
      });
      const missing = await app.inject({
        method: 'GET',
        url: '/api/v1/applications/00000000-0000-4000-8000-000000000000/events',
      });

      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual({ events: [] });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    } finally {
      await app.close();
    }
  });

  it('records Application, Job Description, and Interview actions through services', async () => {
    let time = Date.parse('2026-08-22T12:00:00.000Z');
    const app = buildApp({
      database,
      currentDate: () => {
        const value = new Date(time);
        time += 1_000;
        return value;
      },
    });

    try {
      const createdApplication = await app.inject({
        method: 'POST',
        url: '/api/v1/applications',
        payload: applicationCommand(),
      });
      expect(createdApplication.statusCode).toBe(201);
      const applicationId = createdApplication.json().application.id as string;

      const updatedApplication = await app.inject({
        method: 'PUT',
        url: `/api/v1/applications/${applicationId}`,
        payload: applicationCommand({ status: 'APPLIED', dateApplied: '2026-08-22' }),
      });
      expect(updatedApplication.statusCode).toBe(200);

      const createdDescription = await app.inject({
        method: 'PUT',
        url: `/api/v1/applications/${applicationId}/job-description`,
        payload: { descriptionMarkdown: '# Senior Quant Developer' },
      });
      expect(createdDescription.statusCode).toBe(201);
      const updatedDescription = await app.inject({
        method: 'PUT',
        url: `/api/v1/applications/${applicationId}/job-description`,
        payload: { descriptionMarkdown: '# Updated role' },
      });
      expect(updatedDescription.statusCode).toBe(200);

      const createdInterview = await app.inject({
        method: 'POST',
        url: `/api/v1/applications/${applicationId}/interviews`,
        payload: {
          type: 'TECHNICAL',
          status: 'SCHEDULED',
          scheduledAt: '2026-09-01T14:00:00.000Z',
          completedAt: null,
          notesMarkdown: null,
          feedbackMarkdown: null,
          sortOrder: 1,
        },
      });
      expect(createdInterview.statusCode).toBe(201);
      const interviewId = createdInterview.json().interview.id as string;
      const updatedInterview = await app.inject({
        method: 'PUT',
        url: `/api/v1/applications/${applicationId}/interviews/${interviewId}`,
        payload: {
          type: 'TECHNICAL',
          status: 'COMPLETED',
          scheduledAt: '2026-09-01T14:00:00.000Z',
          completedAt: '2026-09-01T15:00:00.000Z',
          notesMarkdown: null,
          feedbackMarkdown: '# Strong interview',
          sortOrder: 1,
        },
      });
      expect(updatedInterview.statusCode).toBe(200);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${applicationId}/events`,
      });
      const events = response.json().events as {
        type: string;
        metadata: Record<string, unknown> | null;
        occurredAt: string;
      }[];

      expect(response.statusCode).toBe(200);
      const eventTypes = events.map(({ type }) => type);
      expect(eventTypes.slice(0, 4)).toEqual([
        'INTERVIEW_UPDATED',
        'INTERVIEW_CREATED',
        'JOB_DESCRIPTION_UPDATED',
        'JOB_DESCRIPTION_CREATED',
      ]);
      expect(new Set(eventTypes.slice(4, 6))).toEqual(
        new Set(['APPLICATION_UPDATED', 'APPLICATION_STATUS_CHANGED']),
      );
      expect(eventTypes[6]).toBe('APPLICATION_CREATED');
      expect(events.find(({ type }) => type === 'APPLICATION_STATUS_CHANGED'))
        .toMatchObject({
          metadata: { previousStatus: 'FOUND', newStatus: 'APPLIED' },
        });
      expect(events.every(({ occurredAt }) => occurredAt.endsWith('Z'))).toBe(true);
    } finally {
      await app.close();
    }
  });
});
