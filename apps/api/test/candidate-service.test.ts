import { describe, expect, it } from 'vitest';
import {
  CandidateChildOwnershipConflictError,
  CandidateInvariantViolationError,
  CandidateNaturalKeyConflictError,
  DuplicateCandidateChildIdentifierError,
  InvalidCandidateDataError,
} from '../src/candidate/candidate.errors.js';
import {
  CandidateProfileService,
  type CandidateRepository,
} from '../src/candidate/candidate.service.js';
import type {
  CandidateAggregate,
  CandidateChildCollection,
  CandidateEducationReplacement,
  CandidateExperienceReplacement,
  CandidateLanguageReplacement,
  CandidateProjectReplacement,
  CandidateReplacementCommand,
  CandidateSkillReplacement,
} from '../src/candidate/candidate.types.js';

const profileId = '10000000-0000-4000-8000-000000000000';
const childId = '20000000-0000-4000-8000-000000000000';
const createdAt = new Date('2026-01-01T00:00:00.000Z');

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
    notes: null,
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
    additionalContext: null,
    experiences: [],
    education: [],
    projects: [],
    skills: [],
    languages: [],
    ...overrides,
  };
}

function aggregate(overrides: Partial<CandidateAggregate> = {}): CandidateAggregate {
  return {
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
    additionalContext: null,
    createdAt,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    experiences: [],
    education: [],
    projects: [],
    skills: [],
    languages: [],
    ...overrides,
  };
}

function commandWithDuplicateIds(collection: CandidateChildCollection): CandidateReplacementCommand {
  switch (collection) {
    case 'experiences':
      return command({
        experiences: [experience({ id: childId }), experience({ id: childId })],
      });
    case 'education':
      return command({
        education: [education({ id: childId }), education({ id: childId })],
      });
    case 'projects':
      return command({
        projects: [project({ id: childId }), project({ id: childId })],
      });
    case 'skills':
      return command({
        skills: [skill({ id: childId }), skill({ id: childId, name: 'PostgreSQL' })],
      });
    case 'languages':
      return command({
        languages: [
          language({ id: childId }),
          language({ id: childId, language: 'Spanish' }),
        ],
      });
  }
}

class FakeCandidateRepository implements CandidateRepository {
  aggregateToLoad: CandidateAggregate | null = null;
  replacementResult: { created: boolean; aggregate: CandidateAggregate } | null = null;
  replacementError: unknown;
  readonly replacementCommands: CandidateReplacementCommand[] = [];

  async loadAggregate(): Promise<CandidateAggregate | null> {
    return this.aggregateToLoad;
  }

  async replaceAggregate(commandToReplace: CandidateReplacementCommand): Promise<{
    readonly created: boolean;
    readonly aggregate: CandidateAggregate;
  }> {
    this.replacementCommands.push(commandToReplace);
    if (this.replacementError !== undefined) {
      throw this.replacementError;
    }
    if (this.replacementResult === null) {
      throw new Error('Fake Candidate repository replacement result was not configured.');
    }
    return this.replacementResult;
  }
}

describe('CandidateProfileService', () => {
  it('returns null when no Candidate aggregate exists', async () => {
    const repository = new FakeCandidateRepository();
    const service = new CandidateProfileService(repository);

    await expect(service.getCandidate()).resolves.toBeNull();
  });

  it('returns the complete populated Candidate aggregate with derived context freshness', async () => {
    const repository = new FakeCandidateRepository();
    const stored = aggregate();
    repository.aggregateToLoad = stored;
    const service = new CandidateProfileService(repository);

    await expect(service.getCandidate()).resolves.toEqual({
      ...stored,
      candidateContextUpdatedAt: stored.updatedAt,
    });
  });

  it('derives candidateContextUpdatedAt from the newest child across every collection', async () => {
    const repository = new FakeCandidateRepository();
    const timestamps = {
      experience: new Date('2026-02-01T00:00:00.000Z'),
      education: new Date('2026-03-01T00:00:00.000Z'),
      project: new Date('2026-04-01T00:00:00.000Z'),
      language: new Date('2026-05-01T00:00:00.000Z'),
      skill: new Date('2026-06-01T00:00:00.000Z'),
    };
    repository.aggregateToLoad = aggregate({
      experiences: [
        {
          ...experience({ id: childId }),
          id: childId,
          createdAt,
          updatedAt: timestamps.experience,
        },
      ],
      education: [
        {
          ...education({ id: childId }),
          id: childId,
          createdAt,
          updatedAt: timestamps.education,
        },
      ],
      projects: [
        {
          ...project({ id: childId }),
          id: childId,
          createdAt,
          updatedAt: timestamps.project,
        },
      ],
      skills: [
        {
          ...skill({ id: childId }),
          id: childId,
          createdAt,
          updatedAt: timestamps.skill,
        },
      ],
      languages: [
        {
          ...language({ id: childId }),
          id: childId,
          createdAt,
          updatedAt: timestamps.language,
        },
      ],
    });
    const service = new CandidateProfileService(repository);

    const result = await service.getCandidate();

    expect(result?.candidateContextUpdatedAt).toEqual(timestamps.skill);
  });

  it.each<CandidateChildCollection>([
    'experiences',
    'education',
    'projects',
    'skills',
    'languages',
  ])('rejects duplicate submitted identifiers in %s before persistence', async (collection) => {
    const repository = new FakeCandidateRepository();
    const service = new CandidateProfileService(repository);

    await expect(service.replaceCandidate(commandWithDuplicateIds(collection))).rejects.toMatchObject(
      {
        constructor: DuplicateCandidateChildIdentifierError,
        collection,
        identifier: childId,
      },
    );
    expect(repository.replacementCommands).toEqual([]);
  });

  it('rejects missing and inverted Experience dates before persistence', async () => {
    const repository = new FakeCandidateRepository();
    const service = new CandidateProfileService(repository);

    await expect(
      service.replaceCandidate(
        command({
          experiences: [
            experience({ startDate: '' }),
            experience({ startDate: '2024-01-01', endDate: '2023-01-01' }),
          ],
        }),
      ),
    ).rejects.toMatchObject({
      constructor: InvalidCandidateDataError,
      issues: [
        { path: 'experiences[0].startDate' },
        { path: 'experiences[1].endDate' },
      ],
    });
    expect(repository.replacementCommands).toEqual([]);
  });

  it('rejects missing and inverted Education dates before persistence', async () => {
    const repository = new FakeCandidateRepository();
    const service = new CandidateProfileService(repository);

    await expect(
      service.replaceCandidate(
        command({
          education: [
            education({ startDate: '   ' }),
            education({ startDate: '2024-01-01', endDate: '2023-01-01' }),
          ],
        }),
      ),
    ).rejects.toMatchObject({
      constructor: InvalidCandidateDataError,
      issues: [
        { path: 'education[0].startDate' },
        { path: 'education[1].endDate' },
      ],
    });
    expect(repository.replacementCommands).toEqual([]);
  });

  it('rejects an inverted Project date range before persistence', async () => {
    const repository = new FakeCandidateRepository();
    const service = new CandidateProfileService(repository);

    await expect(
      service.replaceCandidate(
        command({ projects: [project({ startDate: '2024-01-01', endDate: '2023-01-01' })] }),
      ),
    ).rejects.toMatchObject({
      constructor: InvalidCandidateDataError,
      issues: [{ path: 'projects[0].endDate' }],
    });
    expect(repository.replacementCommands).toEqual([]);
  });

  it('rejects duplicate normalized skill names before persistence', async () => {
    const repository = new FakeCandidateRepository();
    const service = new CandidateProfileService(repository);

    await expect(
      service.replaceCandidate(
        command({ skills: [skill({ name: ' TypeScript ' }), skill({ name: 'typescript' })] }),
      ),
    ).rejects.toMatchObject({
      constructor: CandidateNaturalKeyConflictError,
      collection: 'skills',
    });
    expect(repository.replacementCommands).toEqual([]);
  });

  it('rejects duplicate normalized language names before persistence', async () => {
    const repository = new FakeCandidateRepository();
    const service = new CandidateProfileService(repository);

    await expect(
      service.replaceCandidate(
        command({
          languages: [
            language({ language: ' English ' }),
            language({ language: 'english' }),
          ],
        }),
      ),
    ).rejects.toMatchObject({
      constructor: CandidateNaturalKeyConflictError,
      collection: 'languages',
    });
    expect(repository.replacementCommands).toEqual([]);
  });

  it('returns created=true and freshness from a repository create result', async () => {
    const repository = new FakeCandidateRepository();
    const created = aggregate();
    repository.replacementResult = { created: true, aggregate: created };
    const service = new CandidateProfileService(repository);

    await expect(service.replaceCandidate(command())).resolves.toEqual({
      created: true,
      candidate: created,
      candidateContextUpdatedAt: created.updatedAt,
    });
  });

  it('returns created=false and freshness from a repository replacement result', async () => {
    const repository = new FakeCandidateRepository();
    const replaced = aggregate({ updatedAt: new Date('2026-07-01T00:00:00.000Z') });
    repository.replacementResult = { created: false, aggregate: replaced };
    const service = new CandidateProfileService(repository);

    await expect(service.replaceCandidate(command())).resolves.toEqual({
      created: false,
      candidate: replaced,
      candidateContextUpdatedAt: replaced.updatedAt,
    });
  });

  it('propagates repository ownership, natural-key, and invariant domain conflicts', async () => {
    const conflicts = [
      new CandidateChildOwnershipConflictError('experiences', childId),
      new CandidateNaturalKeyConflictError('skills'),
      new CandidateInvariantViolationError('SINGLE_CANDIDATE_PROFILE'),
    ];

    for (const conflict of conflicts) {
      const repository = new FakeCandidateRepository();
      repository.replacementError = conflict;
      const service = new CandidateProfileService(repository);

      await expect(service.replaceCandidate(command())).rejects.toBe(conflict);
    }
  });

  it('passes a successfully validated command unchanged to the repository', async () => {
    const repository = new FakeCandidateRepository();
    const persisted = aggregate();
    repository.replacementResult = { created: false, aggregate: persisted };
    const service = new CandidateProfileService(repository);
    const validCommand = command({
      experiences: [experience()],
      education: [education()],
      projects: [project()],
      skills: [skill()],
      languages: [language()],
    });

    await service.replaceCandidate(validCommand);

    expect(repository.replacementCommands).toHaveLength(1);
    expect(repository.replacementCommands[0]).toBe(validCommand);
  });
});
