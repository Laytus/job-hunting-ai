import { describe, expect, it } from 'vitest';
import { AiUsageError } from './ai-usage.errors.js';
import { AiUsageRecorder, type AiUsageWriter } from './ai-usage-recorder.js';
import type { AiUsage, CreateAiUsageCommand } from './ai-usage.types.js';

function usageRecord(command: CreateAiUsageCommand): AiUsage {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    ...command,
    createdAt: new Date('2026-08-25T12:00:00.000Z'),
  };
}

class FakeUsageWriter implements AiUsageWriter {
  readonly commands: CreateAiUsageCommand[] = [];
  error: Error | null = null;

  async recordUsage(command: CreateAiUsageCommand): Promise<AiUsage> {
    this.commands.push(command);
    if (this.error !== null) {
      throw this.error;
    }
    return usageRecord(command);
  }
}

describe('AiUsageRecorder', () => {
  it('persists complete provider-reported usage and response model metadata', async () => {
    const writer = new FakeUsageWriter();
    const recorder = new AiUsageRecorder(writer);

    const result = await recorder.record({
      operationName: 'TEST_STRUCTURED_OUTPUT',
      request: {
        model: 'requested-model',
        messages: [{ role: 'user', content: 'Return a generic result.' }],
      },
      response: {
        content: '{}',
        model: 'provider-model',
        usage: { inputTokens: 11, outputTokens: 7, totalTokens: 21 },
      },
    });

    expect(writer.commands).toEqual([
      {
        operationName: 'TEST_STRUCTURED_OUTPUT',
        model: 'provider-model',
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 21,
      },
    ]);
    expect(result).toEqual(usageRecord(writer.commands[0]!));
  });

  it('uses the requested model when the generic response omits model metadata', async () => {
    const writer = new FakeUsageWriter();
    const recorder = new AiUsageRecorder(writer);

    await recorder.record({
      operationName: 'TEST_TEXT',
      request: {
        model: 'requested-model',
        messages: [{ role: 'user', content: 'Hello.' }],
      },
      response: {
        content: 'Hello.',
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      },
    });

    expect(writer.commands[0]?.model).toBe('requested-model');
  });

  it.each([
    { content: '{}', model: 'model' },
    {
      content: '{}',
      model: 'model',
      usage: { inputTokens: 1, outputTokens: 1 },
    },
    {
      content: '{}',
      model: 'model',
      usage: { inputTokens: -1, outputTokens: 1, totalTokens: 0 },
    },
  ])('rejects incomplete or unusable usage metadata', async (response) => {
    const writer = new FakeUsageWriter();
    const recorder = new AiUsageRecorder(writer);

    await expect(
      recorder.record({
        operationName: 'TEST_TEXT',
        request: { messages: [{ role: 'user', content: 'Hello.' }] },
        response,
      }),
    ).rejects.toEqual(new AiUsageError('USAGE_METADATA_UNAVAILABLE'));
    expect(writer.commands).toEqual([]);
  });

  it('normalizes persistence failures without exposing database details', async () => {
    const writer = new FakeUsageWriter();
    writer.error = new Error('constraint ai_usage_secret failed');
    const recorder = new AiUsageRecorder(writer);

    await expect(
      recorder.record({
        operationName: 'TEST_TEXT',
        request: { messages: [{ role: 'user', content: 'Hello.' }] },
        response: {
          content: 'Hello.',
          model: 'model',
          usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
        },
      }),
    ).rejects.toEqual(new AiUsageError('USAGE_RECORDING_FAILED'));
  });
});
