import { describe, expect, it } from 'vitest';
import { AiUsageError } from './ai-usage.errors.js';
import { AiUsageGuard, type AiUsageReader } from './ai-usage-guard.js';
import { AiUsageRecorder, type AiUsageWriter } from './ai-usage-recorder.js';
import type {
  AiUsage,
  AiUsageGuardState,
  CreateAiUsageCommand,
} from './ai-usage.types.js';
import { FakeLlmProvider } from './fake-llm-provider.js';
import { LlmProviderError } from './llm.errors.js';
import type { LlmProvider } from './llm-provider.js';
import type { LlmRequest, LlmResponse } from './llm.types.js';
import { TrackedLlmExecutor } from './tracked-llm.js';

const request: LlmRequest = {
  model: 'fake-model',
  messages: [{ role: 'user', content: 'Return a generic result.' }],
};

const response: LlmResponse = {
  content: 'Generic result.',
  model: 'fake-model',
  usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
};

function createUsage(command: CreateAiUsageCommand): AiUsage {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    ...command,
    createdAt: new Date('2026-08-25T12:00:00.000Z'),
  };
}

describe('TrackedLlmExecutor', () => {
  it('executes in guard, provider, recorder order', async () => {
    const calls: string[] = [];
    const reader: AiUsageReader = {
      getUsageForGuard: async (): Promise<AiUsageGuardState> => {
        calls.push('guard');
        return { recordedCalls: 0 };
      },
    };
    const provider: LlmProvider = {
      generate: async (): Promise<LlmResponse> => {
        calls.push('provider');
        return response;
      },
    };
    const writer: AiUsageWriter = {
      recordUsage: async (command): Promise<AiUsage> => {
        calls.push('recorder');
        return createUsage(command);
      },
    };
    const executor = new TrackedLlmExecutor(
      provider,
      new AiUsageGuard(reader),
      new AiUsageRecorder(writer),
    );

    await expect(
      executor.execute({ operationName: 'TEST_OPERATION', request }),
    ).resolves.toBe(response);
    expect(calls).toEqual(['guard', 'provider', 'recorder']);
  });

  it('does not execute the provider when the guard denies usage', async () => {
    const provider = new FakeLlmProvider(response);
    const guard = new AiUsageGuard(
      { getUsageForGuard: async () => ({ recordedCalls: 1 }) },
      { maxRecordedCallsPerOperation: 1 },
    );
    const executor = new TrackedLlmExecutor(
      provider,
      guard,
      new AiUsageRecorder({
        recordUsage: (command) => Promise.resolve(createUsage(command)),
      }),
    );

    await expect(
      executor.execute({ operationName: 'TEST_OPERATION', request }),
    ).rejects.toEqual(new AiUsageError('USAGE_NOT_ALLOWED'));
    expect(provider.requests).toHaveLength(0);
  });

  it('does not execute the provider when guard verification fails', async () => {
    const provider = new FakeLlmProvider(response);
    const executor = new TrackedLlmExecutor(
      provider,
      new AiUsageGuard({
        getUsageForGuard: async () => {
          throw new Error('database unavailable');
        },
      }),
      new AiUsageRecorder({
        recordUsage: (command) => Promise.resolve(createUsage(command)),
      }),
    );

    await expect(
      executor.execute({ operationName: 'TEST_OPERATION', request }),
    ).rejects.toEqual(new AiUsageError('USAGE_CHECK_FAILED'));
    expect(provider.requests).toHaveLength(0);
  });

  it('never retries the provider when recording fails after provider success', async () => {
    const provider = new FakeLlmProvider(response);
    const executor = new TrackedLlmExecutor(
      provider,
      new AiUsageGuard({
        getUsageForGuard: async () => ({ recordedCalls: 0 }),
      }),
      new AiUsageRecorder({
        recordUsage: async () => {
          throw new Error('database unavailable');
        },
      }),
    );

    await expect(
      executor.execute({ operationName: 'TEST_OPERATION', request }),
    ).rejects.toEqual(new AiUsageError('USAGE_RECORDING_FAILED'));
    expect(provider.requests).toHaveLength(1);
  });

  it('does not record fabricated usage when the provider fails', async () => {
    const provider = new FakeLlmProvider(response);
    const providerError = new LlmProviderError('Provider execution failed.');
    provider.setError(providerError);
    const commands: CreateAiUsageCommand[] = [];
    const executor = new TrackedLlmExecutor(
      provider,
      new AiUsageGuard({
        getUsageForGuard: async () => ({ recordedCalls: 0 }),
      }),
      new AiUsageRecorder({
        recordUsage: async (command) => {
          commands.push(command);
          return createUsage(command);
        },
      }),
    );

    await expect(
      executor.execute({ operationName: 'TEST_OPERATION', request }),
    ).rejects.toBe(providerError);
    expect(provider.requests).toHaveLength(1);
    expect(commands).toEqual([]);
  });
});
