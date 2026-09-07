import { eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import { buildApp } from '../../src/app.js';
import { InterviewRepository } from '../../src/interview/interview.repository.js';
import {
  interviewStatuses,
  interviewTypes,
  type InterviewWriteCommand,
} from '../../src/interview/interview.types.js';
import * as schema from '../../src/db/schema.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

let client: Sql;
let database: TestDatabase;
let repository: InterviewRepository;

function command(
  overrides: Partial<InterviewWriteCommand> = {},
): InterviewWriteCommand {
  return {
    type: 'TECHNICAL',
    status: 'SCHEDULED',
    scheduledAt: new Date('2026-09-01T14:00:00.000Z'),
    completedAt: null,
    notesMarkdown: '# Preparation',
    feedbackMarkdown: null,
    sortOrder: 1,
    ...overrides,
  };
}

async function createApplication(companyName = 'Analytical Engines Ltd') {
  const [application] = await database
    .insert(schema.applications)
    .values({
      companyName,
      roleTitle: 'Senior Quant Developer',
      source: 'CAREER_PAGE',
      status: 'INTERVIEW',
      priority: 'HIGH',
    })
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
  repository = new InterviewRepository(database);
  await resetApplicationState();
});

afterEach(resetApplicationState);

afterAll(async () => {
  await client.end();
});

describe('Interview persistence and repository', () => {
  it('is created by the committed migration', async () => {
    const tables = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = 'interviews'
    `;
    expect(tables.map(({ table_name }) => table_name)).toEqual(['interviews']);
  });

  it('creates multiple Interviews with generated UUIDs and timestamps', async () => {
    const application = await createApplication();
    const first = await repository.createForApplication(application.id, command());
    const second = await repository.createForApplication(
      application.id,
      command({ type: 'FINAL', sortOrder: 2 }),
    );

    expect(first).toMatchObject({ applicationId: application.id, ...command() });
    expect(second).toMatchObject({
      applicationId: application.id,
      type: 'FINAL',
      sortOrder: 2,
    });
    expect(first?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(first?.createdAt).toBeInstanceOf(Date);
    expect(first?.updatedAt).toEqual(first?.createdAt);
  });

  it('accepts every approved type and status', async () => {
    const application = await createApplication();
    const values = interviewTypes.map((type, index) => ({
      applicationId: application.id,
      ...command({
        type,
        status: interviewStatuses[index % interviewStatuses.length]!,
        sortOrder: index,
      }),
    }));

    const inserted = await database.insert(schema.interviews).values(values).returning();
    expect(new Set(inserted.map(({ type }) => type))).toEqual(new Set(interviewTypes));
    expect(new Set(inserted.map(({ status }) => status))).toEqual(
      new Set(interviewStatuses),
    );
  });

  it('orders by sort order, scheduled time, creation time, and UUID', async () => {
    const application = await createApplication();
    await database.insert(schema.interviews).values([
      {
        applicationId: application.id,
        ...command({ type: 'FINAL', sortOrder: 2 }),
      },
      {
        applicationId: application.id,
        ...command({
          type: 'TECHNICAL',
          scheduledAt: new Date('2026-09-03T14:00:00.000Z'),
          sortOrder: 1,
        }),
      },
      {
        applicationId: application.id,
        ...command({
          type: 'RECRUITER',
          scheduledAt: new Date('2026-09-01T14:00:00.000Z'),
          sortOrder: 1,
        }),
      },
      {
        applicationId: application.id,
        ...command({ type: 'OTHER', scheduledAt: null, sortOrder: 1 }),
      },
    ]);

    const result = await repository.findAllByApplicationId(application.id);
    expect(result.map(({ type }) => type)).toEqual([
      'RECRUITER',
      'TECHNICAL',
      'OTHER',
      'FINAL',
    ]);
  });

  it('fully replaces an owned Interview while preserving identity', async () => {
    const application = await createApplication();
    const created = await repository.createForApplication(application.id, command());
    if (created === null) throw new Error('Expected a created Interview.');
    const oldUpdatedAt = new Date('2020-01-01T00:00:00.000Z');
    await database
      .update(schema.interviews)
      .set({ updatedAt: oldUpdatedAt })
      .where(eq(schema.interviews.id, created.id));
    const replacement = command({
      type: 'FINAL',
      status: 'COMPLETED',
      completedAt: new Date('2026-09-01T15:00:00.000Z'),
      notesMarkdown: null,
      feedbackMarkdown: '# Positive feedback',
      sortOrder: 3,
    });

    const updated = await repository.replaceForApplication(
      application.id,
      created.id,
      replacement,
    );

    expect(updated).toMatchObject({
      id: created.id,
      applicationId: application.id,
      createdAt: created.createdAt,
      ...replacement,
    });
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
  });

  it('scopes replacement to the owning Application', async () => {
    const owner = await createApplication('Owner');
    const other = await createApplication('Other');
    const created = await repository.createForApplication(owner.id, command());
    if (created === null) throw new Error('Expected a created Interview.');

    await expect(
      repository.replaceForApplication(other.id, created.id, command()),
    ).resolves.toBeNull();
  });

  it('enforces foreign key, timestamp order, and non-negative sort order', async () => {
    await expect(
      database.insert(schema.interviews).values({
        applicationId: '00000000-0000-4000-8000-000000000000',
        ...command(),
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });

    const application = await createApplication();
    await expect(
      database.insert(schema.interviews).values({
        applicationId: application.id,
        ...command({
          completedAt: new Date('2026-09-01T13:00:00.000Z'),
        }),
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(
      database.insert(schema.interviews).values({
        applicationId: application.id,
        ...command({ sortOrder: -1 }),
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('cascades Interviews when the owning Application is deleted', async () => {
    const application = await createApplication();
    await repository.createForApplication(application.id, command());

    await database
      .delete(schema.applications)
      .where(eq(schema.applications.id, application.id));

    await expect(repository.findAllByApplicationId(application.id)).resolves.toEqual([]);
  });
});

describe('Interview API with PostgreSQL', () => {
  it('creates, lists, and updates an Interview through the real stack', async () => {
    const application = await createApplication();
    const app = buildApp({ database });

    try {
      const initial = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${application.id}/interviews`,
      });
      expect(initial.statusCode).toBe(200);
      expect(initial.json()).toEqual({ interviews: [] });

      const payload = {
        type: 'TECHNICAL',
        status: 'SCHEDULED',
        scheduledAt: '2026-09-01T14:00:00.000Z',
        completedAt: null,
        notesMarkdown: null,
        feedbackMarkdown: null,
        sortOrder: 1,
      };
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/applications/${application.id}/interviews`,
        payload,
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ interview: payload });

      const interviewId = created.json().interview.id as string;
      const updated = await app.inject({
        method: 'PUT',
        url: `/api/v1/applications/${application.id}/interviews/${interviewId}`,
        payload: {
          ...payload,
          status: 'COMPLETED',
          completedAt: '2026-09-01T15:00:00.000Z',
        },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        interview: {
          id: interviewId,
          status: 'COMPLETED',
          completedAt: '2026-09-01T15:00:00.000Z',
        },
      });

      const listed = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${application.id}/interviews`,
      });
      expect(listed.json().interviews).toHaveLength(1);
      expect(listed.json().interviews[0]).toEqual(updated.json().interview);
    } finally {
      await app.close();
    }
  });
});
