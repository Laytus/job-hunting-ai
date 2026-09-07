import { eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import {
  CandidateChildOwnershipConflictError,
  CandidateInvariantViolationError,
  CandidateNaturalKeyConflictError,
  DuplicateCandidateChildIdentifierError,
} from '../../src/candidate/candidate.errors.js';
import { CandidateProfileRepository } from '../../src/candidate/candidate.repository.js';
import type {
  CandidateAggregate,
  CandidateEducationReplacement,
  CandidateExperienceReplacement,
  CandidateLanguageReplacement,
  CandidateProjectReplacement,
  CandidateReplacementCommand,
  CandidateSkillReplacement,
} from '../../src/candidate/candidate.types.js';
import { candidateAggregateAdvisoryLockQuery } from '../../src/db/candidate-lock.js';
import * as schema from '../../src/db/schema.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const oldTimestamp = new Date('2020-01-01T00:00:00.000Z');

let client: Sql;
let database: TestDatabase;
let repository: CandidateProfileRepository;

function experience(
  overrides: Partial<CandidateExperienceReplacement> = {},
): CandidateExperienceReplacement {
  return {
    organization: 'Analytical Engines Ltd',
    role: 'Engineer',
    location: 'London',
    startDate: '2020-01-01',
    endDate: '2022-01-01',
    descriptionMarkdown: 'Built analytical engines.',
    sortOrder: 0,
    ...overrides,
  };
}

function education(
  overrides: Partial<CandidateEducationReplacement> = {},
): CandidateEducationReplacement {
  return {
    institution: 'University of London',
    degree: 'Mathematics',
    fieldOfStudy: 'Applied Mathematics',
    location: 'London',
    startDate: '2016-01-01',
    endDate: '2020-01-01',
    descriptionMarkdown: 'Studied mathematics.',
    sortOrder: 0,
    ...overrides,
  };
}

function project(
  overrides: Partial<CandidateProjectReplacement> = {},
): CandidateProjectReplacement {
  return {
    name: 'Analytical Engine Notes',
    role: 'Author',
    descriptionMarkdown: 'Documented a computing machine.',
    projectUrl: 'https://example.com/project',
    repositoryUrl: 'https://github.com/example/project',
    startDate: '2021-01-01',
    endDate: '2022-01-01',
    technologies: ['TypeScript', 'PostgreSQL'],
    sortOrder: 0,
    ...overrides,
  };
}

function skill(overrides: Partial<CandidateSkillReplacement> = {}): CandidateSkillReplacement {
  return {
    name: 'TypeScript',
    category: 'PROGRAMMING_LANGUAGE',
    level: 'ADVANCED',
    notes: 'Daily use',
    sortOrder: 0,
    ...overrides,
  };
}

function language(
  overrides: Partial<CandidateLanguageReplacement> = {},
): CandidateLanguageReplacement {
  return {
    language: 'English',
    level: 'Professional',
    certification: null,
    notes: null,
    sortOrder: 0,
    ...overrides,
  };
}

function command(
  overrides: Partial<CandidateReplacementCommand> = {},
): CandidateReplacementCommand {
  return {
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
    experiences: [],
    education: [],
    projects: [],
    skills: [],
    languages: [],
    ...overrides,
  };
}

function replacementFromAggregate(aggregate: CandidateAggregate): CandidateReplacementCommand {
  return command({
    fullName: aggregate.fullName,
    headline: aggregate.headline,
    summaryMarkdown: aggregate.summaryMarkdown,
    linkedinUrl: aggregate.linkedinUrl,
    githubUrl: aggregate.githubUrl,
    portfolioUrl: aggregate.portfolioUrl,
    location: aggregate.location,
    targetRoles: [...aggregate.targetRoles],
    targetLocations: [...aggregate.targetLocations],
    careerGoalsMarkdown: aggregate.careerGoalsMarkdown,
    cvMarkdown: aggregate.cvMarkdown,
    additionalContext: aggregate.additionalContext,
    experiences: aggregate.experiences.map((item) => ({
      id: item.id,
      organization: item.organization,
      role: item.role,
      location: item.location,
      startDate: item.startDate,
      endDate: item.endDate,
      descriptionMarkdown: item.descriptionMarkdown,
      sortOrder: item.sortOrder,
    })),
    education: aggregate.education.map((item) => ({
      id: item.id,
      institution: item.institution,
      degree: item.degree,
      fieldOfStudy: item.fieldOfStudy,
      location: item.location,
      startDate: item.startDate,
      endDate: item.endDate,
      descriptionMarkdown: item.descriptionMarkdown,
      sortOrder: item.sortOrder,
    })),
    projects: aggregate.projects.map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      descriptionMarkdown: item.descriptionMarkdown,
      projectUrl: item.projectUrl,
      repositoryUrl: item.repositoryUrl,
      startDate: item.startDate,
      endDate: item.endDate,
      technologies: [...item.technologies],
      sortOrder: item.sortOrder,
    })),
    skills: aggregate.skills.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      level: item.level,
      notes: item.notes,
      sortOrder: item.sortOrder,
    })),
    languages: aggregate.languages.map((item) => ({
      id: item.id,
      language: item.language,
      level: item.level,
      certification: item.certification,
      notes: item.notes,
      sortOrder: item.sortOrder,
    })),
  });
}

async function resetCandidateState(): Promise<void> {
  await client.unsafe('truncate table candidate_profiles cascade');
}

async function requireAggregate(): Promise<CandidateAggregate> {
  const aggregate = await repository.loadAggregate();
  if (aggregate === null) {
    throw new Error('Expected a Candidate aggregate in the test database.');
  }
  return aggregate;
}

async function setRootUpdatedAt(identifier: string, updatedAt = oldTimestamp): Promise<void> {
  await database
    .update(schema.candidateProfiles)
    .set({ updatedAt })
    .where(eq(schema.candidateProfiles.id, identifier));
}

async function waitForAdvisoryWaiters(observer: Sql, expected: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await observer<{ waiting: number }[]>`
      select count(*)::integer as waiting
      from pg_locks
      where locktype = 'advisory'
        and granted = false
    `;
    if ((rows[0]?.waiting ?? 0) >= expected) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Expected ${expected} Candidate advisory lock waiters.`);
}

describe('CandidateProfileRepository aggregate replacement', () => {
  beforeAll(async () => {
    const target = getTestDatabaseTarget();
    client = postgres(target.url, { max: 10, onnotice: () => undefined });
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

  it('creates the first complete aggregate with database UUIDs and deterministic ordering', async () => {
    const result = await repository.replaceAggregate(
      command({
        experiences: [
          experience({
            organization: 'Later sort order',
            startDate: '2024-01-01',
            endDate: null,
            sortOrder: 1,
          }),
          experience({ organization: 'Older', startDate: '2020-01-01' }),
          experience({ organization: 'Newer', startDate: '2023-01-01', endDate: null }),
        ],
        education: [
          education({
            institution: 'Later sort order',
            startDate: '2023-01-01',
            endDate: null,
            sortOrder: 1,
          }),
          education({ institution: 'Older', startDate: '2016-01-01' }),
          education({ institution: 'Newer', startDate: '2020-01-01', endDate: null }),
        ],
        projects: [
          project({ name: 'No date', startDate: null, endDate: null }),
          project({ name: 'Older project', startDate: '2020-01-01' }),
          project({ name: 'Newer project', startDate: '2023-01-01', endDate: null }),
        ],
        skills: [
          skill({ name: 'React', category: 'FRAMEWORK' }),
          skill({ name: 'PostgreSQL', category: 'DATABASE' }),
          skill({ name: 'TypeScript', category: 'PROGRAMMING_LANGUAGE', sortOrder: 1 }),
        ],
        languages: [
          language({ language: 'Spanish' }),
          language({ language: 'English' }),
          language({ language: 'Arabic', sortOrder: 1 }),
        ],
      }),
    );

    expect(result.created).toBe(true);
    expect(result.aggregate.id).toMatch(uuidPattern);
    for (const children of [
      result.aggregate.experiences,
      result.aggregate.education,
      result.aggregate.projects,
      result.aggregate.skills,
      result.aggregate.languages,
    ]) {
      expect(children).toHaveLength(3);
      expect(children.every(({ id }) => uuidPattern.test(id))).toBe(true);
    }
    expect(result.aggregate.experiences.map(({ organization }) => organization)).toEqual([
      'Newer',
      'Older',
      'Later sort order',
    ]);
    expect(result.aggregate.education.map(({ institution }) => institution)).toEqual([
      'Newer',
      'Older',
      'Later sort order',
    ]);
    expect(result.aggregate.projects.map(({ name }) => name)).toEqual([
      'Newer project',
      'Older project',
      'No date',
    ]);
    expect(result.aggregate.skills.map(({ name }) => name)).toEqual([
      'React',
      'PostgreSQL',
      'TypeScript',
    ]);
    expect(result.aggregate.languages.map(({ language: name }) => name)).toEqual([
      'English',
      'Spanish',
      'Arabic',
    ]);
  });

  it('replaces root values while preserving root identity and creation time', async () => {
    const created = await repository.replaceAggregate(command());
    await setRootUpdatedAt(created.aggregate.id);
    const before = await requireAggregate();

    const result = await repository.replaceAggregate({
      ...replacementFromAggregate(before),
      fullName: 'Ada Byron',
      targetRoles: ['Principal Engineer', 'Engineering Manager'],
    });

    expect(result.created).toBe(false);
    expect(result.aggregate.id).toBe(before.id);
    expect(result.aggregate.createdAt).toEqual(before.createdAt);
    expect(result.aggregate.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(result.aggregate.fullName).toBe('Ada Byron');
    expect(result.aggregate.targetRoles).toEqual(['Principal Engineer', 'Engineering Manager']);
  });

  it('does not advance root or child timestamps for an identical replacement', async () => {
    const created = await repository.replaceAggregate(
      command({
        experiences: [experience()],
        education: [education()],
        projects: [project()],
        skills: [skill()],
        languages: [language()],
      }),
    );
    await setRootUpdatedAt(created.aggregate.id);
    await database.update(schema.candidateExperiences).set({ updatedAt: oldTimestamp });
    await database.update(schema.candidateEducation).set({ updatedAt: oldTimestamp });
    await database.update(schema.candidateProjects).set({ updatedAt: oldTimestamp });
    await database.update(schema.candidateSkills).set({ updatedAt: oldTimestamp });
    await database.update(schema.candidateLanguages).set({ updatedAt: oldTimestamp });
    const before = await requireAggregate();

    const result = await repository.replaceAggregate(replacementFromAggregate(before));

    expect(result.created).toBe(false);
    expect(result.aggregate.updatedAt).toEqual(before.updatedAt);
    expect(result.aggregate.experiences[0]?.updatedAt).toEqual(before.experiences[0]?.updatedAt);
    expect(result.aggregate.education[0]?.updatedAt).toEqual(before.education[0]?.updatedAt);
    expect(result.aggregate.projects[0]?.updatedAt).toEqual(before.projects[0]?.updatedAt);
    expect(result.aggregate.skills[0]?.updatedAt).toEqual(before.skills[0]?.updatedAt);
    expect(result.aggregate.languages[0]?.updatedAt).toEqual(before.languages[0]?.updatedAt);
  });

  it('advances root freshness when only a child is inserted', async () => {
    const created = await repository.replaceAggregate(command());
    await setRootUpdatedAt(created.aggregate.id);
    const before = await requireAggregate();

    const result = await repository.replaceAggregate({
      ...replacementFromAggregate(before),
      projects: [project()],
    });

    expect(result.aggregate.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(result.aggregate.projects[0]?.id).toMatch(uuidPattern);
  });

  it('updates a retained child in place and advances both child and root freshness', async () => {
    const created = await repository.replaceAggregate(command({ experiences: [experience()] }));
    const originalExperience = created.aggregate.experiences[0]!;
    await setRootUpdatedAt(created.aggregate.id);
    await database
      .update(schema.candidateExperiences)
      .set({ updatedAt: oldTimestamp })
      .where(eq(schema.candidateExperiences.id, originalExperience.id));
    const before = await requireAggregate();
    const currentExperience = before.experiences[0]!;

    const result = await repository.replaceAggregate({
      ...replacementFromAggregate(before),
      experiences: [
        experience({
          id: currentExperience.id,
          organization: 'Updated Organization',
        }),
      ],
    });
    const updatedExperience = result.aggregate.experiences[0]!;

    expect(result.aggregate.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(updatedExperience.id).toBe(currentExperience.id);
    expect(updatedExperience.createdAt).toEqual(currentExperience.createdAt);
    expect(updatedExperience.updatedAt.getTime()).toBeGreaterThan(
      currentExperience.updatedAt.getTime(),
    );
    expect(updatedExperience.organization).toBe('Updated Organization');
  });

  it('deletes omitted children and treats an empty collection as delete-all', async () => {
    const created = await repository.replaceAggregate(
      command({
        experiences: [
          experience({ organization: 'Keep' }),
          experience({ organization: 'Remove', sortOrder: 1 }),
        ],
        skills: [skill({ name: 'TypeScript' }), skill({ name: 'PostgreSQL' })],
      }),
    );
    await setRootUpdatedAt(created.aggregate.id);
    const before = await requireAggregate();
    const kept = before.experiences.find(({ organization }) => organization === 'Keep')!;

    const result = await repository.replaceAggregate({
      ...replacementFromAggregate(before),
      experiences: [experience({ id: kept.id, organization: kept.organization })],
      skills: [],
    });

    expect(result.aggregate.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(result.aggregate.experiences.map(({ id }) => id)).toEqual([kept.id]);
    expect(result.aggregate.skills).toEqual([]);
  });

  it('reconciles meaningful updates across all five child collections', async () => {
    const created = await repository.replaceAggregate(
      command({
        experiences: [experience()],
        education: [education()],
        projects: [project()],
        skills: [skill()],
        languages: [language()],
      }),
    );
    const before = created.aggregate;

    const result = await repository.replaceAggregate({
      ...replacementFromAggregate(before),
      experiences: [experience({ id: before.experiences[0]!.id, role: 'Principal Engineer' })],
      education: [education({ id: before.education[0]!.id, degree: 'Computer Science' })],
      projects: [
        project({ id: before.projects[0]!.id, technologies: ['PostgreSQL', 'Drizzle'] }),
      ],
      skills: [skill({ id: before.skills[0]!.id, level: 'EXPERT' })],
      languages: [language({ id: before.languages[0]!.id, level: 'Native' })],
    });

    expect(result.aggregate.experiences[0]?.role).toBe('Principal Engineer');
    expect(result.aggregate.education[0]?.degree).toBe('Computer Science');
    expect(result.aggregate.projects[0]?.technologies).toEqual(['PostgreSQL', 'Drizzle']);
    expect(result.aggregate.skills[0]?.level).toBe('EXPERT');
    expect(result.aggregate.languages[0]?.level).toBe('Native');
  });

  it('rejects unknown and wrong-type child identifiers without changing the aggregate', async () => {
    const created = await repository.replaceAggregate(command({ skills: [skill()] }));
    const before = created.aggregate;
    const unknownIdentifier = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    await expect(
      repository.replaceAggregate({
        ...replacementFromAggregate(before),
        experiences: [experience({ id: unknownIdentifier })],
      }),
    ).rejects.toMatchObject({
      constructor: CandidateChildOwnershipConflictError,
      collection: 'experiences',
      identifier: unknownIdentifier,
    });
    await expect(
      repository.replaceAggregate({
        ...replacementFromAggregate(before),
        languages: [language({ id: before.skills[0]!.id })],
      }),
    ).rejects.toMatchObject({
      constructor: CandidateChildOwnershipConflictError,
      collection: 'languages',
      identifier: before.skills[0]!.id,
    });
    await expect(repository.loadAggregate()).resolves.toEqual(before);
  });

  it('rejects supplied child identifiers on first creation and duplicate submitted identifiers', async () => {
    const suppliedIdentifier = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await expect(
      repository.replaceAggregate(command({ projects: [project({ id: suppliedIdentifier })] })),
    ).rejects.toBeInstanceOf(CandidateChildOwnershipConflictError);
    await expect(repository.loadAggregate()).resolves.toBeNull();

    await expect(
      repository.replaceAggregate(
        command({
          experiences: [
            experience({ id: suppliedIdentifier }),
            experience({ id: suppliedIdentifier, organization: 'Duplicate' }),
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(DuplicateCandidateChildIdentifierError);
    await expect(repository.loadAggregate()).resolves.toBeNull();
  });

  it('rejects corrupt multiple-profile ownership state as a singleton invariant violation', async () => {
    const firstProfileId = '10000000-0000-4000-8000-000000000001';
    const secondProfileId = '10000000-0000-4000-8000-000000000002';
    const secondExperienceId = '11000000-0000-4000-8000-000000000002';
    await database.insert(schema.candidateProfiles).values([
      { id: firstProfileId, fullName: 'First Candidate' },
      { id: secondProfileId, fullName: 'Second Candidate' },
    ]);
    await database.insert(schema.candidateExperiences).values({
      id: secondExperienceId,
      candidateProfileId: secondProfileId,
      organization: 'Other Owner',
      role: 'Engineer',
      startDate: '2020-01-01',
    });

    await expect(
      repository.replaceAggregate(
        command({ experiences: [experience({ id: secondExperienceId })] }),
      ),
    ).rejects.toBeInstanceOf(CandidateInvariantViolationError);

    const rows = await database.select().from(schema.candidateProfiles);
    expect(rows).toHaveLength(2);
  });

  it('preserves retained skill identities while swapping normalized natural keys', async () => {
    const created = await repository.replaceAggregate(
      command({
        skills: [skill({ name: 'Python' }), skill({ name: 'Rust', category: 'PROGRAMMING_LANGUAGE' })],
      }),
    );
    const python = created.aggregate.skills.find(({ name }) => name === 'Python')!;
    const rust = created.aggregate.skills.find(({ name }) => name === 'Rust')!;

    const result = await repository.replaceAggregate({
      ...replacementFromAggregate(created.aggregate),
      skills: [
        skill({ id: python.id, name: 'Rust' }),
        skill({ id: rust.id, name: 'Python' }),
      ],
    });

    expect(result.aggregate.skills.find(({ id }) => id === python.id)).toMatchObject({
      name: 'Rust',
      createdAt: python.createdAt,
    });
    expect(result.aggregate.skills.find(({ id }) => id === rust.id)).toMatchObject({
      name: 'Python',
      createdAt: rust.createdAt,
    });
  });

  it('preserves retained language identities while swapping normalized natural keys', async () => {
    const created = await repository.replaceAggregate(
      command({
        languages: [language({ language: 'English' }), language({ language: 'Spanish' })],
      }),
    );
    const english = created.aggregate.languages.find(({ language: name }) => name === 'English')!;
    const spanish = created.aggregate.languages.find(({ language: name }) => name === 'Spanish')!;

    const result = await repository.replaceAggregate({
      ...replacementFromAggregate(created.aggregate),
      languages: [
        language({ id: english.id, language: 'Spanish' }),
        language({ id: spanish.id, language: 'English' }),
      ],
    });

    expect(result.aggregate.languages.find(({ id }) => id === english.id)).toMatchObject({
      language: 'Spanish',
      createdAt: english.createdAt,
    });
    expect(result.aggregate.languages.find(({ id }) => id === spanish.id)).toMatchObject({
      language: 'English',
      createdAt: spanish.createdAt,
    });
  });

  it('maps invalid final skill and language natural keys to typed Candidate conflicts', async () => {
    const skillsCreated = await repository.replaceAggregate(
      command({ skills: [skill({ name: 'Python' }), skill({ name: 'Rust' })] }),
    );
    const skillCommand = replacementFromAggregate(skillsCreated.aggregate);
    await expect(
      repository.replaceAggregate({
        ...skillCommand,
        skills: skillCommand.skills.map((item) => ({ ...item, name: 'Python' })),
      }),
    ).rejects.toMatchObject({
      constructor: CandidateNaturalKeyConflictError,
      collection: 'skills',
    });

    await resetCandidateState();
    const languagesCreated = await repository.replaceAggregate(
      command({
        languages: [language({ language: 'English' }), language({ language: 'Spanish' })],
      }),
    );
    const languageCommand = replacementFromAggregate(languagesCreated.aggregate);
    await expect(
      repository.replaceAggregate({
        ...languageCommand,
        languages: languageCommand.languages.map((item) => ({ ...item, language: 'English' })),
      }),
    ).rejects.toMatchObject({
      constructor: CandidateNaturalKeyConflictError,
      collection: 'languages',
    });
  });

  it('rolls back earlier root and child writes when a late reconciliation step fails', async () => {
    const created = await repository.replaceAggregate(
      command({
        experiences: [experience()],
        languages: [language({ language: 'English' }), language({ language: 'Spanish' })],
      }),
    );
    const before = created.aggregate;
    const replacement = replacementFromAggregate(before);

    await expect(
      repository.replaceAggregate({
        ...replacement,
        fullName: 'Must Roll Back',
        experiences: replacement.experiences.map((item) => ({
          ...item,
          organization: 'Must Roll Back',
        })),
        languages: replacement.languages.map((item) => ({ ...item, language: 'English' })),
      }),
    ).rejects.toBeInstanceOf(CandidateNaturalKeyConflictError);

    await expect(repository.loadAggregate()).resolves.toEqual(before);
  });

  it('serializes concurrent first replacements through the real PostgreSQL advisory lock', async () => {
    const target = getTestDatabaseTarget();
    const blockerClient = postgres(target.url, { max: 1, onnotice: () => undefined });
    const firstClient = postgres(target.url, { max: 1, onnotice: () => undefined });
    const secondClient = postgres(target.url, { max: 1, onnotice: () => undefined });
    const blockerDatabase = drizzle(blockerClient, { schema });
    const firstRepository = new CandidateProfileRepository(drizzle(firstClient, { schema }));
    const secondRepository = new CandidateProfileRepository(drizzle(secondClient, { schema }));
    let releaseBlocker!: () => void;
    let reportLockAcquired!: () => void;
    const blockerRelease = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const lockAcquired = new Promise<void>((resolve) => {
      reportLockAcquired = resolve;
    });
    const blocker = blockerDatabase.transaction(async (transaction) => {
      await transaction.execute(candidateAggregateAdvisoryLockQuery());
      reportLockAcquired();
      await blockerRelease;
    });

    try {
      await lockAcquired;
      const first = firstRepository.replaceAggregate(command({ fullName: 'First writer' }));
      const second = secondRepository.replaceAggregate(command({ fullName: 'Second writer' }));
      await waitForAdvisoryWaiters(client, 2);
      releaseBlocker();

      const results = await Promise.all([first, second]);
      await blocker;

      expect(results.map(({ created }) => created).sort()).toEqual([false, true]);
      const profiles = await database.select().from(schema.candidateProfiles);
      expect(profiles).toHaveLength(1);
      expect((await requireAggregate()).fullName).toMatch(/^(First|Second) writer$/);
    } finally {
      releaseBlocker();
      await Promise.allSettled([blocker]);
      await Promise.all([blockerClient.end(), firstClient.end(), secondClient.end()]);
    }
  });
});
