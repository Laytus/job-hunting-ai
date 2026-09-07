import { eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  applicationEvents,
  applications,
  candidateEducation,
  candidateExperiences,
  candidateLanguages,
  candidateProfiles,
  candidateProjects,
  candidateSkills,
  interviews,
  jobDescriptions,
} from '../db/schema.js';
import {
  developmentSeedData,
  developmentSeedMarker,
} from './development-seed.data.js';

const developmentSeedLockKey = 5_318_202_605;
const localDatabaseHosts = new Set(['localhost', '127.0.0.1', '[::1]', 'postgres']);
const maintenanceDatabases = new Set(['postgres', 'template0', 'template1']);

export interface DevelopmentSeedSummary {
  readonly candidateProfiles: number;
  readonly candidateExperiences: number;
  readonly candidateEducation: number;
  readonly candidateProjects: number;
  readonly candidateSkills: number;
  readonly candidateLanguages: number;
  readonly applications: number;
  readonly jobDescriptions: number;
  readonly interviews: number;
  readonly applicationEvents: number;
}

export class DevelopmentSeedSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class DevelopmentSeedConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

function parsePostgreSqlUrl(value: string, variableName: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      throw new Error('URL must use the postgres or postgresql protocol.');
    }
    return url;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Invalid URL.';
    throw new DevelopmentSeedSafetyError(
      `${variableName} must be a valid PostgreSQL URL. ${reason}`,
    );
  }
}

function databaseName(url: URL, variableName: string): string {
  const name = decodeURIComponent(url.pathname.slice(1));
  if (name === '' || name.includes('/')) {
    throw new DevelopmentSeedSafetyError(
      `${variableName} must name exactly one database.`,
    );
  }
  return name;
}

function databaseIdentity(url: URL, variableName: string): string {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}/${databaseName(url, variableName)}`;
}

export function getDevelopmentSeedDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const nodeEnvironment = environment['NODE_ENV'];
  if (nodeEnvironment !== undefined && nodeEnvironment !== 'development') {
    throw new DevelopmentSeedSafetyError(
      'Development seeding requires NODE_ENV to be development or unset.',
    );
  }
  if (environment['CI'] === 'true' || environment['CI'] === '1') {
    throw new DevelopmentSeedSafetyError(
      'Development seeding is disabled in continuous integration.',
    );
  }

  const value = environment['DATABASE_URL'];
  if (!value) {
    throw new DevelopmentSeedSafetyError(
      'DATABASE_URL is required for development seeding.',
    );
  }
  const url = parsePostgreSqlUrl(value, 'DATABASE_URL');
  if (!localDatabaseHosts.has(url.hostname.toLowerCase())) {
    throw new DevelopmentSeedSafetyError(
      'Development seeding only supports a local PostgreSQL host.',
    );
  }

  const name = databaseName(url, 'DATABASE_URL');
  if (maintenanceDatabases.has(name)) {
    throw new DevelopmentSeedSafetyError(
      `Development seeding cannot target the ${name} maintenance database.`,
    );
  }
  if (/(^|[_-])tests?($|[_-])/iu.test(name)) {
    throw new DevelopmentSeedSafetyError(
      'Development seeding cannot target a test database.',
    );
  }

  const testValue = environment['DATABASE_TEST_URL'];
  if (testValue) {
    const testUrl = parsePostgreSqlUrl(testValue, 'DATABASE_TEST_URL');
    if (
      databaseIdentity(url, 'DATABASE_URL') ===
      databaseIdentity(testUrl, 'DATABASE_TEST_URL')
    ) {
      throw new DevelopmentSeedSafetyError(
        'DATABASE_URL must not target the configured test database.',
      );
    }
  }

  return url.toString();
}

export async function seedDevelopmentDatabase(
  database: Database,
): Promise<DevelopmentSeedSummary> {
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(${developmentSeedLockKey})`,
    );

    const profiles = await transaction
      .select({
        id: candidateProfiles.id,
        additionalContext: candidateProfiles.additionalContext,
      })
      .from(candidateProfiles);
    const nonSeedProfile = profiles.find(
      ({ id }) => id !== developmentSeedData.candidateProfile.id,
    );
    if (nonSeedProfile !== undefined) {
      throw new DevelopmentSeedConflictError(
        'A non-seed Candidate Profile already exists. Development seed data was not changed.',
      );
    }
    const existingSeedProfile = profiles.find(
      ({ id }) => id === developmentSeedData.candidateProfile.id,
    );
    if (
      existingSeedProfile !== undefined &&
      !existingSeedProfile.additionalContext?.includes(developmentSeedMarker)
    ) {
      throw new DevelopmentSeedConflictError(
        'The reserved Candidate seed identifier is owned by unmarked data. Development seed data was not changed.',
      );
    }

    const applicationIds = developmentSeedData.applications.map(({ id }) => id);
    const existingApplications = await transaction
      .select({ id: applications.id, notesMarkdown: applications.notesMarkdown })
      .from(applications)
      .where(inArray(applications.id, applicationIds));
    if (
      existingApplications.some(
        ({ notesMarkdown }) => !notesMarkdown?.includes(developmentSeedMarker),
      )
    ) {
      throw new DevelopmentSeedConflictError(
        'A reserved Application seed identifier is owned by unmarked data. Development seed data was not changed.',
      );
    }

    await transaction
      .delete(applications)
      .where(inArray(applications.id, applicationIds));
    await transaction
      .delete(candidateProfiles)
      .where(eq(candidateProfiles.id, developmentSeedData.candidateProfile.id));

    await transaction
      .insert(candidateProfiles)
      .values(developmentSeedData.candidateProfile);
    await transaction
      .insert(candidateExperiences)
      .values([...developmentSeedData.candidateExperiences]);
    await transaction
      .insert(candidateEducation)
      .values([...developmentSeedData.candidateEducation]);
    await transaction
      .insert(candidateProjects)
      .values([...developmentSeedData.candidateProjects]);
    await transaction
      .insert(candidateSkills)
      .values([...developmentSeedData.candidateSkills]);
    await transaction
      .insert(candidateLanguages)
      .values([...developmentSeedData.candidateLanguages]);
    await transaction
      .insert(applications)
      .values([...developmentSeedData.applications]);
    await transaction
      .insert(jobDescriptions)
      .values([...developmentSeedData.jobDescriptions]);
    await transaction.insert(interviews).values([...developmentSeedData.interviews]);
    await transaction
      .insert(applicationEvents)
      .values([...developmentSeedData.applicationEvents]);

    return {
      candidateProfiles: 1,
      candidateExperiences: developmentSeedData.candidateExperiences.length,
      candidateEducation: developmentSeedData.candidateEducation.length,
      candidateProjects: developmentSeedData.candidateProjects.length,
      candidateSkills: developmentSeedData.candidateSkills.length,
      candidateLanguages: developmentSeedData.candidateLanguages.length,
      applications: developmentSeedData.applications.length,
      jobDescriptions: developmentSeedData.jobDescriptions.length,
      interviews: developmentSeedData.interviews.length,
      applicationEvents: developmentSeedData.applicationEvents.length,
    };
  });
}
