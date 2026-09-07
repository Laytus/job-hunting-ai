import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

let client: Sql | undefined;
let database: Database | undefined;

export function getDatabase(): Database {
  if (database) {
    return database;
  }

  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to connect to PostgreSQL.');
  }

  client = postgres(databaseUrl);
  database = drizzle(client, { schema });

  return database;
}

export async function closeDatabase(): Promise<void> {
  if (!client) {
    return;
  }

  await client.end();
  client = undefined;
  database = undefined;
}
