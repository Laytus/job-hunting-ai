import { eq, sql } from 'drizzle-orm';
import type { ApplicationEventDraft } from '../application-event/application-event.types.js';
import type { Database } from '../db/client.js';
import { applicationEvents, applications, jobDescriptions } from '../db/schema.js';
import type {
  JobDescription,
  JobDescriptionReplacementResult,
  JobDescriptionWriteCommand,
} from './job-description.types.js';

type JobDescriptionRow = typeof jobDescriptions.$inferSelect;

function mapJobDescription(row: JobDescriptionRow): JobDescription {
  return {
    id: row.id,
    applicationId: row.applicationId,
    title: row.title,
    companyName: row.companyName,
    descriptionMarkdown: row.descriptionMarkdown,
    requirementsMarkdown: row.requirementsMarkdown,
    responsibilitiesMarkdown: row.responsibilitiesMarkdown,
    structuredData: row.structuredData,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class JobDescriptionRepository {
  constructor(private readonly database: Database) {}

  async applicationExists(applicationId: string): Promise<boolean> {
    const [row] = await this.database
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    return row !== undefined;
  }

  async findByApplicationId(applicationId: string): Promise<JobDescription | null> {
    const [row] = await this.database
      .select()
      .from(jobDescriptions)
      .where(eq(jobDescriptions.applicationId, applicationId))
      .limit(1);

    return row === undefined ? null : mapJobDescription(row);
  }

  async replaceForApplication(
    applicationId: string,
    command: JobDescriptionWriteCommand,
    createdEvent?: ApplicationEventDraft,
    updatedEvent?: ApplicationEventDraft,
  ): Promise<JobDescriptionReplacementResult | null> {
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

      const [inserted] = await transaction
        .insert(jobDescriptions)
        .values({ applicationId, ...command })
        .onConflictDoNothing({ target: jobDescriptions.applicationId })
        .returning();

      if (inserted !== undefined) {
        if (createdEvent !== undefined) {
          await transaction.insert(applicationEvents).values({
            applicationId,
            ...createdEvent,
          });
        }

        return { created: true, jobDescription: mapJobDescription(inserted) };
      }

      const [updated] = await transaction
        .update(jobDescriptions)
        .set({
          ...command,
          updatedAt: sql`transaction_timestamp()`,
        })
        .where(eq(jobDescriptions.applicationId, applicationId))
        .returning();

      if (updated === undefined) {
        throw new Error('Job Description replacement did not return a row.');
      }

      if (updatedEvent !== undefined) {
        await transaction.insert(applicationEvents).values({
          applicationId,
          ...updatedEvent,
        });
      }

      return { created: false, jobDescription: mapJobDescription(updated) };
    });
  }
}
