import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { applicationEvents, applications } from '../db/schema.js';
import type { ApplicationEvent } from './application-event.types.js';

type ApplicationEventRow = typeof applicationEvents.$inferSelect;

function mapApplicationEvent(row: ApplicationEventRow): ApplicationEvent {
  return {
    id: row.id,
    applicationId: row.applicationId,
    type: row.type,
    title: row.title,
    description: row.description,
    metadata: row.metadata,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

export class ApplicationEventRepository {
  constructor(private readonly database: Database) {}

  async applicationExists(applicationId: string): Promise<boolean> {
    const [row] = await this.database
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    return row !== undefined;
  }

  async findAllByApplicationId(applicationId: string): Promise<ApplicationEvent[]> {
    const rows = await this.database
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId))
      .orderBy(
        sql`${applicationEvents.occurredAt} DESC`,
        sql`${applicationEvents.createdAt} DESC`,
        sql`${applicationEvents.id} DESC`,
      );

    return rows.map(mapApplicationEvent);
  }
}
