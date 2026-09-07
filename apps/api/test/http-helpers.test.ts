import { describe, expect, it } from 'vitest';
import {
  findPostgreSqlError,
  isPostgreSqlConstraintError,
} from '../src/http/errors.js';
import { formatServerCalendarDate } from '../src/http/server-date.js';

describe('HTTP helpers', () => {
  it('formats a server-local calendar date deterministically', () => {
    expect(formatServerCalendarDate(new Date(2026, 7, 19, 23, 59))).toBe(
      '2026-08-19',
    );
  });

  it('finds only PostgreSQL-shaped errors in a cause chain', () => {
    const postgresError = {
      code: '23505',
      constraint_name: 'test_unique_constraint',
    };
    const wrapped = { cause: { cause: postgresError } };

    expect(findPostgreSqlError(wrapped)).toBe(postgresError);
    expect(
      isPostgreSqlConstraintError(
        wrapped,
        '23505',
        'test_unique_constraint',
      ),
    ).toBe(true);
    expect(isPostgreSqlConstraintError(new Error('secret'), '23505', 'x')).toBe(
      false,
    );
  });
});
