import { count } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import {
  applicationPriorities,
  applicationSources,
  applicationStatuses,
} from '../../src/application/application.types.js';
import * as schema from '../../src/db/schema.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

let client: Sql;
let database: TestDatabase;

async function resetApplicationState(): Promise<void> {
  await client.unsafe('truncate table applications cascade');
}

async function expectCheckViolation(query: PromiseLike<unknown>): Promise<void> {
  await expect(query).rejects.toMatchObject({ cause: { code: '23514' } });
}

describe('Application persistence schema', () => {
  beforeAll(async () => {
    const target = getTestDatabaseTarget();
    client = postgres(target.url, { max: 5, onnotice: () => undefined });
    database = drizzle(client, { schema });
    await resetApplicationState();
  });

  afterEach(async () => {
    await resetApplicationState();
  });

  afterAll(async () => {
    await client.end();
  });

  it('is created by the committed migration', async () => {
    const tables = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'applications'
    `;

    expect(tables.map(({ table_name }) => table_name)).toEqual(['applications']);
  });

  it('creates an Application with a generated UUID and timestamps', async () => {
    const [application] = await database
      .insert(schema.applications)
      .values({
        companyName: 'Analytical Engines Ltd',
        roleTitle: 'Software Engineer',
        location: 'Remote',
        jobUrl: 'https://example.com/jobs/software-engineer',
        source: 'CAREER_PAGE',
        status: 'FOUND',
        priority: 'HIGH',
        dateFound: '2026-08-01',
        dateApplied: null,
        notesMarkdown: 'Promising distributed systems role.',
      })
      .returning();

    expect(application).toMatchObject({
      companyName: 'Analytical Engines Ltd',
      roleTitle: 'Software Engineer',
      location: 'Remote',
      jobUrl: 'https://example.com/jobs/software-engineer',
      source: 'CAREER_PAGE',
      status: 'FOUND',
      priority: 'HIGH',
      dateFound: '2026-08-01',
      dateApplied: null,
      notesMarkdown: 'Promising distributed systems role.',
    });
    expect(application?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(application?.createdAt).toBeInstanceOf(Date);
    expect(application?.updatedAt).toBeInstanceOf(Date);
    expect(application?.createdAt.getTime()).toBeGreaterThan(0);
    expect(application?.updatedAt).toEqual(application?.createdAt);
  });

  it('accepts every approved status, priority, and source enum value', async () => {
    const values = applicationStatuses.map((status, index) => ({
      companyName: `Company ${index}`,
      roleTitle: `Role ${index}`,
      status,
      priority: applicationPriorities[index % applicationPriorities.length]!,
      source: applicationSources[index % applicationSources.length]!,
    }));

    const inserted = await database.insert(schema.applications).values(values).returning();

    expect(new Set(inserted.map(({ status }) => status))).toEqual(
      new Set(applicationStatuses),
    );
    expect(new Set(inserted.map(({ priority }) => priority))).toEqual(
      new Set(applicationPriorities),
    );
    expect(new Set(inserted.map(({ source }) => source))).toEqual(
      new Set(applicationSources),
    );
  });

  it('allows multiple independent Applications to coexist', async () => {
    await database.insert(schema.applications).values([
      {
        companyName: 'Application A Company',
        roleTitle: 'Role A',
        source: 'LINKEDIN',
        status: 'FOUND',
        priority: 'LOW',
      },
      {
        companyName: 'Application B Company',
        roleTitle: 'Role B',
        source: 'REFERRAL',
        status: 'APPLIED',
        priority: 'MEDIUM',
      },
      {
        companyName: 'Application C Company',
        roleTitle: 'Role C',
        source: 'RECRUITER',
        status: 'INTERVIEW',
        priority: 'CRITICAL',
      },
    ]);

    const [result] = await database.select({ value: count() }).from(schema.applications);
    expect(result?.value).toBe(3);
  });

  it('rejects blank company names', async () => {
    await expectCheckViolation(
      database.insert(schema.applications).values({
        companyName: '   ',
        roleTitle: 'Software Engineer',
        source: 'OTHER',
        status: 'FOUND',
        priority: 'MEDIUM',
      }),
    );
  });

  it('rejects blank role titles', async () => {
    await expectCheckViolation(
      database.insert(schema.applications).values({
        companyName: 'Example Company',
        roleTitle: '   ',
        source: 'OTHER',
        status: 'FOUND',
        priority: 'MEDIUM',
      }),
    );
  });

  it('rejects an applied date before the found date', async () => {
    await expectCheckViolation(
      database.insert(schema.applications).values({
        companyName: 'Example Company',
        roleTitle: 'Software Engineer',
        source: 'OTHER',
        status: 'APPLIED',
        priority: 'MEDIUM',
        dateFound: '2026-08-15',
        dateApplied: '2026-08-14',
      }),
    );
  });
});
