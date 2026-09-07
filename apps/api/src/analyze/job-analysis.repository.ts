import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { jobAnalyses } from '../db/schema.js';
import { JobAnalysisRunningConflictError } from './analyze.errors.js';
import type {
  CompleteJobAnalysisCommand,
  CreateRunningJobAnalysisCommand,
  FailJobAnalysisCommand,
  JobAnalysis,
} from './analyze.types.js';

type JobAnalysisRow = typeof jobAnalyses.$inferSelect;

function isRunningConflict(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current = error;

  while (
    typeof current === 'object' &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(current);
    const candidate = current as {
      readonly code?: unknown;
      readonly constraint?: unknown;
      readonly constraint_name?: unknown;
      readonly cause?: unknown;
    };
    const constraint = candidate.constraint_name ?? candidate.constraint;
    if (
      candidate.code === '23505' &&
      constraint === 'job_analyses_application_running_uq'
    ) {
      return true;
    }
    current = candidate.cause;
  }

  return false;
}

function mapJobAnalysis(row: JobAnalysisRow): JobAnalysis {
  return {
    id: row.id,
    applicationId: row.applicationId,
    status: row.status,
    analysisData: row.analysisData,
    suggestedScore: row.suggestedScore,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    promptVersion: row.promptVersion,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failedAt: row.failedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class JobAnalysisRepository {
  constructor(private readonly database: Database) {}

  async createRunning(
    command: CreateRunningJobAnalysisCommand,
  ): Promise<JobAnalysis> {
    let row: JobAnalysisRow | undefined;

    try {
      [row] = await this.database
        .insert(jobAnalyses)
        .values({ ...command, status: 'RUNNING' })
        .returning();
    } catch (error) {
      if (isRunningConflict(error)) {
        throw new JobAnalysisRunningConflictError();
      }
      throw error;
    }

    if (row === undefined) {
      throw new Error('Job Analysis insert did not return a row.');
    }

    return mapJobAnalysis(row);
  }

  async markCompleted(
    id: string,
    command: CompleteJobAnalysisCommand,
  ): Promise<JobAnalysis | null> {
    const [row] = await this.database
      .update(jobAnalyses)
      .set({
        status: 'COMPLETED',
        analysisData: command.analysisData,
        suggestedScore: command.suggestedScore,
        failureCode: null,
        failureMessage: null,
        completedAt: command.completedAt,
        failedAt: null,
        updatedAt: sql`transaction_timestamp()`,
      })
      .where(and(eq(jobAnalyses.id, id), eq(jobAnalyses.status, 'RUNNING')))
      .returning();

    return row === undefined ? null : mapJobAnalysis(row);
  }

  async markFailed(
    id: string,
    command: FailJobAnalysisCommand,
  ): Promise<JobAnalysis | null> {
    const [row] = await this.database
      .update(jobAnalyses)
      .set({
        status: 'FAILED',
        analysisData: null,
        suggestedScore: null,
        failureCode: command.failureCode,
        failureMessage: command.failureMessage,
        completedAt: null,
        failedAt: command.failedAt,
        updatedAt: sql`transaction_timestamp()`,
      })
      .where(and(eq(jobAnalyses.id, id), eq(jobAnalyses.status, 'RUNNING')))
      .returning();

    return row === undefined ? null : mapJobAnalysis(row);
  }

  async findById(id: string): Promise<JobAnalysis | null> {
    const [row] = await this.database
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.id, id))
      .limit(1);

    return row === undefined ? null : mapJobAnalysis(row);
  }

  async findRunningByApplicationId(
    applicationId: string,
  ): Promise<JobAnalysis | null> {
    const [row] = await this.database
      .select()
      .from(jobAnalyses)
      .where(
        and(
          eq(jobAnalyses.applicationId, applicationId),
          eq(jobAnalyses.status, 'RUNNING'),
        ),
      )
      .limit(1);

    return row === undefined ? null : mapJobAnalysis(row);
  }

  async findLatestByApplicationId(
    applicationId: string,
  ): Promise<JobAnalysis | null> {
    const [row] = await this.database
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.applicationId, applicationId))
      .orderBy(desc(jobAnalyses.createdAt), desc(jobAnalyses.id))
      .limit(1);

    return row === undefined ? null : mapJobAnalysis(row);
  }

  async findLatestCompletedByApplicationId(
    applicationId: string,
  ): Promise<JobAnalysis | null> {
    const [row] = await this.database
      .select()
      .from(jobAnalyses)
      .where(
        and(
          eq(jobAnalyses.applicationId, applicationId),
          eq(jobAnalyses.status, 'COMPLETED'),
        ),
      )
      .orderBy(desc(jobAnalyses.createdAt), desc(jobAnalyses.id))
      .limit(1);

    return row === undefined ? null : mapJobAnalysis(row);
  }

  async listByApplicationId(applicationId: string): Promise<JobAnalysis[]> {
    const rows = await this.database
      .select()
      .from(jobAnalyses)
      .where(eq(jobAnalyses.applicationId, applicationId))
      .orderBy(desc(jobAnalyses.createdAt), desc(jobAnalyses.id));

    return rows.map(mapJobAnalysis);
  }
}
