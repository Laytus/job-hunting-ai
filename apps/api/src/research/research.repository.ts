import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  researchClaims,
  researchClaimSources,
  researches,
  researchSources,
} from '../db/schema.js';
import {
  ResearchGraphReferenceError,
  ResearchPersistenceInvariantError,
  ResearchRunningConflictError,
} from './research.errors.js';
import type {
  CompleteResearchGraphCommand,
  CreateRunningResearchCommand,
  FailResearchCommand,
  Research,
  ResearchAggregate,
  ResearchClaim,
  ResearchClaimSource,
  ResearchSource,
} from './research.types.js';

type ResearchRow = typeof researches.$inferSelect;
type ResearchSourceRow = typeof researchSources.$inferSelect;
type ResearchClaimRow = typeof researchClaims.$inferSelect;
type ResearchClaimSourceRow = typeof researchClaimSources.$inferSelect;
type ResearchTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type ResearchExecutor = Database | ResearchTransaction;

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
      constraint === 'researches_application_running_uq'
    ) {
      return true;
    }
    current = candidate.cause;
  }

  return false;
}

function mapResearch(row: ResearchRow): Research {
  return {
    id: row.id,
    applicationId: row.applicationId,
    status: row.status,
    summaryMarkdown: row.summaryMarkdown,
    warnings: row.warnings,
    promptVersion: row.promptVersion,
    researchDate: row.researchDate,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failedAt: row.failedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapResearchSource(row: ResearchSourceRow): ResearchSource {
  return {
    id: row.id,
    researchId: row.researchId,
    url: row.url,
    normalizedUrl: row.normalizedUrl,
    title: row.title,
    publisher: row.publisher,
    sourceType: row.sourceType,
    sourceQuality: row.sourceQuality,
    publishedAt: row.publishedAt,
    retrievedAt: row.retrievedAt,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

function mapResearchClaim(row: ResearchClaimRow): ResearchClaim {
  return {
    id: row.id,
    researchId: row.researchId,
    type: row.type,
    valueText: row.valueText,
    valueJson: row.valueJson,
    evidenceType: row.evidenceType,
    confidence: row.confidence,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

function mapResearchClaimSource(
  row: ResearchClaimSourceRow,
): ResearchClaimSource {
  return {
    researchId: row.researchId,
    claimId: row.claimId,
    sourceId: row.sourceId,
    relationship: row.relationship,
    evidenceText: row.evidenceText,
  };
}

function buildGraphRows(researchId: string, command: CompleteResearchGraphCommand) {
  const sourceIds = new Map<string, string>();
  const sourceRows = command.sources.map((source) => {
    if (sourceIds.has(source.key)) {
      throw new ResearchGraphReferenceError('DUPLICATE_SOURCE_KEY');
    }

    const id = randomUUID();
    sourceIds.set(source.key, id);
    return {
      id,
      researchId,
      url: source.url,
      normalizedUrl: source.normalizedUrl,
      title: source.title,
      publisher: source.publisher,
      sourceType: source.sourceType,
      sourceQuality: source.sourceQuality,
      publishedAt: source.publishedAt,
      retrievedAt: source.retrievedAt,
      notes: source.notes,
    };
  });

  const claimIds = new Map<string, string>();
  const claimRows = command.claims.map((claim) => {
    if (claimIds.has(claim.key)) {
      throw new ResearchGraphReferenceError('DUPLICATE_CLAIM_KEY');
    }

    const id = randomUUID();
    claimIds.set(claim.key, id);
    return {
      id,
      researchId,
      type: claim.type,
      valueText: claim.valueText,
      valueJson: claim.valueJson,
      evidenceType: claim.evidenceType,
      confidence: claim.confidence,
      notes: claim.notes,
    };
  });

  const relationshipRows = command.relationships.map((relationship) => {
    const claimId = claimIds.get(relationship.claimKey);
    if (claimId === undefined) {
      throw new ResearchGraphReferenceError('CLAIM_KEY_NOT_FOUND');
    }
    const sourceId = sourceIds.get(relationship.sourceKey);
    if (sourceId === undefined) {
      throw new ResearchGraphReferenceError('SOURCE_KEY_NOT_FOUND');
    }

    return {
      researchId,
      claimId,
      sourceId,
      relationship: relationship.relationship,
      evidenceText: relationship.evidenceText,
    };
  });

  return { sourceRows, claimRows, relationshipRows };
}

export class ResearchRepository {
  constructor(private readonly database: Database) {}

  async createRunning(command: CreateRunningResearchCommand): Promise<Research> {
    let row: ResearchRow | undefined;

    try {
      [row] = await this.database
        .insert(researches)
        .values({
          applicationId: command.applicationId,
          status: 'RUNNING',
          researchDate: command.researchDate,
          startedAt: command.startedAt,
          promptVersion: command.promptVersion ?? null,
        })
        .returning();
    } catch (error) {
      if (isRunningConflict(error)) {
        throw new ResearchRunningConflictError();
      }
      throw error;
    }

    if (row === undefined) {
      throw new ResearchPersistenceInvariantError(
        'Research insert did not return a row.',
      );
    }

    return mapResearch(row);
  }

  async markFailed(
    id: string,
    command: FailResearchCommand,
  ): Promise<Research | null> {
    const [row] = await this.database
      .update(researches)
      .set({
        status: 'FAILED',
        summaryMarkdown: null,
        warnings: [],
        failureCode: command.failureCode,
        failureMessage: command.failureMessage,
        completedAt: null,
        failedAt: command.failedAt,
        updatedAt: sql`transaction_timestamp()`,
      })
      .where(and(eq(researches.id, id), eq(researches.status, 'RUNNING')))
      .returning();

    return row === undefined ? null : mapResearch(row);
  }

  async persistCompletedGraph(
    id: string,
    command: CompleteResearchGraphCommand,
  ): Promise<ResearchAggregate | null> {
    const graph = buildGraphRows(id, command);

    return this.database.transaction(async (transaction) => {
      const [running] = await transaction
        .select({ id: researches.id })
        .from(researches)
        .where(and(eq(researches.id, id), eq(researches.status, 'RUNNING')))
        .limit(1)
        .for('update');

      if (running === undefined) {
        return null;
      }

      if (graph.sourceRows.length > 0) {
        await transaction.insert(researchSources).values(graph.sourceRows);
      }
      if (graph.claimRows.length > 0) {
        await transaction.insert(researchClaims).values(graph.claimRows);
      }
      if (graph.relationshipRows.length > 0) {
        await transaction
          .insert(researchClaimSources)
          .values(graph.relationshipRows);
      }

      const [completed] = await transaction
        .update(researches)
        .set({
          status: 'COMPLETED',
          summaryMarkdown: command.summaryMarkdown,
          warnings: [...command.warnings],
          promptVersion: command.promptVersion,
          failureCode: null,
          failureMessage: null,
          completedAt: command.completedAt,
          failedAt: null,
          updatedAt: sql`transaction_timestamp()`,
        })
        .where(and(eq(researches.id, id), eq(researches.status, 'RUNNING')))
        .returning({ id: researches.id });

      if (completed === undefined) {
        throw new ResearchPersistenceInvariantError(
          'Research completion transition did not return a row.',
        );
      }

      const aggregate = await this.findByIdFrom(transaction, id);
      if (aggregate === null) {
        throw new ResearchPersistenceInvariantError(
          'Completed Research aggregate could not be loaded.',
        );
      }

      return aggregate;
    });
  }

  async findById(id: string): Promise<ResearchAggregate | null> {
    return this.findByIdFrom(this.database, id);
  }

  async findRunningByApplicationId(
    applicationId: string,
  ): Promise<Research | null> {
    const [row] = await this.database
      .select()
      .from(researches)
      .where(
        and(
          eq(researches.applicationId, applicationId),
          eq(researches.status, 'RUNNING'),
        ),
      )
      .limit(1);

    return row === undefined ? null : mapResearch(row);
  }

  async findLatestByApplicationId(
    applicationId: string,
  ): Promise<Research | null> {
    const [row] = await this.database
      .select()
      .from(researches)
      .where(eq(researches.applicationId, applicationId))
      .orderBy(desc(researches.createdAt), desc(researches.id))
      .limit(1);

    return row === undefined ? null : mapResearch(row);
  }

  async findLatestCompletedByApplicationId(
    applicationId: string,
  ): Promise<Research | null> {
    const [row] = await this.database
      .select()
      .from(researches)
      .where(
        and(
          eq(researches.applicationId, applicationId),
          eq(researches.status, 'COMPLETED'),
        ),
      )
      .orderBy(desc(researches.createdAt), desc(researches.id))
      .limit(1);

    return row === undefined ? null : mapResearch(row);
  }

  async listByApplicationId(applicationId: string): Promise<Research[]> {
    const rows = await this.database
      .select()
      .from(researches)
      .where(eq(researches.applicationId, applicationId))
      .orderBy(desc(researches.createdAt), desc(researches.id));

    return rows.map(mapResearch);
  }

  private async findByIdFrom(
    executor: ResearchExecutor,
    id: string,
  ): Promise<ResearchAggregate | null> {
    const [research] = await executor
      .select()
      .from(researches)
      .where(eq(researches.id, id))
      .limit(1);

    if (research === undefined) {
      return null;
    }

    const sources = await executor
      .select()
      .from(researchSources)
      .where(eq(researchSources.researchId, id))
      .orderBy(asc(researchSources.createdAt), asc(researchSources.id));
    const claims = await executor
      .select()
      .from(researchClaims)
      .where(eq(researchClaims.researchId, id))
      .orderBy(asc(researchClaims.createdAt), asc(researchClaims.id));
    const relationships = await executor
      .select()
      .from(researchClaimSources)
      .where(eq(researchClaimSources.researchId, id))
      .orderBy(
        asc(researchClaimSources.claimId),
        asc(researchClaimSources.sourceId),
      );

    return {
      ...mapResearch(research),
      sources: sources.map(mapResearchSource),
      claims: claims.map(mapResearchClaim),
      relationships: relationships.map(mapResearchClaimSource),
    };
  }
}
