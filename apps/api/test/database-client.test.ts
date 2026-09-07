import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase } from '../src/db/client.js';

const originalDatabaseUrl = process.env['DATABASE_URL'];

afterEach(async () => {
  await closeDatabase();

  if (originalDatabaseUrl === undefined) {
    delete process.env['DATABASE_URL'];
  } else {
    process.env['DATABASE_URL'] = originalDatabaseUrl;
  }
});

describe('database client', () => {
  it('requires DATABASE_URL only when a connection is requested', () => {
    delete process.env['DATABASE_URL'];

    expect(() => getDatabase()).toThrowError(
      'DATABASE_URL is required to connect to PostgreSQL.',
    );
  });
});
