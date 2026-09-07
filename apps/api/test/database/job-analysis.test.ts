import { count, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import type { AnalyzeOutput } from '../../src/analyze/analyze.schema.js';
import { JobAnalysisRunningConflictError } from '../../src/analyze/analyze.errors.js';
import { JobAnalysisRepository } from '../../src/analyze/job-analysis.repository.js';
import * as schema from '../../src/db/schema.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

const validAnalysis: AnalyzeOutput = {
  roleSummary: 'Build and operate backend systems.',
  fitSummary: 'The candidate has strong relevant experience.',
  requirements: [
    {
      requirement: 'Production TypeScript experience',
      importance: 'REQUIRED',
      matchStrength: 'STRONG',
      evidence: ['Built production TypeScript services.'],
    },
  ],
  candidateEvidence: [
    {
      claim: 'Experienced backend engineer',
      evidence: ['Led a backend service migration.'],
    },
  ],
  strengths: ['TypeScript delivery experience'],
  gaps: ['No explicit Kubernetes certification'],
  keywords: ['TypeScript', 'PostgreSQL'],
  hardConstraints: [
    {
      constraint: 'Must be able to work in Chile',
      satisfied: null,
      evidence: [],
    },
  ],
  warnings: ['Work authorization is not stated.'],
};

let client: Sql;
let database: TestDatabase;
let repository: JobAnalysisRepository;

async function resetApplicationState(): Promise<void> {
  await client.unsafe('truncate table applications cascade');
}

async function createApplication(companyName = 'Analytical Engines Ltd'): Promise<string> {
  const [application] = await database
    .insert(schema.applications)
    .values({
      companyName,
      roleTitle: 'Backend Engineer',
      source: 'CAREER_PAGE',
      status: 'FOUND',
      priority: 'MEDIUM',
    })
    .returning({ id: schema.applications.id });

  if (application === undefined) {
    throw new Error('Application fixture insert did not return a row.');
  }

  return application.id;
}

beforeAll(async () => {
  const target = getTestDatabaseTarget();
  client = postgres(target.url, { max: 5, onnotice: () => undefined });
  database = drizzle(client, { schema });
  repository = new JobAnalysisRepository(database);
  await resetApplicationState();
});

afterEach(resetApplicationState);

afterAll(async () => {
  await client.end();
});

describe('JobAnalysis persistence', () => {
  it('is created by the migration with the frozen status enum and RUNNING index', async () => {
    const [table] = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'job_analyses'
    `;
    const enumRows = await client<{ enumlabel: string }[]>`
      select enumlabel
      from pg_enum
      join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'job_analysis_status'
      order by pg_enum.enumsortorder
    `;
    const [runningIndex] = await client<{ indexdef: string }[]>`
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'job_analyses_application_running_uq'
    `;

    expect(table).toEqual({ table_name: 'job_analyses' });
    expect(enumRows.map(({ enumlabel }) => enumlabel)).toEqual([
      'RUNNING',
      'COMPLETED',
      'FAILED',
    ]);
    expect(runningIndex?.indexdef).toContain('UNIQUE INDEX');
    expect(runningIndex?.indexdef).toContain("WHERE (status = 'RUNNING'::job_analysis_status)");
  });

  it('creates and maps a RUNNING analysis with generated identity and timestamps', async () => {
    const applicationId = await createApplication();
    const startedAt = new Date('2026-08-25T12:00:00.000Z');

    const analysis = await repository.createRunning({
      applicationId,
      promptVersion: 'analyze-v1',
      startedAt,
    });

    expect(analysis).toMatchObject({
      applicationId,
      status: 'RUNNING',
      analysisData: null,
      suggestedScore: null,
      failureCode: null,
      failureMessage: null,
      promptVersion: 'analyze-v1',
      startedAt,
      completedAt: null,
      failedAt: null,
    });
    expect(analysis.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(analysis.createdAt).toBeInstanceOf(Date);
    expect(analysis.updatedAt).toBeInstanceOf(Date);
  });

  it('enforces Application ownership and cascades history with its Application', async () => {
    await expect(
      repository.createRunning({
        applicationId: '00000000-0000-4000-8000-000000000000',
        promptVersion: 'analyze-v1',
        startedAt: new Date(),
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });

    const applicationId = await createApplication();
    await repository.createRunning({
      applicationId,
      promptVersion: 'analyze-v1',
      startedAt: new Date(),
    });

    await database
      .delete(schema.applications)
      .where(eq(schema.applications.id, applicationId));

    const [result] = await database.select({ count: count() }).from(schema.jobAnalyses);
    expect(result?.count).toBe(0);
  });

  it('rejects a second RUNNING analysis for one Application but allows another owner', async () => {
    const firstApplicationId = await createApplication('First Company');
    const secondApplicationId = await createApplication('Second Company');
    const startedAt = new Date('2026-08-25T12:00:00.000Z');

    await repository.createRunning({
      applicationId: firstApplicationId,
      promptVersion: 'analyze-v1',
      startedAt,
    });

    await expect(
      repository.createRunning({
        applicationId: firstApplicationId,
        promptVersion: 'analyze-v1',
        startedAt,
      }),
    ).rejects.toBeInstanceOf(JobAnalysisRunningConflictError);

    await expect(
      repository.createRunning({
        applicationId: secondApplicationId,
        promptVersion: 'analyze-v1',
        startedAt,
      }),
    ).resolves.toMatchObject({ status: 'RUNNING' });
  });

  it('transitions the explicit RUNNING row to COMPLETED with validated data', async () => {
    const applicationId = await createApplication();
    const running = await repository.createRunning({
      applicationId,
      promptVersion: 'analyze-v1',
      startedAt: new Date('2026-08-25T12:00:00.000Z'),
    });
    const completedAt = new Date('2026-08-25T12:01:00.000Z');

    const completed = await repository.markCompleted(running.id, {
      analysisData: validAnalysis,
      suggestedScore: 91,
      completedAt,
    });

    expect(completed).toMatchObject({
      id: running.id,
      applicationId,
      status: 'COMPLETED',
      analysisData: validAnalysis,
      suggestedScore: 91,
      completedAt,
      failedAt: null,
    });
    await expect(
      repository.markCompleted(running.id, {
        analysisData: validAnalysis,
        suggestedScore: 91,
        completedAt,
      }),
    ).resolves.toBeNull();
  });

  it('transitions the explicit RUNNING row to FAILED without completed output', async () => {
    const applicationId = await createApplication();
    const running = await repository.createRunning({
      applicationId,
      promptVersion: 'analyze-v1',
      startedAt: new Date('2026-08-25T12:00:00.000Z'),
    });
    const failedAt = new Date('2026-08-25T12:01:00.000Z');

    const failed = await repository.markFailed(running.id, {
      failureCode: 'PROVIDER_FAILURE',
      failureMessage: 'The analysis could not be completed.',
      failedAt,
    });

    expect(failed).toMatchObject({
      id: running.id,
      status: 'FAILED',
      analysisData: null,
      suggestedScore: null,
      failureCode: 'PROVIDER_FAILURE',
      failureMessage: 'The analysis could not be completed.',
      completedAt: null,
      failedAt,
    });
    await expect(
      repository.markFailed(running.id, {
        failureCode: null,
        failureMessage: null,
        failedAt,
      }),
    ).resolves.toBeNull();
  });

  it('preserves terminal history and permits a later RUNNING rerun', async () => {
    const applicationId = await createApplication();
    const first = await repository.createRunning({
      applicationId,
      promptVersion: 'analyze-v1',
      startedAt: new Date('2026-08-25T10:00:00.000Z'),
    });
    await repository.markCompleted(first.id, {
      analysisData: validAnalysis,
      suggestedScore: 100,
      completedAt: new Date('2026-08-25T10:01:00.000Z'),
    });
    const second = await repository.createRunning({
      applicationId,
      promptVersion: 'analyze-v1',
      startedAt: new Date('2026-08-25T11:00:00.000Z'),
    });
    await repository.markFailed(second.id, {
      failureCode: null,
      failureMessage: null,
      failedAt: new Date('2026-08-25T11:01:00.000Z'),
    });
    const third = await repository.createRunning({
      applicationId,
      promptVersion: 'analyze-v1',
      startedAt: new Date('2026-08-25T12:00:00.000Z'),
    });

    const history = await repository.listByApplicationId(applicationId);
    expect(history.map(({ id }) => id)).toEqual([third.id, second.id, first.id]);
    expect(history.map(({ status }) => status)).toEqual([
      'RUNNING',
      'FAILED',
      'COMPLETED',
    ]);
  });

  it.each([-1, 101])('rejects suggested score %i outside 0..100', async (score) => {
    const applicationId = await createApplication();

    await expect(
      database.insert(schema.jobAnalyses).values({
        applicationId,
        status: 'COMPLETED',
        analysisData: validAnalysis,
        suggestedScore: score,
        promptVersion: 'analyze-v1',
        startedAt: new Date('2026-08-25T12:00:00.000Z'),
        completedAt: new Date('2026-08-25T12:01:00.000Z'),
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it.each([
    {
      status: 'RUNNING' as const,
      analysisData: validAnalysis,
      suggestedScore: null,
      completedAt: null,
      failedAt: null,
    },
    {
      status: 'COMPLETED' as const,
      analysisData: null,
      suggestedScore: null,
      completedAt: new Date('2026-08-25T12:01:00.000Z'),
      failedAt: null,
    },
    {
      status: 'FAILED' as const,
      analysisData: null,
      suggestedScore: null,
      completedAt: null,
      failedAt: null,
    },
  ])('rejects inconsistent $status state', async (state) => {
    const applicationId = await createApplication();

    await expect(
      database.insert(schema.jobAnalyses).values({
        applicationId,
        promptVersion: 'analyze-v1',
        startedAt: new Date('2026-08-25T12:00:00.000Z'),
        ...state,
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('rejects terminal timestamps before the run start', async () => {
    const applicationId = await createApplication();

    await expect(
      database.insert(schema.jobAnalyses).values({
        applicationId,
        status: 'COMPLETED',
        analysisData: validAnalysis,
        suggestedScore: null,
        promptVersion: 'analyze-v1',
        startedAt: new Date('2026-08-25T12:00:00.000Z'),
        completedAt: new Date('2026-08-25T11:59:00.000Z'),
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('retrieves latest, latest completed, running, and history deterministically', async () => {
    const applicationId = await createApplication();
    const tiedCreatedAt = new Date('2026-08-25T11:00:00.000Z');
    const olderCompletedId = '00000000-0000-4000-8000-000000000001';
    const newerCompletedId = '00000000-0000-4000-8000-000000000002';
    const failedId = '00000000-0000-4000-8000-000000000003';
    const runningId = '00000000-0000-4000-8000-000000000004';

    await database.insert(schema.jobAnalyses).values([
      {
        id: olderCompletedId,
        applicationId,
        status: 'COMPLETED',
        analysisData: validAnalysis,
        suggestedScore: 75,
        promptVersion: 'analyze-v1',
        startedAt: new Date('2026-08-25T10:00:00.000Z'),
        completedAt: new Date('2026-08-25T10:01:00.000Z'),
        createdAt: tiedCreatedAt,
        updatedAt: tiedCreatedAt,
      },
      {
        id: newerCompletedId,
        applicationId,
        status: 'COMPLETED',
        analysisData: validAnalysis,
        suggestedScore: null,
        promptVersion: 'analyze-v1',
        startedAt: new Date('2026-08-25T10:02:00.000Z'),
        completedAt: new Date('2026-08-25T10:03:00.000Z'),
        createdAt: tiedCreatedAt,
        updatedAt: tiedCreatedAt,
      },
      {
        id: failedId,
        applicationId,
        status: 'FAILED',
        failureCode: 'VALIDATION_FAILED',
        failureMessage: 'The structured result was invalid.',
        promptVersion: 'analyze-v1',
        startedAt: new Date('2026-08-25T11:01:00.000Z'),
        failedAt: new Date('2026-08-25T11:02:00.000Z'),
        createdAt: new Date('2026-08-25T11:01:00.000Z'),
        updatedAt: new Date('2026-08-25T11:02:00.000Z'),
      },
      {
        id: runningId,
        applicationId,
        status: 'RUNNING',
        promptVersion: 'analyze-v1',
        startedAt: new Date('2026-08-25T12:00:00.000Z'),
        createdAt: new Date('2026-08-25T12:00:00.000Z'),
        updatedAt: new Date('2026-08-25T12:00:00.000Z'),
      },
    ]);

    await expect(repository.findLatestByApplicationId(applicationId)).resolves.toMatchObject({
      id: runningId,
    });
    await expect(
      repository.findLatestCompletedByApplicationId(applicationId),
    ).resolves.toMatchObject({ id: newerCompletedId });
    await expect(
      repository.findRunningByApplicationId(applicationId),
    ).resolves.toMatchObject({ id: runningId });
    await expect(repository.findById(failedId)).resolves.toMatchObject({
      id: failedId,
      failureCode: 'VALIDATION_FAILED',
    });

    const history = await repository.listByApplicationId(applicationId);
    expect(history.map(({ id }) => id)).toEqual([
      runningId,
      failedId,
      newerCompletedId,
      olderCompletedId,
    ]);
  });

  it('returns null or an empty history when an Application has no analyses', async () => {
    const applicationId = await createApplication();

    await expect(repository.findLatestByApplicationId(applicationId)).resolves.toBeNull();
    await expect(
      repository.findLatestCompletedByApplicationId(applicationId),
    ).resolves.toBeNull();
    await expect(repository.findRunningByApplicationId(applicationId)).resolves.toBeNull();
    await expect(repository.listByApplicationId(applicationId)).resolves.toEqual([]);
  });
});
