import { count, eq, sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import { candidateAggregateAdvisoryLockQuery } from '../../src/db/candidate-lock.js';
import * as schema from '../../src/db/schema.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

const expectedCandidateTables = [
  'candidate_education',
  'candidate_experiences',
  'candidate_languages',
  'candidate_profiles',
  'candidate_projects',
  'candidate_skills',
];

let client: Sql;
let database: TestDatabase;

async function resetCandidateState(): Promise<void> {
  await client.unsafe('truncate table candidate_profiles cascade');
}

async function createProfile(fullName = 'Ada Lovelace') {
  const [profile] = await database
    .insert(schema.candidateProfiles)
    .values({ fullName })
    .returning();

  if (!profile) {
    throw new Error('Expected CandidateProfile insert to return a row.');
  }

  return profile;
}

async function expectDatabaseError(
  query: PromiseLike<unknown>,
  code: '23505' | '23514',
): Promise<void> {
  await expect(query).rejects.toMatchObject({ cause: { code } });
}

describe('Candidate persistence schema', () => {
  beforeAll(async () => {
    const target = getTestDatabaseTarget();
    client = postgres(target.url, { max: 5, onnotice: () => undefined });
    database = drizzle(client, { schema });
    await resetCandidateState();
  });

  afterEach(async () => {
    await resetCandidateState();
  });

  afterAll(async () => {
    await client.end();
  });

  it('is created by committed migrations', async () => {
    const tables = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name like 'candidate_%'
      order by table_name
    `;

    expect(tables.map(({ table_name }) => table_name)).toEqual(expectedCandidateTables);
  });

  it('generates UUID keys and round-trips Candidate JSONB arrays', async () => {
    const [profile] = await database
      .insert(schema.candidateProfiles)
      .values({
        fullName: 'Grace Hopper',
        targetRoles: ['Staff Engineer', 'Engineering Manager'],
        targetLocations: ['Remote', 'New York'],
      })
      .returning();

    expect(profile?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(profile?.targetRoles).toEqual(['Staff Engineer', 'Engineering Manager']);
    expect(profile?.targetLocations).toEqual(['Remote', 'New York']);
  });

  it('inserts every owned child and cascades them when the profile is deleted', async () => {
    const profile = await createProfile();

    const [experience] = await database
      .insert(schema.candidateExperiences)
      .values({
        candidateProfileId: profile.id,
        organization: 'Analytical Engines Ltd',
        role: 'Engineer',
        startDate: '2020-01-01',
      })
      .returning();
    const [education] = await database
      .insert(schema.candidateEducation)
      .values({
        candidateProfileId: profile.id,
        institution: 'University of London',
        degree: 'Mathematics',
        startDate: '1835-01-01',
      })
      .returning();
    const [project] = await database
      .insert(schema.candidateProjects)
      .values({
        candidateProfileId: profile.id,
        name: 'Notes on the Analytical Engine',
        technologiesJson: ['Mathematics', 'Algorithms'],
      })
      .returning();
    const [skill] = await database
      .insert(schema.candidateSkills)
      .values({
        candidateProfileId: profile.id,
        name: 'Algorithms',
        category: 'DOMAIN',
        level: 'EXPERT',
      })
      .returning();
    const [language] = await database
      .insert(schema.candidateLanguages)
      .values({ candidateProfileId: profile.id, language: 'English', level: 'Native' })
      .returning();

    for (const child of [experience, education, project, skill, language]) {
      expect(child?.id).toMatch(/^[0-9a-f-]{36}$/u);
      expect(child?.candidateProfileId).toBe(profile.id);
    }
    expect(project?.technologiesJson).toEqual(['Mathematics', 'Algorithms']);

    await database.delete(schema.candidateProfiles).where(eq(schema.candidateProfiles.id, profile.id));

    for (const table of [
      schema.candidateExperiences,
      schema.candidateEducation,
      schema.candidateProjects,
      schema.candidateSkills,
      schema.candidateLanguages,
    ]) {
      const [result] = await database.select({ value: count() }).from(table);
      expect(result?.value).toBe(0);
    }
  });

  it('rejects invalid experience, education, and project date ranges', async () => {
    const profile = await createProfile();

    await expectDatabaseError(
      database.insert(schema.candidateExperiences).values({
        candidateProfileId: profile.id,
        organization: 'Example',
        role: 'Engineer',
        startDate: '2025-02-01',
        endDate: '2025-01-31',
      }),
      '23514',
    );

    await expectDatabaseError(
      database.insert(schema.candidateEducation).values({
        candidateProfileId: profile.id,
        institution: 'Example University',
        degree: 'Example Degree',
        startDate: '2025-02-01',
        endDate: '2025-01-31',
      }),
      '23514',
    );

    await expectDatabaseError(
      database.insert(schema.candidateProjects).values({
        candidateProfileId: profile.id,
        name: 'Example Project',
        startDate: '2025-02-01',
        endDate: '2025-01-31',
      }),
      '23514',
    );
  });

  it('rejects negative sort orders for every Candidate child type', async () => {
    const profile = await createProfile();
    const invalidInserts = [
      database.insert(schema.candidateExperiences).values({
        candidateProfileId: profile.id,
        organization: 'Example',
        role: 'Engineer',
        startDate: '2020-01-01',
        sortOrder: -1,
      }),
      database.insert(schema.candidateEducation).values({
        candidateProfileId: profile.id,
        institution: 'Example University',
        degree: 'Example Degree',
        startDate: '2020-01-01',
        sortOrder: -1,
      }),
      database.insert(schema.candidateProjects).values({
        candidateProfileId: profile.id,
        name: 'Example Project',
        sortOrder: -1,
      }),
      database.insert(schema.candidateSkills).values({
        candidateProfileId: profile.id,
        name: 'TypeScript',
        category: 'PROGRAMMING_LANGUAGE',
        sortOrder: -1,
      }),
      database.insert(schema.candidateLanguages).values({
        candidateProfileId: profile.id,
        language: 'Spanish',
        level: 'Native',
        sortOrder: -1,
      }),
    ];

    for (const insert of invalidInserts) {
      await expectDatabaseError(insert, '23514');
    }
  });

  it('enforces normalized skill uniqueness within each profile only', async () => {
    const firstProfile = await createProfile('First Candidate');
    const secondProfile = await createProfile('Second Candidate');

    await database.insert(schema.candidateSkills).values({
      candidateProfileId: firstProfile.id,
      name: 'TypeScript',
      category: 'PROGRAMMING_LANGUAGE',
    });

    await expectDatabaseError(
      database.insert(schema.candidateSkills).values({
        candidateProfileId: firstProfile.id,
        name: '  typescript  ',
        category: 'PROGRAMMING_LANGUAGE',
      }),
      '23505',
    );

    await expect(
      database.insert(schema.candidateSkills).values({
        candidateProfileId: secondProfile.id,
        name: ' typescript ',
        category: 'PROGRAMMING_LANGUAGE',
      }),
    ).resolves.toBeDefined();
  });

  it('enforces normalized language uniqueness within each profile only', async () => {
    const firstProfile = await createProfile('First Candidate');
    const secondProfile = await createProfile('Second Candidate');

    await database.insert(schema.candidateLanguages).values({
      candidateProfileId: firstProfile.id,
      language: 'Spanish',
      level: 'Native',
    });

    await expectDatabaseError(
      database.insert(schema.candidateLanguages).values({
        candidateProfileId: firstProfile.id,
        language: ' spanish ',
        level: 'Professional',
      }),
      '23505',
    );

    await expect(
      database.insert(schema.candidateLanguages).values({
        candidateProfileId: secondProfile.id,
        language: 'SPANISH',
        level: 'Professional',
      }),
    ).resolves.toBeDefined();
  });

  it('can acquire the stable Candidate aggregate lock within a transaction', async () => {
    await database.transaction(async (transaction) => {
      await transaction.execute(candidateAggregateAdvisoryLockQuery());
      const locks = await transaction.execute<{ lockCount: number }>(sql`
        select count(*)::integer as "lockCount"
        from pg_locks
        where locktype = 'advisory'
          and pid = pg_backend_pid()
      `);

      expect(locks[0]?.lockCount).toBe(1);
    });
  });
});
