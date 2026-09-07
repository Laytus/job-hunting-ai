import { desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { applicationEvents, applications } from '../db/schema.js';
import type { ApplicationEventDraft } from '../application-event/application-event.types.js';
import type { Application, ApplicationWriteCommand } from './application.types.js';

type ApplicationRow = typeof applications.$inferSelect;

function mapApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    companyName: row.companyName,
    roleTitle: row.roleTitle,
    location: row.location,
    jobUrl: row.jobUrl,
    source: row.source,
    status: row.status,
    priority: row.priority,
    dateFound: row.dateFound,
    dateApplied: row.dateApplied,
    notesMarkdown: row.notesMarkdown,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ApplicationRepository {
  constructor(private readonly database: Database) {}

  async findAll(): Promise<Application[]> {
    const rows = await this.database
      .select()
      .from(applications)
      .orderBy(
        desc(applications.priority),
        desc(applications.updatedAt),
        desc(applications.createdAt),
      );

    return rows.map(mapApplication);
  }

  async findById(id: string): Promise<Application | null> {
    const [row] = await this.database
      .select()
      .from(applications)
      .where(eq(applications.id, id))
      .limit(1);

    return row === undefined ? null : mapApplication(row);
  }

  async create(
    command: ApplicationWriteCommand,
    event?: ApplicationEventDraft,
  ): Promise<Application> {
    return this.database.transaction(async (transaction) => {
      const [row] = await transaction
        .insert(applications)
        .values(command)
        .returning();

      if (row === undefined) {
        throw new Error('Application insert did not return a row.');
      }

      if (event !== undefined) {
        await transaction.insert(applicationEvents).values({
          applicationId: row.id,
          ...event,
        });
      }

      return mapApplication(row);
    });
  }

  async replace(
    id: string,
    command: ApplicationWriteCommand,
    createEvents: (
      current: Application,
    ) => readonly ApplicationEventDraft[] = () => [],
  ): Promise<Application | null> {
    return this.database.transaction(async (transaction) => {
      const [currentRow] = await transaction
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .limit(1)
        .for('update');

      if (currentRow === undefined) {
        return null;
      }

      const events = createEvents(mapApplication(currentRow));
      const [row] = await transaction
        .update(applications)
        .set({
          ...command,
          updatedAt: sql`transaction_timestamp()`,
        })
        .where(eq(applications.id, id))
        .returning();

      if (row === undefined) {
        throw new Error('Application replacement did not return a row.');
      }

      if (events.length > 0) {
        await transaction.insert(applicationEvents).values(
          events.map((event) => ({
            applicationId: id,
            ...event,
          })),
        );
      }

      return mapApplication(row);
    });
  }
}
