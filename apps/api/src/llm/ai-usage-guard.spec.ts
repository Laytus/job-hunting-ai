import { describe, expect, it } from 'vitest';
import { AiUsageError } from './ai-usage.errors.js';
import { AiUsageGuard, type AiUsageReader } from './ai-usage-guard.js';
import type { AiUsageGuardState } from './ai-usage.types.js';

class FakeUsageReader implements AiUsageReader {
  calls = 0;
  error: Error | null = null;

  constructor(readonly state: AiUsageGuardState) {}

  async getUsageForGuard(): Promise<AiUsageGuardState> {
    this.calls += 1;
    if (this.error !== null) {
      throw this.error;
    }
    return this.state;
  }
}

describe('AiUsageGuard', () => {
  it('allows execution after usage state is verified', async () => {
    const reader = new FakeUsageReader({ recordedCalls: 2 });
    const guard = new AiUsageGuard(reader, { maxRecordedCallsPerOperation: 3 });

    await expect(guard.assertAllowed('TEST_OPERATION')).resolves.toBeUndefined();
    expect(reader.calls).toBe(1);
  });

  it('denies execution when the configured call ceiling is reached', async () => {
    const reader = new FakeUsageReader({ recordedCalls: 3 });
    const guard = new AiUsageGuard(reader, { maxRecordedCallsPerOperation: 3 });

    await expect(guard.assertAllowed('TEST_OPERATION')).rejects.toEqual(
      new AiUsageError('USAGE_NOT_ALLOWED'),
    );
  });

  it('fails closed when usage state cannot be read', async () => {
    const reader = new FakeUsageReader({ recordedCalls: 0 });
    reader.error = new Error('database unavailable');
    const guard = new AiUsageGuard(reader);

    await expect(guard.assertAllowed('TEST_OPERATION')).rejects.toEqual(
      new AiUsageError('USAGE_CHECK_FAILED'),
    );
  });

  it('fails closed when persisted usage state is unusable', async () => {
    const guard = new AiUsageGuard(
      new FakeUsageReader({ recordedCalls: Number.NaN }),
    );

    await expect(guard.assertAllowed('TEST_OPERATION')).rejects.toEqual(
      new AiUsageError('USAGE_CHECK_FAILED'),
    );
  });
});
