import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/db/schema.js';
import {
  DevelopmentSeedConflictError,
  DevelopmentSeedSafetyError,
  getDevelopmentSeedDatabaseUrl,
  seedDevelopmentDatabase,
} from '../src/seed/development-seed.js';

async function main(): Promise<void> {
  const databaseUrl = getDevelopmentSeedDatabaseUrl();
  const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });

  try {
    const summary = await seedDevelopmentDatabase(drizzle(client, { schema }));
    console.info('Development seed completed.');
    console.info(
      `Seeded 1 Candidate Profile, ${summary.applications} Applications, ${summary.jobDescriptions} Job Descriptions, ${summary.interviews} Interviews, and ${summary.applicationEvents} Application Events.`,
    );
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (error) {
  if (
    error instanceof DevelopmentSeedSafetyError ||
    error instanceof DevelopmentSeedConflictError
  ) {
    console.error(error.message);
  } else {
    console.error('Development seed failed. Verify migrations and database availability.');
  }
  process.exitCode = 1;
}
