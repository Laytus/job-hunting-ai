import { sql, type SQL } from 'drizzle-orm';

/**
 * First eight bytes of SHA-256("job-hunting-ai:candidate-aggregate:v1"),
 * interpreted as a signed 64-bit integer. The key is stable across processes.
 */
export const CANDIDATE_AGGREGATE_ADVISORY_LOCK_KEY = -396239774382617860n;

/**
 * Must be executed inside the transaction that writes the Candidate aggregate.
 * PostgreSQL releases this transaction-scoped lock automatically at transaction end.
 */
export function candidateAggregateAdvisoryLockQuery(): SQL {
  return sql`select pg_advisory_xact_lock(${CANDIDATE_AGGREGATE_ADVISORY_LOCK_KEY})`;
}
