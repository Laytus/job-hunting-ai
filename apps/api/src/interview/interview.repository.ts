import { and, eq, sql } from 'drizzle-orm';
import type { ApplicationEventDraft } from '../application-event/application-event.types.js';
import type { Database } from '../db/client.js';
import { applicationEvents, applications, interviews } from '../db/schema.js';
import type { Interview, InterviewWriteCommand } from './interview.types.js';

type InterviewRow = typeof interviews.$inferSelect;

function mapInterview(row: InterviewRow): Interview {
  return {
    id: row.id,
    applicationId: row.applicationId,
    type: row.type,
    status: row.status,
    scheduledAt: row.scheduledAt,
    completedAt: row.completedAt,
    notesMarkdown: row.notesMarkdown,
    feedbackMarkdown: row.feedbackMarkdown,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class InterviewRepository {
  constructor(private readonly database: Database) {}

  async applicationExists(applicationId: string): Promise<boolean> {
    const [row] = await this.database
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    return row !== undefined;
  }

  async findAllByApplicationId(applicationId: string): Promise<Interview[]> {
    const rows = await this.database
      .select()
      .from(interviews)
      .where(eq(interviews.applicationId, applicationId))
      .orderBy(
        interviews.sortOrder,
        sql`${interviews.scheduledAt} ASC NULLS LAST`,
        interviews.createdAt,
        interviews.id,
      );

    return rows.map(mapInterview);
  }

  async createForApplication(
    applicationId: string,
    command: InterviewWriteCommand,
    event?: ApplicationEventDraft,
  ): Promise<Interview | null> {
    return this.database.transaction(async (transaction) => {
      const [application] = await transaction
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1)
        .for('key share');

      if (application === undefined) {
        return null;
      }

      const [row] = await transaction
        .insert(interviews)
        .values({ applicationId, ...command })
        .returning();

      if (row === undefined) {
        throw new Error('Interview insert did not return a row.');
      }

      if (event !== undefined) {
        await transaction.insert(applicationEvents).values({
          applicationId,
          ...event,
        });
      }

      return mapInterview(row);
    });
  }

  async replaceForApplication(
    applicationId: string,
    interviewId: string,
    command: InterviewWriteCommand,
    event?: ApplicationEventDraft,
  ): Promise<Interview | null> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .update(interviews)
        .set({ ...command, updatedAt: sql`transaction_timestamp()` })
        .where(
          and(
            eq(interviews.id, interviewId),
            eq(interviews.applicationId, applicationId),
          ),
        )
        .returning();

      if (row === undefined) {
        return null;
      }

      if (event !== undefined) {
        await transaction.insert(applicationEvents).values({
          applicationId,
          ...event,
        });
      }

      return mapInterview(row);
    });
  }
}
