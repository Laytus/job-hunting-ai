import {
  CandidateNaturalKeyConflictError,
  DuplicateCandidateChildIdentifierError,
  InvalidCandidateDataError,
  type CandidateDataIssue,
} from './candidate.errors.js';
import type {
  CandidateAggregate,
  CandidateChildCollection,
  CandidateReplacementCommand,
} from './candidate.types.js';

export interface CandidateRepository {
  loadAggregate(): Promise<CandidateAggregate | null>;
  replaceAggregate(command: CandidateReplacementCommand): Promise<{
    readonly created: boolean;
    readonly aggregate: CandidateAggregate;
  }>;
}

export interface CandidateWithContext extends CandidateAggregate {
  readonly candidateContextUpdatedAt: Date;
}

export interface CandidateReplacementResult {
  readonly created: boolean;
  readonly candidate: CandidateAggregate;
  readonly candidateContextUpdatedAt: Date;
}

function normalizeNaturalKey(value: string): string {
  return value.trim().toLowerCase();
}

function assertUniqueChildIdentifiers(
  collection: CandidateChildCollection,
  children: readonly { readonly id?: string }[],
): void {
  const identifiers = new Set<string>();

  for (const child of children) {
    if (child.id === undefined) {
      continue;
    }
    if (identifiers.has(child.id)) {
      throw new DuplicateCandidateChildIdentifierError(collection, child.id);
    }
    identifiers.add(child.id);
  }
}

function validateDateRanges(command: CandidateReplacementCommand): readonly CandidateDataIssue[] {
  const issues: CandidateDataIssue[] = [];

  for (const [index, experience] of command.experiences.entries()) {
    if (typeof experience.startDate !== 'string' || experience.startDate.trim() === '') {
      issues.push({
        path: `experiences[${index}].startDate`,
        message: 'Start date is required.',
      });
      continue;
    }
    if (typeof experience.endDate === 'string' && experience.endDate < experience.startDate) {
      issues.push({
        path: `experiences[${index}].endDate`,
        message: 'End date must be on or after start date.',
      });
    }
  }

  for (const [index, education] of command.education.entries()) {
    if (typeof education.startDate !== 'string' || education.startDate.trim() === '') {
      issues.push({
        path: `education[${index}].startDate`,
        message: 'Start date is required.',
      });
      continue;
    }
    if (typeof education.endDate === 'string' && education.endDate < education.startDate) {
      issues.push({
        path: `education[${index}].endDate`,
        message: 'End date must be on or after start date.',
      });
    }
  }

  for (const [index, project] of command.projects.entries()) {
    if (
      typeof project.startDate === 'string' &&
      typeof project.endDate === 'string' &&
      project.endDate < project.startDate
    ) {
      issues.push({
        path: `projects[${index}].endDate`,
        message: 'End date must be on or after start date.',
      });
    }
  }

  return issues;
}

function assertUniqueNaturalKeys(command: CandidateReplacementCommand): void {
  const skillNames = new Set<string>();
  for (const skill of command.skills) {
    const normalizedName = normalizeNaturalKey(skill.name);
    if (skillNames.has(normalizedName)) {
      throw new CandidateNaturalKeyConflictError('skills');
    }
    skillNames.add(normalizedName);
  }

  const languageNames = new Set<string>();
  for (const language of command.languages) {
    const normalizedName = normalizeNaturalKey(language.language);
    if (languageNames.has(normalizedName)) {
      throw new CandidateNaturalKeyConflictError('languages');
    }
    languageNames.add(normalizedName);
  }
}

function validateReplacement(command: CandidateReplacementCommand): void {
  assertUniqueChildIdentifiers('experiences', command.experiences);
  assertUniqueChildIdentifiers('education', command.education);
  assertUniqueChildIdentifiers('projects', command.projects);
  assertUniqueChildIdentifiers('skills', command.skills);
  assertUniqueChildIdentifiers('languages', command.languages);

  const issues = validateDateRanges(command);
  if (issues.length > 0) {
    throw new InvalidCandidateDataError('Candidate data is invalid.', issues);
  }

  assertUniqueNaturalKeys(command);
}

export function deriveCandidateContextUpdatedAt(aggregate: CandidateAggregate): Date {
  let latestTimestamp = aggregate.updatedAt.getTime();

  for (const collection of [
    aggregate.experiences,
    aggregate.education,
    aggregate.projects,
    aggregate.skills,
    aggregate.languages,
  ]) {
    for (const child of collection) {
      latestTimestamp = Math.max(latestTimestamp, child.updatedAt.getTime());
    }
  }

  return new Date(latestTimestamp);
}

export class CandidateProfileService {
  constructor(private readonly repository: CandidateRepository) {}

  async getCandidate(): Promise<CandidateWithContext | null> {
    const candidate = await this.repository.loadAggregate();
    if (candidate === null) {
      return null;
    }

    return {
      ...candidate,
      candidateContextUpdatedAt: deriveCandidateContextUpdatedAt(candidate),
    };
  }

  async replaceCandidate(
    command: CandidateReplacementCommand,
  ): Promise<CandidateReplacementResult> {
    validateReplacement(command);

    const result = await this.repository.replaceAggregate(command);
    return {
      created: result.created,
      candidate: result.aggregate,
      candidateContextUpdatedAt: deriveCandidateContextUpdatedAt(result.aggregate),
    };
  }
}
