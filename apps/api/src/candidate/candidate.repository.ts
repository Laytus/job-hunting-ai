import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { candidateAggregateAdvisoryLockQuery } from '../db/candidate-lock.js';
import type { Database } from '../db/client.js';
import {
  candidateEducation,
  candidateExperiences,
  candidateLanguages,
  candidateProfiles,
  candidateProjects,
  candidateSkills,
} from '../db/schema.js';
import {
  CandidateChildOwnershipConflictError,
  CandidateInvariantViolationError,
  CandidateNaturalKeyConflictError,
  DuplicateCandidateChildIdentifierError,
} from './candidate.errors.js';
import type {
  CandidateAggregate,
  CandidateChildCollection,
  CandidateEducation,
  CandidateEducationReplacement,
  CandidateExperience,
  CandidateExperienceReplacement,
  CandidateLanguage,
  CandidateLanguageReplacement,
  CandidateProfile,
  CandidateProject,
  CandidateProjectReplacement,
  CandidateReplacementCommand,
  CandidateSkill,
  CandidateSkillReplacement,
} from './candidate.types.js';

type CandidateProfileRow = typeof candidateProfiles.$inferSelect;
type CandidateExperienceRow = typeof candidateExperiences.$inferSelect;
type CandidateEducationRow = typeof candidateEducation.$inferSelect;
type CandidateProjectRow = typeof candidateProjects.$inferSelect;
type CandidateSkillRow = typeof candidateSkills.$inferSelect;
type CandidateLanguageRow = typeof candidateLanguages.$inferSelect;
type CandidateTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type CandidateExecutor = Database | CandidateTransaction;

export interface CandidateAggregateReplacementResult {
  readonly created: boolean;
  readonly aggregate: CandidateAggregate;
}

const transactionTimestamp = sql`transaction_timestamp()`;

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeNaturalKey(value: string): string {
  return value.trim().toLowerCase();
}

function assertUniqueSubmittedIdentifiers(
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

function findFirstSubmittedIdentifier(
  command: CandidateReplacementCommand,
): { collection: CandidateChildCollection; identifier: string } | null {
  for (const [collection, children] of [
    ['experiences', command.experiences],
    ['education', command.education],
    ['projects', command.projects],
    ['skills', command.skills],
    ['languages', command.languages],
  ] as const) {
    const child = children.find(({ id }) => id !== undefined);
    if (child?.id !== undefined) {
      return { collection, identifier: child.id };
    }
  }

  return null;
}

function rootValuesChanged(
  current: CandidateAggregate,
  replacement: CandidateReplacementCommand,
): boolean {
  return (
    current.fullName !== replacement.fullName ||
    current.headline !== replacement.headline ||
    current.summaryMarkdown !== replacement.summaryMarkdown ||
    current.linkedinUrl !== replacement.linkedinUrl ||
    current.githubUrl !== replacement.githubUrl ||
    current.portfolioUrl !== replacement.portfolioUrl ||
    current.location !== replacement.location ||
    !arraysEqual(current.targetRoles, replacement.targetRoles) ||
    !arraysEqual(current.targetLocations, replacement.targetLocations) ||
    current.careerGoalsMarkdown !== replacement.careerGoalsMarkdown ||
    current.cvMarkdown !== replacement.cvMarkdown ||
    current.additionalContext !== replacement.additionalContext
  );
}

function experienceValuesChanged(
  current: CandidateExperience,
  replacement: CandidateExperienceReplacement,
): boolean {
  return (
    current.organization !== replacement.organization ||
    current.role !== replacement.role ||
    current.location !== replacement.location ||
    current.startDate !== replacement.startDate ||
    current.endDate !== replacement.endDate ||
    current.descriptionMarkdown !== replacement.descriptionMarkdown ||
    current.sortOrder !== replacement.sortOrder
  );
}

function educationValuesChanged(
  current: CandidateEducation,
  replacement: CandidateEducationReplacement,
): boolean {
  return (
    current.institution !== replacement.institution ||
    current.degree !== replacement.degree ||
    current.fieldOfStudy !== replacement.fieldOfStudy ||
    current.location !== replacement.location ||
    current.startDate !== replacement.startDate ||
    current.endDate !== replacement.endDate ||
    current.descriptionMarkdown !== replacement.descriptionMarkdown ||
    current.sortOrder !== replacement.sortOrder
  );
}

function projectValuesChanged(
  current: CandidateProject,
  replacement: CandidateProjectReplacement,
): boolean {
  return (
    current.name !== replacement.name ||
    current.role !== replacement.role ||
    current.descriptionMarkdown !== replacement.descriptionMarkdown ||
    current.projectUrl !== replacement.projectUrl ||
    current.repositoryUrl !== replacement.repositoryUrl ||
    current.startDate !== replacement.startDate ||
    current.endDate !== replacement.endDate ||
    !arraysEqual(current.technologies, replacement.technologies) ||
    current.sortOrder !== replacement.sortOrder
  );
}

function skillValuesChanged(
  current: CandidateSkill,
  replacement: CandidateSkillReplacement,
): boolean {
  return (
    current.name !== replacement.name ||
    current.category !== replacement.category ||
    current.level !== replacement.level ||
    current.notes !== replacement.notes ||
    current.sortOrder !== replacement.sortOrder
  );
}

function languageValuesChanged(
  current: CandidateLanguage,
  replacement: CandidateLanguageReplacement,
): boolean {
  return (
    current.language !== replacement.language ||
    current.level !== replacement.level ||
    current.certification !== replacement.certification ||
    current.notes !== replacement.notes ||
    current.sortOrder !== replacement.sortOrder
  );
}

function temporaryNaturalKey(
  collection: 'skill' | 'language',
  identifier: string,
  reservedKeys: Set<string>,
): string {
  let attempt = 0;

  while (true) {
    const value = `__candidate_${collection}_swap_${identifier}_${attempt}__`;
    const normalized = normalizeNaturalKey(value);
    if (!reservedKeys.has(normalized)) {
      reservedKeys.add(normalized);
      return value;
    }
    attempt += 1;
  }
}

function databaseConstraint(error: unknown): { code?: string; constraint?: string } | null {
  let current: unknown = error;

  for (let depth = 0; depth < 6 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
      cause?: unknown;
    };
    const constraint =
      typeof candidate.constraint_name === 'string'
        ? candidate.constraint_name
        : typeof candidate.constraint === 'string'
          ? candidate.constraint
          : undefined;

    if (typeof candidate.code === 'string' || constraint !== undefined) {
      return {
        ...(typeof candidate.code === 'string' ? { code: candidate.code } : {}),
        ...(constraint === undefined ? {} : { constraint }),
      };
    }

    current = candidate.cause;
  }

  return null;
}

function rethrowKnownCandidateConflict(error: unknown): never {
  const databaseError = databaseConstraint(error);
  if (databaseError?.code === '23505') {
    if (databaseError.constraint === 'candidate_skills_profile_name_uq') {
      throw new CandidateNaturalKeyConflictError('skills');
    }
    if (databaseError.constraint === 'candidate_languages_profile_language_uq') {
      throw new CandidateNaturalKeyConflictError('languages');
    }
  }

  throw error;
}

function mapCandidateProfile(row: CandidateProfileRow): CandidateProfile {
  return {
    id: row.id,
    fullName: row.fullName,
    headline: row.headline,
    summaryMarkdown: row.summaryMarkdown,
    linkedinUrl: row.linkedinUrl,
    githubUrl: row.githubUrl,
    portfolioUrl: row.portfolioUrl,
    location: row.location,
    targetRoles: [...row.targetRoles],
    targetLocations: [...row.targetLocations],
    careerGoalsMarkdown: row.careerGoalsMarkdown,
    cvMarkdown: row.cvMarkdown,
    additionalContext: row.additionalContext,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCandidateExperience(row: CandidateExperienceRow): CandidateExperience {
  return {
    id: row.id,
    organization: row.organization,
    role: row.role,
    location: row.location,
    startDate: row.startDate,
    endDate: row.endDate,
    descriptionMarkdown: row.descriptionMarkdown,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCandidateEducation(row: CandidateEducationRow): CandidateEducation {
  return {
    id: row.id,
    institution: row.institution,
    degree: row.degree,
    fieldOfStudy: row.fieldOfStudy,
    location: row.location,
    startDate: row.startDate,
    endDate: row.endDate,
    descriptionMarkdown: row.descriptionMarkdown,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCandidateProject(row: CandidateProjectRow): CandidateProject {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    descriptionMarkdown: row.descriptionMarkdown,
    projectUrl: row.projectUrl,
    repositoryUrl: row.repositoryUrl,
    startDate: row.startDate,
    endDate: row.endDate,
    technologies: [...row.technologiesJson],
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCandidateSkill(row: CandidateSkillRow): CandidateSkill {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    level: row.level,
    notes: row.notes,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCandidateLanguage(row: CandidateLanguageRow): CandidateLanguage {
  return {
    id: row.id,
    language: row.language,
    level: row.level,
    certification: row.certification,
    notes: row.notes,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class CandidateProfileRepository {
  constructor(private readonly database: Database) {}

  async loadAggregate(): Promise<CandidateAggregate | null> {
    return this.loadAggregateFrom(this.database);
  }

  async replaceAggregate(
    command: CandidateReplacementCommand,
  ): Promise<CandidateAggregateReplacementResult> {
    this.assertSubmittedIdentifiers(command);

    try {
      return await this.database.transaction(async (transaction) => {
        await transaction.execute(candidateAggregateAdvisoryLockQuery());

        const current = await this.loadAggregateFrom(transaction);
        if (current === null) {
          const suppliedIdentifier = findFirstSubmittedIdentifier(command);
          if (suppliedIdentifier !== null) {
            throw new CandidateChildOwnershipConflictError(
              suppliedIdentifier.collection,
              suppliedIdentifier.identifier,
            );
          }

          const insertedProfiles = await transaction
            .insert(candidateProfiles)
            .values({
              fullName: command.fullName,
              headline: command.headline,
              summaryMarkdown: command.summaryMarkdown,
              linkedinUrl: command.linkedinUrl,
              githubUrl: command.githubUrl,
              portfolioUrl: command.portfolioUrl,
              location: command.location,
              targetRoles: [...command.targetRoles],
              targetLocations: [...command.targetLocations],
              careerGoalsMarkdown: command.careerGoalsMarkdown,
              cvMarkdown: command.cvMarkdown,
              additionalContext: command.additionalContext,
            })
            .returning({ id: candidateProfiles.id });
          const insertedProfile = insertedProfiles[0];
          if (!insertedProfile) {
            throw new CandidateInvariantViolationError('CANDIDATE_PROFILE_INSERT');
          }

          await this.reconcileExperiences(transaction, insertedProfile.id, [], command.experiences);
          await this.reconcileEducation(transaction, insertedProfile.id, [], command.education);
          await this.reconcileProjects(transaction, insertedProfile.id, [], command.projects);
          await this.reconcileSkills(transaction, insertedProfile.id, [], command.skills);
          await this.reconcileLanguages(transaction, insertedProfile.id, [], command.languages);

          return {
            created: true,
            aggregate: await this.requireAggregate(transaction),
          };
        }

        this.assertChildOwnership(current, command);

        const rootChanged = rootValuesChanged(current, command);
        if (rootChanged) {
          await transaction
            .update(candidateProfiles)
            .set({
              ...(current.fullName === command.fullName ? {} : { fullName: command.fullName }),
              ...(current.headline === command.headline ? {} : { headline: command.headline }),
              ...(current.summaryMarkdown === command.summaryMarkdown
                ? {}
                : { summaryMarkdown: command.summaryMarkdown }),
              ...(current.linkedinUrl === command.linkedinUrl
                ? {}
                : { linkedinUrl: command.linkedinUrl }),
              ...(current.githubUrl === command.githubUrl
                ? {}
                : { githubUrl: command.githubUrl }),
              ...(current.portfolioUrl === command.portfolioUrl
                ? {}
                : { portfolioUrl: command.portfolioUrl }),
              ...(current.location === command.location ? {} : { location: command.location }),
              ...(arraysEqual(current.targetRoles, command.targetRoles)
                ? {}
                : { targetRoles: [...command.targetRoles] }),
              ...(arraysEqual(current.targetLocations, command.targetLocations)
                ? {}
                : { targetLocations: [...command.targetLocations] }),
              ...(current.careerGoalsMarkdown === command.careerGoalsMarkdown
                ? {}
                : { careerGoalsMarkdown: command.careerGoalsMarkdown }),
              ...(current.cvMarkdown === command.cvMarkdown
                ? {}
                : { cvMarkdown: command.cvMarkdown }),
              ...(current.additionalContext === command.additionalContext
                ? {}
                : { additionalContext: command.additionalContext }),
              updatedAt: transactionTimestamp,
            })
            .where(eq(candidateProfiles.id, current.id));
        }

        const experiencesChanged = await this.reconcileExperiences(
          transaction,
          current.id,
          current.experiences,
          command.experiences,
        );
        const educationChanged = await this.reconcileEducation(
          transaction,
          current.id,
          current.education,
          command.education,
        );
        const projectsChanged = await this.reconcileProjects(
          transaction,
          current.id,
          current.projects,
          command.projects,
        );
        const skillsChanged = await this.reconcileSkills(
          transaction,
          current.id,
          current.skills,
          command.skills,
        );
        const languagesChanged = await this.reconcileLanguages(
          transaction,
          current.id,
          current.languages,
          command.languages,
        );
        const childrenChanged =
          experiencesChanged ||
          educationChanged ||
          projectsChanged ||
          skillsChanged ||
          languagesChanged;

        if (!rootChanged && childrenChanged) {
          await transaction
            .update(candidateProfiles)
            .set({
              updatedAt: transactionTimestamp,
            })
            .where(eq(candidateProfiles.id, current.id));
        }

        return {
          created: false,
          aggregate: await this.requireAggregate(transaction),
        };
      });
    } catch (error) {
      rethrowKnownCandidateConflict(error);
    }
  }

  private async loadAggregateFrom(
    database: CandidateExecutor,
  ): Promise<CandidateAggregate | null> {
    const profiles = await database
      .select()
      .from(candidateProfiles)
      .orderBy(asc(candidateProfiles.id))
      .limit(2);

    if (profiles.length === 0) {
      return null;
    }

    if (profiles.length > 1) {
      throw new CandidateInvariantViolationError('SINGLE_CANDIDATE_PROFILE');
    }

    const profile = profiles[0];
    if (!profile) {
      throw new CandidateInvariantViolationError('CANDIDATE_PROFILE_SELECTION');
    }

    const [experiences, education, projects, skills, languages] = await Promise.all([
      database
        .select()
        .from(candidateExperiences)
        .where(eq(candidateExperiences.candidateProfileId, profile.id))
        .orderBy(
          asc(candidateExperiences.sortOrder),
          desc(candidateExperiences.startDate),
          asc(candidateExperiences.id),
        ),
      database
        .select()
        .from(candidateEducation)
        .where(eq(candidateEducation.candidateProfileId, profile.id))
        .orderBy(
          asc(candidateEducation.sortOrder),
          desc(candidateEducation.startDate),
          asc(candidateEducation.id),
        ),
      database
        .select()
        .from(candidateProjects)
        .where(eq(candidateProjects.candidateProfileId, profile.id))
        .orderBy(
          asc(candidateProjects.sortOrder),
          sql`${candidateProjects.startDate} DESC NULLS LAST`,
          asc(candidateProjects.id),
        ),
      database
        .select()
        .from(candidateSkills)
        .where(eq(candidateSkills.candidateProfileId, profile.id))
        .orderBy(
          asc(candidateSkills.sortOrder),
          asc(candidateSkills.category),
          asc(candidateSkills.name),
          asc(candidateSkills.id),
        ),
      database
        .select()
        .from(candidateLanguages)
        .where(eq(candidateLanguages.candidateProfileId, profile.id))
        .orderBy(
          asc(candidateLanguages.sortOrder),
          asc(candidateLanguages.language),
          asc(candidateLanguages.id),
        ),
    ]);

    return {
      ...mapCandidateProfile(profile),
      experiences: experiences.map(mapCandidateExperience),
      education: education.map(mapCandidateEducation),
      projects: projects.map(mapCandidateProject),
      skills: skills.map(mapCandidateSkill),
      languages: languages.map(mapCandidateLanguage),
    };
  }

  private async requireAggregate(database: CandidateExecutor): Promise<CandidateAggregate> {
    const aggregate = await this.loadAggregateFrom(database);
    if (aggregate === null) {
      throw new CandidateInvariantViolationError('CANDIDATE_AGGREGATE_RELOAD');
    }
    return aggregate;
  }

  private assertSubmittedIdentifiers(command: CandidateReplacementCommand): void {
    assertUniqueSubmittedIdentifiers('experiences', command.experiences);
    assertUniqueSubmittedIdentifiers('education', command.education);
    assertUniqueSubmittedIdentifiers('projects', command.projects);
    assertUniqueSubmittedIdentifiers('skills', command.skills);
    assertUniqueSubmittedIdentifiers('languages', command.languages);
  }

  private assertChildOwnership(
    current: CandidateAggregate,
    command: CandidateReplacementCommand,
  ): void {
    this.assertCollectionOwnership('experiences', current.experiences, command.experiences);
    this.assertCollectionOwnership('education', current.education, command.education);
    this.assertCollectionOwnership('projects', current.projects, command.projects);
    this.assertCollectionOwnership('skills', current.skills, command.skills);
    this.assertCollectionOwnership('languages', current.languages, command.languages);
  }

  private assertCollectionOwnership(
    collection: CandidateChildCollection,
    current: readonly { readonly id: string }[],
    replacements: readonly { readonly id?: string }[],
  ): void {
    const currentIdentifiers = new Set(current.map(({ id }) => id));
    for (const replacement of replacements) {
      if (replacement.id !== undefined && !currentIdentifiers.has(replacement.id)) {
        throw new CandidateChildOwnershipConflictError(collection, replacement.id);
      }
    }
  }

  private async reconcileExperiences(
    database: CandidateTransaction,
    candidateProfileId: string,
    current: readonly CandidateExperience[],
    replacements: readonly CandidateExperienceReplacement[],
  ): Promise<boolean> {
    const retainedIdentifiers = new Set(
      replacements.flatMap(({ id }) => (id === undefined ? [] : [id])),
    );
    const deletedIdentifiers = current
      .filter(({ id }) => !retainedIdentifiers.has(id))
      .map(({ id }) => id);

    if (deletedIdentifiers.length > 0) {
      await database
        .delete(candidateExperiences)
        .where(
          and(
            eq(candidateExperiences.candidateProfileId, candidateProfileId),
            inArray(candidateExperiences.id, deletedIdentifiers),
          ),
        );
    }

    const currentById = new Map(current.map((experience) => [experience.id, experience]));
    let changed = deletedIdentifiers.length > 0;

    for (const replacement of replacements) {
      if (replacement.id === undefined) {
        await database.insert(candidateExperiences).values({
          candidateProfileId,
          organization: replacement.organization,
          role: replacement.role,
          location: replacement.location,
          startDate: replacement.startDate,
          endDate: replacement.endDate,
          descriptionMarkdown: replacement.descriptionMarkdown,
          sortOrder: replacement.sortOrder,
        });
        changed = true;
        continue;
      }

      const existing = currentById.get(replacement.id);
      if (!existing) {
        throw new CandidateInvariantViolationError('CANDIDATE_EXPERIENCE_RECONCILIATION');
      }
      if (!experienceValuesChanged(existing, replacement)) {
        continue;
      }

      await database
        .update(candidateExperiences)
        .set({
          organization: replacement.organization,
          role: replacement.role,
          location: replacement.location,
          startDate: replacement.startDate,
          endDate: replacement.endDate,
          descriptionMarkdown: replacement.descriptionMarkdown,
          sortOrder: replacement.sortOrder,
          updatedAt: transactionTimestamp,
        })
        .where(
          and(
            eq(candidateExperiences.id, replacement.id),
            eq(candidateExperiences.candidateProfileId, candidateProfileId),
          ),
        );
      changed = true;
    }

    return changed;
  }

  private async reconcileEducation(
    database: CandidateTransaction,
    candidateProfileId: string,
    current: readonly CandidateEducation[],
    replacements: readonly CandidateEducationReplacement[],
  ): Promise<boolean> {
    const retainedIdentifiers = new Set(
      replacements.flatMap(({ id }) => (id === undefined ? [] : [id])),
    );
    const deletedIdentifiers = current
      .filter(({ id }) => !retainedIdentifiers.has(id))
      .map(({ id }) => id);

    if (deletedIdentifiers.length > 0) {
      await database
        .delete(candidateEducation)
        .where(
          and(
            eq(candidateEducation.candidateProfileId, candidateProfileId),
            inArray(candidateEducation.id, deletedIdentifiers),
          ),
        );
    }

    const currentById = new Map(current.map((education) => [education.id, education]));
    let changed = deletedIdentifiers.length > 0;

    for (const replacement of replacements) {
      if (replacement.id === undefined) {
        await database.insert(candidateEducation).values({
          candidateProfileId,
          institution: replacement.institution,
          degree: replacement.degree,
          fieldOfStudy: replacement.fieldOfStudy,
          location: replacement.location,
          startDate: replacement.startDate,
          endDate: replacement.endDate,
          descriptionMarkdown: replacement.descriptionMarkdown,
          sortOrder: replacement.sortOrder,
        });
        changed = true;
        continue;
      }

      const existing = currentById.get(replacement.id);
      if (!existing) {
        throw new CandidateInvariantViolationError('CANDIDATE_EDUCATION_RECONCILIATION');
      }
      if (!educationValuesChanged(existing, replacement)) {
        continue;
      }

      await database
        .update(candidateEducation)
        .set({
          institution: replacement.institution,
          degree: replacement.degree,
          fieldOfStudy: replacement.fieldOfStudy,
          location: replacement.location,
          startDate: replacement.startDate,
          endDate: replacement.endDate,
          descriptionMarkdown: replacement.descriptionMarkdown,
          sortOrder: replacement.sortOrder,
          updatedAt: transactionTimestamp,
        })
        .where(
          and(
            eq(candidateEducation.id, replacement.id),
            eq(candidateEducation.candidateProfileId, candidateProfileId),
          ),
        );
      changed = true;
    }

    return changed;
  }

  private async reconcileProjects(
    database: CandidateTransaction,
    candidateProfileId: string,
    current: readonly CandidateProject[],
    replacements: readonly CandidateProjectReplacement[],
  ): Promise<boolean> {
    const retainedIdentifiers = new Set(
      replacements.flatMap(({ id }) => (id === undefined ? [] : [id])),
    );
    const deletedIdentifiers = current
      .filter(({ id }) => !retainedIdentifiers.has(id))
      .map(({ id }) => id);

    if (deletedIdentifiers.length > 0) {
      await database
        .delete(candidateProjects)
        .where(
          and(
            eq(candidateProjects.candidateProfileId, candidateProfileId),
            inArray(candidateProjects.id, deletedIdentifiers),
          ),
        );
    }

    const currentById = new Map(current.map((project) => [project.id, project]));
    let changed = deletedIdentifiers.length > 0;

    for (const replacement of replacements) {
      if (replacement.id === undefined) {
        await database.insert(candidateProjects).values({
          candidateProfileId,
          name: replacement.name,
          role: replacement.role,
          descriptionMarkdown: replacement.descriptionMarkdown,
          projectUrl: replacement.projectUrl,
          repositoryUrl: replacement.repositoryUrl,
          startDate: replacement.startDate,
          endDate: replacement.endDate,
          technologiesJson: [...replacement.technologies],
          sortOrder: replacement.sortOrder,
        });
        changed = true;
        continue;
      }

      const existing = currentById.get(replacement.id);
      if (!existing) {
        throw new CandidateInvariantViolationError('CANDIDATE_PROJECT_RECONCILIATION');
      }
      if (!projectValuesChanged(existing, replacement)) {
        continue;
      }

      await database
        .update(candidateProjects)
        .set({
          name: replacement.name,
          role: replacement.role,
          descriptionMarkdown: replacement.descriptionMarkdown,
          projectUrl: replacement.projectUrl,
          repositoryUrl: replacement.repositoryUrl,
          startDate: replacement.startDate,
          endDate: replacement.endDate,
          technologiesJson: [...replacement.technologies],
          sortOrder: replacement.sortOrder,
          updatedAt: transactionTimestamp,
        })
        .where(
          and(
            eq(candidateProjects.id, replacement.id),
            eq(candidateProjects.candidateProfileId, candidateProfileId),
          ),
        );
      changed = true;
    }

    return changed;
  }

  private async reconcileSkills(
    database: CandidateTransaction,
    candidateProfileId: string,
    current: readonly CandidateSkill[],
    replacements: readonly CandidateSkillReplacement[],
  ): Promise<boolean> {
    const retainedIdentifiers = new Set(
      replacements.flatMap(({ id }) => (id === undefined ? [] : [id])),
    );
    const deletedIdentifiers = current
      .filter(({ id }) => !retainedIdentifiers.has(id))
      .map(({ id }) => id);

    if (deletedIdentifiers.length > 0) {
      await database
        .delete(candidateSkills)
        .where(
          and(
            eq(candidateSkills.candidateProfileId, candidateProfileId),
            inArray(candidateSkills.id, deletedIdentifiers),
          ),
        );
    }

    const currentById = new Map(current.map((skill) => [skill.id, skill]));
    const changedRetained = replacements.filter((replacement) => {
      if (replacement.id === undefined) {
        return false;
      }
      const existing = currentById.get(replacement.id);
      return existing !== undefined && skillValuesChanged(existing, replacement);
    });
    const reservedKeys = new Set([
      ...current.map(({ name }) => normalizeNaturalKey(name)),
      ...replacements.map(({ name }) => normalizeNaturalKey(name)),
    ]);

    for (const replacement of changedRetained) {
      const existing = currentById.get(replacement.id!);
      if (
        existing !== undefined &&
        normalizeNaturalKey(existing.name) !== normalizeNaturalKey(replacement.name)
      ) {
        await database
          .update(candidateSkills)
          .set({
            name: temporaryNaturalKey('skill', existing.id, reservedKeys),
          })
          .where(
            and(
              eq(candidateSkills.id, existing.id),
              eq(candidateSkills.candidateProfileId, candidateProfileId),
            ),
          );
      }
    }

    let changed = deletedIdentifiers.length > 0;
    for (const replacement of replacements) {
      if (replacement.id === undefined) {
        await database.insert(candidateSkills).values({
          candidateProfileId,
          name: replacement.name,
          category: replacement.category,
          level: replacement.level,
          notes: replacement.notes,
          sortOrder: replacement.sortOrder,
        });
        changed = true;
        continue;
      }

      const existing = currentById.get(replacement.id);
      if (!existing) {
        throw new CandidateInvariantViolationError('CANDIDATE_SKILL_RECONCILIATION');
      }
      if (!skillValuesChanged(existing, replacement)) {
        continue;
      }

      await database
        .update(candidateSkills)
        .set({
          name: replacement.name,
          category: replacement.category,
          level: replacement.level,
          notes: replacement.notes,
          sortOrder: replacement.sortOrder,
          updatedAt: transactionTimestamp,
        })
        .where(
          and(
            eq(candidateSkills.id, replacement.id),
            eq(candidateSkills.candidateProfileId, candidateProfileId),
          ),
        );
      changed = true;
    }

    return changed;
  }

  private async reconcileLanguages(
    database: CandidateTransaction,
    candidateProfileId: string,
    current: readonly CandidateLanguage[],
    replacements: readonly CandidateLanguageReplacement[],
  ): Promise<boolean> {
    const retainedIdentifiers = new Set(
      replacements.flatMap(({ id }) => (id === undefined ? [] : [id])),
    );
    const deletedIdentifiers = current
      .filter(({ id }) => !retainedIdentifiers.has(id))
      .map(({ id }) => id);

    if (deletedIdentifiers.length > 0) {
      await database
        .delete(candidateLanguages)
        .where(
          and(
            eq(candidateLanguages.candidateProfileId, candidateProfileId),
            inArray(candidateLanguages.id, deletedIdentifiers),
          ),
        );
    }

    const currentById = new Map(current.map((language) => [language.id, language]));
    const changedRetained = replacements.filter((replacement) => {
      if (replacement.id === undefined) {
        return false;
      }
      const existing = currentById.get(replacement.id);
      return existing !== undefined && languageValuesChanged(existing, replacement);
    });
    const reservedKeys = new Set([
      ...current.map(({ language }) => normalizeNaturalKey(language)),
      ...replacements.map(({ language }) => normalizeNaturalKey(language)),
    ]);

    for (const replacement of changedRetained) {
      const existing = currentById.get(replacement.id!);
      if (
        existing !== undefined &&
        normalizeNaturalKey(existing.language) !== normalizeNaturalKey(replacement.language)
      ) {
        await database
          .update(candidateLanguages)
          .set({
            language: temporaryNaturalKey('language', existing.id, reservedKeys),
          })
          .where(
            and(
              eq(candidateLanguages.id, existing.id),
              eq(candidateLanguages.candidateProfileId, candidateProfileId),
            ),
          );
      }
    }

    let changed = deletedIdentifiers.length > 0;
    for (const replacement of replacements) {
      if (replacement.id === undefined) {
        await database.insert(candidateLanguages).values({
          candidateProfileId,
          language: replacement.language,
          level: replacement.level,
          certification: replacement.certification,
          notes: replacement.notes,
          sortOrder: replacement.sortOrder,
        });
        changed = true;
        continue;
      }

      const existing = currentById.get(replacement.id);
      if (!existing) {
        throw new CandidateInvariantViolationError('CANDIDATE_LANGUAGE_RECONCILIATION');
      }
      if (!languageValuesChanged(existing, replacement)) {
        continue;
      }

      await database
        .update(candidateLanguages)
        .set({
          language: replacement.language,
          level: replacement.level,
          certification: replacement.certification,
          notes: replacement.notes,
          sortOrder: replacement.sortOrder,
          updatedAt: transactionTimestamp,
        })
        .where(
          and(
            eq(candidateLanguages.id, replacement.id),
            eq(candidateLanguages.candidateProfileId, candidateProfileId),
          ),
        );
      changed = true;
    }

    return changed;
  }
}
