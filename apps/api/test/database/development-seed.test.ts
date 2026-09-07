import { eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import * as schema from '../../src/db/schema.js';
import { developmentSeedData } from '../../src/seed/development-seed.data.js';
import {
  DevelopmentSeedConflictError,
  seedDevelopmentDatabase,
} from '../../src/seed/development-seed.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

let client: Sql;
let database: TestDatabase;
const primarySeedApplication = developmentSeedData.applications[0];

if (primarySeedApplication === undefined) {
  throw new Error('Expected at least one seeded Application.');
}

async function resetDomainState(): Promise<void> {
  await client.unsafe('truncate table applications, candidate_profiles cascade');
}

beforeAll(async () => {
  const target = getTestDatabaseTarget();
  client = postgres(target.url, { max: 3, onnotice: () => undefined });
  database = drizzle(client, { schema });
  await resetDomainState();
});

afterEach(resetDomainState);

afterAll(async () => {
  await client.end();
});

describe('development seed persistence', () => {
  it('creates realistic data for every currently supported entity', async () => {
    const summary = await seedDevelopmentDatabase(database);
    const [profiles, experiences, education, projects, skills, languages] =
      await Promise.all([
        database.select().from(schema.candidateProfiles),
        database.select().from(schema.candidateExperiences),
        database.select().from(schema.candidateEducation),
        database.select().from(schema.candidateProjects),
        database.select().from(schema.candidateSkills),
        database.select().from(schema.candidateLanguages),
      ]);
    const [applications, descriptions, interviews, events] = await Promise.all([
      database.select().from(schema.applications),
      database.select().from(schema.jobDescriptions),
      database.select().from(schema.interviews),
      database.select().from(schema.applicationEvents),
    ]);

    expect(summary).toEqual({
      candidateProfiles: 1,
      candidateExperiences: 2,
      candidateEducation: 1,
      candidateProjects: 2,
      candidateSkills: 6,
      candidateLanguages: 2,
      applications: 4,
      jobDescriptions: 3,
      interviews: 4,
      applicationEvents: 17,
    });
    expect(profiles).toHaveLength(1);
    expect(experiences).toHaveLength(2);
    expect(education).toHaveLength(1);
    expect(projects).toHaveLength(2);
    expect(skills).toHaveLength(6);
    expect(languages).toHaveLength(2);
    expect(applications).toHaveLength(4);
    expect(descriptions).toHaveLength(3);
    expect(interviews).toHaveLength(4);
    expect(events).toHaveLength(17);
    expect(new Set(applications.map(({ status }) => status)).size).toBeGreaterThan(2);
    expect(new Set(applications.map(({ priority }) => priority))).toEqual(
      new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    );
  });

  it('is repeatable without duplicates or timestamp drift', async () => {
    await seedDevelopmentDatabase(database);
    const firstApplications = await database
      .select()
      .from(schema.applications)
      .orderBy(schema.applications.id);
    const firstSkills = await database
      .select()
      .from(schema.candidateSkills)
      .orderBy(schema.candidateSkills.id);

    await seedDevelopmentDatabase(database);

    await expect(
      database.select().from(schema.applications).orderBy(schema.applications.id),
    ).resolves.toEqual(firstApplications);
    await expect(
      database.select().from(schema.candidateSkills).orderBy(schema.candidateSkills.id),
    ).resolves.toEqual(firstSkills);
    await expect(database.select().from(schema.applicationEvents)).resolves.toHaveLength(
      developmentSeedData.applicationEvents.length,
    );
  });

  it('resets seed-owned records while preserving unrelated Applications', async () => {
    await seedDevelopmentDatabase(database);
    const [unrelated] = await database
      .insert(schema.applications)
      .values({
        companyName: 'User-owned Company',
        roleTitle: 'User-owned Role',
        source: 'OTHER',
        status: 'FOUND',
        priority: 'MEDIUM',
      })
      .returning();
    if (unrelated === undefined) throw new Error('Expected an unrelated Application.');
    await database
      .update(schema.applications)
      .set({ companyName: 'Locally edited seed value' })
      .where(eq(schema.applications.id, primarySeedApplication.id));

    await seedDevelopmentDatabase(database);

    await expect(
      database
        .select()
        .from(schema.applications)
        .where(eq(schema.applications.id, unrelated.id)),
    ).resolves.toHaveLength(1);
    const [resetSeedApplication] = await database
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, primarySeedApplication.id));
    expect(resetSeedApplication?.companyName).toBe(
      primarySeedApplication.companyName,
    );
  });

  it('refuses to replace a non-seed Candidate Profile', async () => {
    const [profile] = await database
      .insert(schema.candidateProfiles)
      .values({ fullName: 'User-owned Candidate' })
      .returning();

    await expect(seedDevelopmentDatabase(database)).rejects.toBeInstanceOf(
      DevelopmentSeedConflictError,
    );
    await expect(database.select().from(schema.candidateProfiles)).resolves.toEqual([
      profile,
    ]);
    await expect(database.select().from(schema.applications)).resolves.toEqual([]);
  });

  it('refuses a reserved Application identifier without the seed marker', async () => {
    const reservedId = primarySeedApplication.id;
    await database.insert(schema.applications).values({
      id: reservedId,
      companyName: 'User-owned collision',
      roleTitle: 'Engineer',
      source: 'OTHER',
      status: 'FOUND',
      priority: 'LOW',
      notesMarkdown: null,
    });

    await expect(seedDevelopmentDatabase(database)).rejects.toBeInstanceOf(
      DevelopmentSeedConflictError,
    );
    const [collision] = await database
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, reservedId));
    expect(collision?.companyName).toBe('User-owned collision');
    await expect(database.select().from(schema.candidateProfiles)).resolves.toEqual([]);
  });
});
