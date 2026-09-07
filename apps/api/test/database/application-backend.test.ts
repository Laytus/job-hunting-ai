import { eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import { ApplicationRepository } from '../../src/application/application.repository.js';
import type { ApplicationWriteCommand } from '../../src/application/application.types.js';
import * as schema from '../../src/db/schema.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

let client: Sql;
let database: TestDatabase;
let repository: ApplicationRepository;

function command(
  overrides: Partial<ApplicationWriteCommand> = {},
): ApplicationWriteCommand {
  return {
    companyName: 'Analytical Engines Ltd',
    roleTitle: 'Software Engineer',
    location: 'Remote',
    jobUrl: 'https://example.com/jobs/software-engineer',
    source: 'CAREER_PAGE',
    status: 'FOUND',
    priority: 'MEDIUM',
    dateFound: '2026-08-01',
    dateApplied: null,
    notesMarkdown: null,
    ...overrides,
  };
}

async function resetApplicationState(): Promise<void> {
  await client.unsafe('truncate table applications cascade');
}

describe('ApplicationRepository', () => {
  beforeAll(async () => {
    const target = getTestDatabaseTarget();
    client = postgres(target.url, { max: 5, onnotice: () => undefined });
    database = drizzle(client, { schema });
    repository = new ApplicationRepository(database);
    await resetApplicationState();
  });

  afterEach(resetApplicationState);

  afterAll(async () => {
    await client.end();
  });

  it('creates and maps an Application with database-generated fields', async () => {
    const created = await repository.create(command());

    expect(created).toMatchObject(command());
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });

  it('finds an Application by UUID and returns null when it is absent', async () => {
    const created = await repository.create(command());

    await expect(repository.findById(created.id)).resolves.toEqual(created);
    await expect(
      repository.findById('00000000-0000-4000-8000-000000000000'),
    ).resolves.toBeNull();
  });

  it('orders by priority, updated time, then created time descending', async () => {
    const highUpdatedAt = new Date('2026-06-04T00:00:00.000Z');
    const tiedUpdatedAt = new Date('2026-06-03T00:00:00.000Z');

    await database.insert(schema.applications).values([
      {
        ...command({ companyName: 'Low', priority: 'LOW' }),
        createdAt: new Date('2026-06-06T00:00:00.000Z'),
        updatedAt: new Date('2026-06-06T00:00:00.000Z'),
      },
      {
        ...command({ companyName: 'Critical', priority: 'CRITICAL' }),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
      {
        ...command({ companyName: 'High updated first', priority: 'HIGH' }),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: highUpdatedAt,
      },
      {
        ...command({ companyName: 'High created second', priority: 'HIGH' }),
        createdAt: new Date('2026-06-02T00:00:00.000Z'),
        updatedAt: tiedUpdatedAt,
      },
      {
        ...command({ companyName: 'High created third', priority: 'HIGH' }),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: tiedUpdatedAt,
      },
      {
        ...command({ companyName: 'Medium', priority: 'MEDIUM' }),
        createdAt: new Date('2026-06-05T00:00:00.000Z'),
        updatedAt: new Date('2026-06-05T00:00:00.000Z'),
      },
    ]);

    const applications = await repository.findAll();

    expect(applications.map(({ companyName }) => companyName)).toEqual([
      'Critical',
      'High updated first',
      'High created second',
      'High created third',
      'Medium',
      'Low',
    ]);
  });

  it('replaces mutable fields while preserving UUID and creation time', async () => {
    const created = await repository.create(command());
    const oldUpdatedAt = new Date('2020-01-01T00:00:00.000Z');
    await database
      .update(schema.applications)
      .set({ updatedAt: oldUpdatedAt })
      .where(eq(schema.applications.id, created.id));

    const replaced = await repository.replace(
      created.id,
      command({
        companyName: 'Replacement Company',
        roleTitle: 'Principal Engineer',
        status: 'INTERVIEW',
        priority: 'CRITICAL',
        dateApplied: '2026-08-02',
        notesMarkdown: '# Interview preparation',
      }),
    );

    expect(replaced).toMatchObject({
      id: created.id,
      createdAt: created.createdAt,
      companyName: 'Replacement Company',
      roleTitle: 'Principal Engineer',
      status: 'INTERVIEW',
      priority: 'CRITICAL',
      dateApplied: '2026-08-02',
      notesMarkdown: '# Interview preparation',
    });
    expect(replaced?.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
  });

  it('returns null when replacing an absent Application', async () => {
    await expect(
      repository.replace(
        '00000000-0000-4000-8000-000000000000',
        command(),
      ),
    ).resolves.toBeNull();
  });
});
