import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import { CandidateInvariantViolationError } from '../../src/candidate/candidate.errors.js';
import { CandidateProfileRepository } from '../../src/candidate/candidate.repository.js';
import * as schema from '../../src/db/schema.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

const profileId = '10000000-0000-4000-8000-000000000000';

let client: Sql;
let database: TestDatabase;
let repository: CandidateProfileRepository;

async function resetCandidateState(): Promise<void> {
  await client.unsafe('truncate table candidate_profiles cascade');
}

describe('CandidateProfileRepository', () => {
  beforeAll(async () => {
    const target = getTestDatabaseTarget();
    client = postgres(target.url, { max: 5, onnotice: () => undefined });
    database = drizzle(client, { schema });
    repository = new CandidateProfileRepository(database);
    await resetCandidateState();
  });

  afterEach(async () => {
    await resetCandidateState();
  });

  afterAll(async () => {
    await client.end();
  });

  it('returns null when no CandidateProfile exists', async () => {
    await expect(repository.loadAggregate()).resolves.toBeNull();
  });

  it('loads and maps the complete Candidate aggregate', async () => {
    const profileCreatedAt = new Date('2026-01-01T10:00:00.000Z');
    const profileUpdatedAt = new Date('2026-01-02T10:00:00.000Z');
    const childCreatedAt = new Date('2026-01-03T10:00:00.000Z');
    const childUpdatedAt = new Date('2026-01-04T10:00:00.000Z');

    await database.insert(schema.candidateProfiles).values({
      id: profileId,
      fullName: 'Ada Lovelace',
      headline: 'Computing pioneer',
      summaryMarkdown: '# Summary',
      linkedinUrl: 'https://www.linkedin.com/in/ada',
      githubUrl: 'https://github.com/ada',
      portfolioUrl: 'https://ada.example.com',
      location: 'London',
      targetRoles: ['Staff Engineer'],
      targetLocations: ['Remote'],
      careerGoalsMarkdown: '# Goals',
      cvMarkdown: '# CV',
      additionalContext: 'Additional context',
      createdAt: profileCreatedAt,
      updatedAt: profileUpdatedAt,
    });
    await database.insert(schema.candidateExperiences).values({
      id: '11000000-0000-4000-8000-000000000000',
      candidateProfileId: profileId,
      organization: 'Analytical Engines Ltd',
      role: 'Engineer',
      location: 'London',
      startDate: '2020-01-01',
      endDate: '2022-01-01',
      descriptionMarkdown: 'Built analytical engines.',
      sortOrder: 1,
      createdAt: childCreatedAt,
      updatedAt: childUpdatedAt,
    });
    await database.insert(schema.candidateEducation).values({
      id: '12000000-0000-4000-8000-000000000000',
      candidateProfileId: profileId,
      institution: 'University of London',
      degree: 'Mathematics',
      fieldOfStudy: 'Applied Mathematics',
      location: 'London',
      startDate: '1830-01-01',
      endDate: '1835-01-01',
      descriptionMarkdown: 'Advanced mathematics.',
      sortOrder: 2,
      createdAt: childCreatedAt,
      updatedAt: childUpdatedAt,
    });
    await database.insert(schema.candidateProjects).values({
      id: '13000000-0000-4000-8000-000000000000',
      candidateProfileId: profileId,
      name: 'Analytical Engine Notes',
      role: 'Author',
      descriptionMarkdown: 'Documented a general-purpose computing machine.',
      projectUrl: 'https://ada.example.com/engine',
      repositoryUrl: 'https://github.com/ada/engine',
      startDate: '1842-01-01',
      endDate: '1843-01-01',
      technologiesJson: ['Algorithms', 'Mathematics'],
      sortOrder: 3,
      createdAt: childCreatedAt,
      updatedAt: childUpdatedAt,
    });
    await database.insert(schema.candidateSkills).values({
      id: '14000000-0000-4000-8000-000000000000',
      candidateProfileId: profileId,
      name: 'Algorithms',
      category: 'DOMAIN',
      level: 'EXPERT',
      notes: 'Algorithm design',
      sortOrder: 4,
      createdAt: childCreatedAt,
      updatedAt: childUpdatedAt,
    });
    await database.insert(schema.candidateLanguages).values({
      id: '15000000-0000-4000-8000-000000000000',
      candidateProfileId: profileId,
      language: 'English',
      level: 'Native',
      certification: 'None required',
      notes: 'Primary language',
      sortOrder: 5,
      createdAt: childCreatedAt,
      updatedAt: childUpdatedAt,
    });

    const aggregate = await repository.loadAggregate();

    expect(aggregate).toEqual({
      id: profileId,
      fullName: 'Ada Lovelace',
      headline: 'Computing pioneer',
      summaryMarkdown: '# Summary',
      linkedinUrl: 'https://www.linkedin.com/in/ada',
      githubUrl: 'https://github.com/ada',
      portfolioUrl: 'https://ada.example.com',
      location: 'London',
      targetRoles: ['Staff Engineer'],
      targetLocations: ['Remote'],
      careerGoalsMarkdown: '# Goals',
      cvMarkdown: '# CV',
      additionalContext: 'Additional context',
      createdAt: profileCreatedAt,
      updatedAt: profileUpdatedAt,
      experiences: [
        {
          id: '11000000-0000-4000-8000-000000000000',
          organization: 'Analytical Engines Ltd',
          role: 'Engineer',
          location: 'London',
          startDate: '2020-01-01',
          endDate: '2022-01-01',
          descriptionMarkdown: 'Built analytical engines.',
          sortOrder: 1,
          createdAt: childCreatedAt,
          updatedAt: childUpdatedAt,
        },
      ],
      education: [
        {
          id: '12000000-0000-4000-8000-000000000000',
          institution: 'University of London',
          degree: 'Mathematics',
          fieldOfStudy: 'Applied Mathematics',
          location: 'London',
          startDate: '1830-01-01',
          endDate: '1835-01-01',
          descriptionMarkdown: 'Advanced mathematics.',
          sortOrder: 2,
          createdAt: childCreatedAt,
          updatedAt: childUpdatedAt,
        },
      ],
      projects: [
        {
          id: '13000000-0000-4000-8000-000000000000',
          name: 'Analytical Engine Notes',
          role: 'Author',
          descriptionMarkdown: 'Documented a general-purpose computing machine.',
          projectUrl: 'https://ada.example.com/engine',
          repositoryUrl: 'https://github.com/ada/engine',
          startDate: '1842-01-01',
          endDate: '1843-01-01',
          technologies: ['Algorithms', 'Mathematics'],
          sortOrder: 3,
          createdAt: childCreatedAt,
          updatedAt: childUpdatedAt,
        },
      ],
      skills: [
        {
          id: '14000000-0000-4000-8000-000000000000',
          name: 'Algorithms',
          category: 'DOMAIN',
          level: 'EXPERT',
          notes: 'Algorithm design',
          sortOrder: 4,
          createdAt: childCreatedAt,
          updatedAt: childUpdatedAt,
        },
      ],
      languages: [
        {
          id: '15000000-0000-4000-8000-000000000000',
          language: 'English',
          level: 'Native',
          certification: 'None required',
          notes: 'Primary language',
          sortOrder: 5,
          createdAt: childCreatedAt,
          updatedAt: childUpdatedAt,
        },
      ],
    });

    const serialized = JSON.stringify(aggregate);
    for (const databaseFieldName of [
      'candidate_profile_id',
      'candidateProfileId',
      'technologies_json',
      'technologiesJson',
      'sort_order',
      'created_at',
      'updated_at',
    ]) {
      expect(serialized).not.toContain(`"${databaseFieldName}"`);
    }
  });

  it('orders every Candidate child collection deterministically', async () => {
    await database
      .insert(schema.candidateProfiles)
      .values({ id: profileId, fullName: 'Ordering Candidate' });

    await database.insert(schema.candidateExperiences).values([
      {
        id: '21000000-0000-4000-8000-000000000001',
        candidateProfileId: profileId,
        organization: 'Sort One',
        role: 'Engineer',
        startDate: '2024-01-01',
        sortOrder: 1,
      },
      {
        id: '21000000-0000-4000-8000-000000000002',
        candidateProfileId: profileId,
        organization: 'Earlier',
        role: 'Engineer',
        startDate: '2020-01-01',
      },
      {
        id: '21000000-0000-4000-8000-000000000004',
        candidateProfileId: profileId,
        organization: 'Tie Two',
        role: 'Engineer',
        startDate: '2022-01-01',
      },
      {
        id: '21000000-0000-4000-8000-000000000003',
        candidateProfileId: profileId,
        organization: 'Tie One',
        role: 'Engineer',
        startDate: '2022-01-01',
      },
    ]);
    await database.insert(schema.candidateEducation).values([
      {
        id: '22000000-0000-4000-8000-000000000001',
        candidateProfileId: profileId,
        institution: 'Sort One',
        degree: 'Degree',
        startDate: '2024-01-01',
        sortOrder: 1,
      },
      {
        id: '22000000-0000-4000-8000-000000000002',
        candidateProfileId: profileId,
        institution: 'Earlier',
        degree: 'Degree',
        startDate: '2020-01-01',
      },
      {
        id: '22000000-0000-4000-8000-000000000004',
        candidateProfileId: profileId,
        institution: 'Tie Two',
        degree: 'Degree',
        startDate: '2022-01-01',
      },
      {
        id: '22000000-0000-4000-8000-000000000003',
        candidateProfileId: profileId,
        institution: 'Tie One',
        degree: 'Degree',
        startDate: '2022-01-01',
      },
    ]);
    await database.insert(schema.candidateProjects).values([
      {
        id: '23000000-0000-4000-8000-000000000001',
        candidateProfileId: profileId,
        name: 'Null Start',
      },
      {
        id: '23000000-0000-4000-8000-000000000003',
        candidateProfileId: profileId,
        name: 'Tie Two',
        startDate: '2022-01-01',
      },
      {
        id: '23000000-0000-4000-8000-000000000002',
        candidateProfileId: profileId,
        name: 'Tie One',
        startDate: '2022-01-01',
      },
      {
        id: '23000000-0000-4000-8000-000000000004',
        candidateProfileId: profileId,
        name: 'Sort One',
        startDate: '2024-01-01',
        sortOrder: 1,
      },
    ]);
    await database.insert(schema.candidateSkills).values([
      {
        id: '24000000-0000-4000-8000-000000000001',
        candidateProfileId: profileId,
        name: 'React',
        category: 'FRAMEWORK',
      },
      {
        id: '24000000-0000-4000-8000-000000000002',
        candidateProfileId: profileId,
        name: 'Angular',
        category: 'FRAMEWORK',
      },
      {
        id: '24000000-0000-4000-8000-000000000003',
        candidateProfileId: profileId,
        name: 'PostgreSQL',
        category: 'DATABASE',
      },
      {
        id: '24000000-0000-4000-8000-000000000004',
        candidateProfileId: profileId,
        name: 'TypeScript',
        category: 'PROGRAMMING_LANGUAGE',
        sortOrder: 1,
      },
    ]);
    await database.insert(schema.candidateLanguages).values([
      {
        id: '25000000-0000-4000-8000-000000000001',
        candidateProfileId: profileId,
        language: 'Spanish',
        level: 'Native',
      },
      {
        id: '25000000-0000-4000-8000-000000000002',
        candidateProfileId: profileId,
        language: 'English',
        level: 'Professional',
      },
      {
        id: '25000000-0000-4000-8000-000000000003',
        candidateProfileId: profileId,
        language: 'Arabic',
        level: 'Beginner',
        sortOrder: 1,
      },
    ]);

    const aggregate = await repository.loadAggregate();

    expect(aggregate?.experiences.map(({ id }) => id)).toEqual([
      '21000000-0000-4000-8000-000000000003',
      '21000000-0000-4000-8000-000000000004',
      '21000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000001',
    ]);
    expect(aggregate?.education.map(({ id }) => id)).toEqual([
      '22000000-0000-4000-8000-000000000003',
      '22000000-0000-4000-8000-000000000004',
      '22000000-0000-4000-8000-000000000002',
      '22000000-0000-4000-8000-000000000001',
    ]);
    expect(aggregate?.projects.map(({ id }) => id)).toEqual([
      '23000000-0000-4000-8000-000000000002',
      '23000000-0000-4000-8000-000000000003',
      '23000000-0000-4000-8000-000000000001',
      '23000000-0000-4000-8000-000000000004',
    ]);
    expect(aggregate?.skills.map(({ id }) => id)).toEqual([
      '24000000-0000-4000-8000-000000000002',
      '24000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000003',
      '24000000-0000-4000-8000-000000000004',
    ]);
    expect(aggregate?.languages.map(({ id }) => id)).toEqual([
      '25000000-0000-4000-8000-000000000002',
      '25000000-0000-4000-8000-000000000001',
      '25000000-0000-4000-8000-000000000003',
    ]);
  });

  it('rejects multiple CandidateProfile rows as an invariant violation', async () => {
    await database.insert(schema.candidateProfiles).values([
      { id: profileId, fullName: 'First Candidate' },
      {
        id: '10000000-0000-4000-8000-000000000001',
        fullName: 'Second Candidate',
      },
    ]);

    await expect(repository.loadAggregate()).rejects.toBeInstanceOf(
      CandidateInvariantViolationError,
    );
  });
});
