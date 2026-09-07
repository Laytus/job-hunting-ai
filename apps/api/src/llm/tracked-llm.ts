import type { AiUsageGuard } from './ai-usage-guard.js';
import type { AiUsageRecorder } from './ai-usage-recorder.js';
import type { LlmProvider } from './llm-provider.js';
import type { LlmRequest, LlmResponse } from './llm.types.js';

export interface LlmExecutionOptions {
  readonly operationName: string;
  readonly request: LlmRequest;
}

export interface LlmExecutor {
  execute(options: LlmExecutionOptions): Promise<LlmResponse>;
}

export class TrackedLlmExecutor implements LlmExecutor {
  constructor(
    private readonly provider: LlmProvider,
    private readonly guard: AiUsageGuard,
    private readonly recorder: AiUsageRecorder,
  ) {}

  async execute(options: LlmExecutionOptions): Promise<LlmResponse> {
    await this.guard.assertAllowed(options.operationName);
    const response = await this.provider.generate(options.request);
    await this.recorder.record({
      operationName: options.operationName,
      request: options.request,
      response,
    });
    return response;
  }
}
