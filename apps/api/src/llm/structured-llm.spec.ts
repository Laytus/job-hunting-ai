import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AiUsageGuard } from './ai-usage-guard.js';
import { AiUsageRecorder } from './ai-usage-recorder.js';
import type { CreateAiUsageCommand } from './ai-usage.types.js';
import { FakeLlmProvider } from './fake-llm-provider.js';
import { LlmProviderError } from './llm.errors.js';
import {
  generateStructured,
  StructuredLlmError,
} from './structured-llm.js';
import { TrackedLlmExecutor } from './tracked-llm.js';

const jsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    score: { type: 'number' },
  },
  required: ['title', 'score'],
  additionalProperties: false,
} as const;

const runtimeSchema = z.strictObject({
  title: z.string(),
  score: z.number(),
});

const structuredOptions = {
  operationName: 'TEST_STRUCTURED_OUTPUT',
  request: {
    messages: [{ role: 'user', content: 'Return a generic result.' }],
  },
  responseFormat: {
    type: 'json_schema',
    name: 'example_result',
    schema: jsonSchema,
    strict: true,
  },
  runtimeSchema,
} as const;

function createExecutor(provider: FakeLlmProvider) {
  const records: CreateAiUsageCommand[] = [];
  const executor = new TrackedLlmExecutor(
    provider,
    new AiUsageGuard({
      getUsageForGuard: async () => ({ recordedCalls: records.length }),
    }),
    new AiUsageRecorder({
      recordUsage: async (command) => {
        records.push(command);
        return {
          id: '00000000-0000-4000-8000-000000000001',
          ...command,
          createdAt: new Date('2026-08-25T12:00:00.000Z'),
        };
      },
    }),
  );
  return { executor, records };
}

describe('generateStructured', () => {
  it('returns runtime-validated data and preserves generic response metadata', async () => {
    const response = {
      content: '{"title":"Example","score":0.9}',
      model: 'fake-model',
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
      },
      webSources: [
        { url: 'https://example.com/first' },
        { url: 'https://example.com/second' },
      ],
    };
    const provider = new FakeLlmProvider(response);
    const { executor, records } = createExecutor(provider);

    const result = await generateStructured(executor, structuredOptions);

    expect(result).toEqual({
      data: { title: 'Example', score: 0.9 },
      response,
    });
    expect(provider.requests[0]).toEqual({
      ...structuredOptions.request,
      responseFormat: structuredOptions.responseFormat,
    });
    expect(records).toEqual([
      {
        operationName: 'TEST_STRUCTURED_OUTPUT',
        model: 'fake-model',
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
      },
    ]);
  });

  it('distinguishes malformed JSON from schema validation failures', async () => {
    const provider = new FakeLlmProvider({
      content: '{ invalid json',
      model: 'fake-model',
      usage: { inputTokens: 6, outputTokens: 3, totalTokens: 9 },
    });
    const { executor, records } = createExecutor(provider);

    await expect(
      generateStructured(executor, structuredOptions),
    ).rejects.toMatchObject({
      name: 'StructuredLlmError',
      code: 'INVALID_JSON',
      message: 'The LLM response was not valid JSON.',
    });
    expect(records).toHaveLength(1);
  });

  it('rejects parsed JSON that fails runtime validation', async () => {
    const provider = new FakeLlmProvider({
      content: '{"title":123,"score":"wrong"}',
      model: 'fake-model',
      usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
    });
    const { executor, records } = createExecutor(provider);

    await expect(
      generateStructured(executor, structuredOptions),
    ).rejects.toEqual(new StructuredLlmError('SCHEMA_VALIDATION_FAILED'));
    expect(records).toHaveLength(1);
  });

  it('propagates provider failures without reclassifying them', async () => {
    const provider = new FakeLlmProvider({ content: 'unused' });
    const providerError = new LlmProviderError('Provider execution failed.');
    provider.setError(providerError);
    const { executor, records } = createExecutor(provider);

    await expect(
      generateStructured(executor, structuredOptions),
    ).rejects.toBe(providerError);
    expect(records).toEqual([]);
  });
});
