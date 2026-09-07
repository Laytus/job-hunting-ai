import { eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import { buildApp } from '../../src/app.js';
import { JobDescriptionRepository } from '../../src/job-description/job-description.repository.js';
import type { JobDescriptionWriteCommand } from '../../src/job-description/job-description.types.js';
import * as schema from '../../src/db/schema.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

let client: Sql;
let database: TestDatabase;
let repository: JobDescriptionRepository;

function command(
  overrides: Partial<JobDescriptionWriteCommand> = {},
): JobDescriptionWriteCommand {
  return {
    title: 'Senior Quant Developer',
    companyName: 'Analytical Engines Ltd',
    descriptionMarkdown: '# Senior Quant Developer\n\nBuild trading systems.',
    requirementsMarkdown: '- TypeScript\n- PostgreSQL',
    responsibilitiesMarkdown: '- Build reliable systems',
    structuredData: { skills: ['TypeScript', 'PostgreSQL'], experienceYears: 3 },
    sourceUrl: 'https://example.com/jobs/quant-developer',
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
      status: 'FOUND',
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
  repository = new JobDescriptionRepository(database);
  await resetApplicationState();
});

afterEach(resetApplicationState);

afterAll(async () => {
  await client.end();
});

describe('Job Description persistence and repository', () => {
  it('is created by the committed migration', async () => {
    const tables = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'job_descriptions'
    `;

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'job_descriptions',
    ]);
  });

  it('returns null before a Job Description exists', async () => {
    const application = await createApplication();

    await expect(
      repository.findByApplicationId(application.id),
    ).resolves.toBeNull();
  });

  it('creates and finds a complete Job Description', async () => {
    const application = await createApplication();

    const result = await repository.replaceForApplication(
      application.id,
      command(),
    );

    expect(result).toMatchObject({
      created: true,
      jobDescription: {
        applicationId: application.id,
        ...command(),
      },
    });
    expect(result?.jobDescription.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(result?.jobDescription.createdAt).toBeInstanceOf(Date);
    expect(result?.jobDescription.updatedAt).toBeInstanceOf(Date);
    await expect(repository.findByApplicationId(application.id)).resolves.toEqual(
      result?.jobDescription,
    );
  });

  it('replaces the current row while preserving identity and creation time', async () => {
    const application = await createApplication();
    const created = await repository.replaceForApplication(application.id, command());
    const oldUpdatedAt = new Date('2020-01-01T00:00:00.000Z');
    await database
      .update(schema.jobDescriptions)
      .set({ updatedAt: oldUpdatedAt })
      .where(eq(schema.jobDescriptions.applicationId, application.id));

    const replacement = command({
      title: null,
      descriptionMarkdown: '# Replacement description',
      requirementsMarkdown: null,
      structuredData: { locationType: 'remote' },
      sourceUrl: null,
    });
    const updated = await repository.replaceForApplication(
      application.id,
      replacement,
    );

    expect(updated).toMatchObject({
      created: false,
      jobDescription: {
        id: created?.jobDescription.id,
        applicationId: application.id,
        createdAt: created?.jobDescription.createdAt,
        ...replacement,
      },
    });
    expect(updated?.jobDescription.updatedAt.getTime()).toBeGreaterThan(
      oldUpdatedAt.getTime(),
    );
    const rows = await database
      .select()
      .from(schema.jobDescriptions)
      .where(eq(schema.jobDescriptions.applicationId, application.id));
    expect(rows).toHaveLength(1);
  });

  it('returns null when replacing for a missing Application', async () => {
    await expect(
      repository.replaceForApplication(
        '00000000-0000-4000-8000-000000000000',
        command(),
      ),
    ).resolves.toBeNull();
  });

  it('enforces the Application foreign key', async () => {
    await expect(
      database.insert(schema.jobDescriptions).values({
        applicationId: '00000000-0000-4000-8000-000000000000',
        ...command(),
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('enforces one Job Description per Application', async () => {
    const application = await createApplication();
    await database.insert(schema.jobDescriptions).values({
      applicationId: application.id,
      ...command(),
    });

    await expect(
      database.insert(schema.jobDescriptions).values({
        applicationId: application.id,
        ...command({ descriptionMarkdown: '# Duplicate' }),
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('rejects a blank required description', async () => {
    const application = await createApplication();

    await expect(
      database.insert(schema.jobDescriptions).values({
        applicationId: application.id,
        ...command({ descriptionMarkdown: '   ' }),
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('cascades with its owning Application without affecting other Applications', async () => {
    const first = await createApplication('First Company');
    const second = await createApplication('Second Company');
    await repository.replaceForApplication(first.id, command());
    await repository.replaceForApplication(second.id, command());

    await database.delete(schema.applications).where(eq(schema.applications.id, first.id));

    await expect(repository.findByApplicationId(first.id)).resolves.toBeNull();
    await expect(repository.findByApplicationId(second.id)).resolves.not.toBeNull();
  });
});

describe('Job Description API with PostgreSQL', () => {
  it('creates, reads, and updates the persisted resource through Fastify', async () => {
    const application = await createApplication();
    const app = buildApp({ database });

    try {
      const initial = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${application.id}/job-description`,
      });
      expect(initial.statusCode).toBe(200);
      expect(initial.json()).toEqual({ jobDescription: null });

      const created = await app.inject({
        method: 'PUT',
        url: `/api/v1/applications/${application.id}/job-description`,
        payload: command(),
      });
      expect(created.statusCode).toBe(201);
      expect(created.headers.location).toBe(
        `/api/v1/applications/${application.id}/job-description`,
      );
      expect(created.json()).toMatchObject({
        jobDescription: {
          applicationId: application.id,
          ...command(),
        },
      });

      const persisted = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${application.id}/job-description`,
      });
      expect(persisted.statusCode).toBe(200);
      expect(persisted.json()).toEqual(created.json());

      const updated = await app.inject({
        method: 'PUT',
        url: `/api/v1/applications/${application.id}/job-description`,
        payload: { descriptionMarkdown: '# Updated role' },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        jobDescription: {
          id: created.json().jobDescription.id,
          applicationId: application.id,
          title: null,
          descriptionMarkdown: '# Updated role',
          structuredData: null,
        },
      });
    } finally {
      await app.close();
    }
  });
});
