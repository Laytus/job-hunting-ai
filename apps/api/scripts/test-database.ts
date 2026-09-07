import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { getTestDatabaseTarget } from './test-database-url.js';

const command = process.argv[2];
const target = getTestDatabaseTarget();

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function provision(): Promise<void> {
  const maintenanceClient = postgres(target.maintenanceUrl, { max: 1 });

  try {
    const existing = await maintenanceClient<{ exists: number }[]>`
      select 1 as exists
      from pg_database
      where datname = ${target.databaseName}
    `;

    if (existing.length === 0) {
      await maintenanceClient.unsafe(`create database ${quoteIdentifier(target.databaseName)}`);
      console.info(`Created test database ${target.databaseName}.`);
    } else {
      console.info(`Test database ${target.databaseName} already exists.`);
    }
  } catch (error) {
    throw new Error(
      `Unable to provision test database ${target.databaseName}. Create it explicitly with the DATABASE_TEST_URL role or through the repository Docker PostgreSQL administrator, then retry.`,
      { cause: error },
    );
  } finally {
    await maintenanceClient.end();
  }
}

async function applyMigrations(): Promise<void> {
  const client = postgres(target.url, { max: 1, onnotice: () => undefined });

  try {
    const database = drizzle(client);
    const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
    await migrate(database, { migrationsFolder });
    console.info(`Applied migrations to test database ${target.databaseName}.`);
  } finally {
    await client.end();
  }
}

switch (command) {
  case 'provision':
    await provision();
    break;
  case 'migrate':
    await applyMigrations();
    break;
  default:
    throw new Error('Expected command: provision or migrate.');
}
