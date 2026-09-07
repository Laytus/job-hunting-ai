import { AiUsageError } from './ai-usage.errors.js';
import type { AiUsageGuardState } from './ai-usage.types.js';

export interface AiUsageReader {
  getUsageForGuard(operationName: string): Promise<AiUsageGuardState>;
}

export interface AiUsageGuardPolicy {
  readonly maxRecordedCallsPerOperation?: number;
}

export class AiUsageGuard {
  private readonly maxRecordedCallsPerOperation: number | undefined;

  constructor(
    private readonly reader: AiUsageReader,
    policy: AiUsageGuardPolicy = {},
  ) {
    const maximum = policy.maxRecordedCallsPerOperation;
    if (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < 0)) {
      throw new RangeError('AI usage call limit must be a non-negative integer.');
    }
    this.maxRecordedCallsPerOperation = maximum;
  }

  async assertAllowed(operationName: string): Promise<void> {
    if (operationName.trim() === '') {
      throw new AiUsageError('USAGE_CHECK_FAILED');
    }

    let state: AiUsageGuardState;
    try {
      state = await this.reader.getUsageForGuard(operationName);
    } catch {
      throw new AiUsageError('USAGE_CHECK_FAILED');
    }

    if (!Number.isSafeInteger(state.recordedCalls) || state.recordedCalls < 0) {
      throw new AiUsageError('USAGE_CHECK_FAILED');
    }

    if (
      this.maxRecordedCallsPerOperation !== undefined &&
      state.recordedCalls >= this.maxRecordedCallsPerOperation
    ) {
      throw new AiUsageError('USAGE_NOT_ALLOWED');
    }
  }
}
