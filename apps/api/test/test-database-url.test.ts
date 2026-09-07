import { describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../scripts/test-database-url.js';

describe('test database URL guard', () => {
  it('requires DATABASE_TEST_URL instead of falling back to DATABASE_URL', () => {
    expect(() =>
      getTestDatabaseTarget({
        DATABASE_URL: 'postgresql://user:password@localhost:5432/development',
      }),
    ).toThrow(/DATABASE_TEST_URL is required/);
  });

  it('rejects the development database even when credentials differ', () => {
    expect(() =>
      getTestDatabaseTarget({
        DATABASE_URL: 'postgresql://development:password@localhost:5432/job_hunting_ai',
        DATABASE_TEST_URL: 'postgresql://test:password@localhost:5432/job_hunting_ai',
      }),
    ).toThrow(/must not target the same database/);
  });

  it('rejects PostgreSQL maintenance databases', () => {
    expect(() =>
      getTestDatabaseTarget({
        DATABASE_TEST_URL: 'postgresql://user:password@localhost:5432/postgres',
      }),
    ).toThrow(/maintenance database/);
  });

  it('derives provisioning access from the test URL', () => {
    const target = getTestDatabaseTarget({
      DATABASE_URL: 'postgresql://dev:dev@localhost:5432/job_hunting_ai',
      DATABASE_TEST_URL:
        'postgresql://test:test@database.example:5544/job_hunting_ai_test?sslmode=require',
    });

    expect(target.databaseName).toBe('job_hunting_ai_test');
    expect(target.url).toContain('database.example:5544/job_hunting_ai_test');
    expect(target.maintenanceUrl).toContain('database.example:5544/postgres');
    expect(target.maintenanceUrl).toContain('sslmode=require');
  });
});
