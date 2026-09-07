import { describe, expect, it } from 'vitest';
import { FakeLlmProvider } from './fake-llm-provider.js';
import { LlmProviderError } from './llm.errors.js';
import type { LlmProvider } from './llm-provider.js';
import type { LlmRequest, LlmResponse } from './llm.types.js';

async function executeWithProvider(
  provider: LlmProvider,
  request: LlmRequest,
): Promise<LlmResponse> {
  return provider.generate(request);
}

describe('FakeLlmProvider', () => {
  it('implements LlmProvider and returns the configured response', async () => {
    const response: LlmResponse = {
      content: 'Deterministic response',
      model: 'fake-model',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
    };
    const provider: LlmProvider = new FakeLlmProvider(response);

    await expect(
      executeWithProvider(provider, {
        messages: [{ role: 'user', content: 'Generate a response.' }],
      }),
    ).resolves.toEqual(response);
  });

  it('records requests in execution order and preserves message content', async () => {
    const provider = new FakeLlmProvider({ content: 'Recorded' });
    const firstRequest: LlmRequest = {
      messages: [
        { role: 'system', content: 'Follow the instructions.' },
        { role: 'user', content: 'First request.' },
      ],
    };
    const secondRequest: LlmRequest = {
      model: 'fake-model',
      messages: [{ role: 'user', content: 'Second request.' }],
    };

    await provider.generate(firstRequest);
    await provider.generate(secondRequest);

    expect(provider.requests).toEqual([firstRequest, secondRequest]);
  });

  it('records a structured request unchanged without enforcing its schema', async () => {
    const response = { content: '{"value":123}' };
    const provider = new FakeLlmProvider(response);
    const request: LlmRequest = {
      messages: [{ role: 'user', content: 'Return structured data.' }],
      responseFormat: {
        type: 'json_schema',
        name: 'example_result',
        schema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
          additionalProperties: false,
        },
        strict: true,
      },
    };

    await expect(provider.generate(request)).resolves.toBe(response);
    expect(provider.requests).toEqual([request]);
  });

  it('records web-search requests and returns configured web sources unchanged', async () => {
    const response: LlmResponse = {
      content: '{"value":"result"}',
      webSources: [{ url: 'https://example.com/source' }],
    };
    const provider = new FakeLlmProvider(response);
    const request: LlmRequest = {
      messages: [{ role: 'user', content: 'Return a sourced result.' }],
      tools: [{ type: 'web_search' }],
      responseFormat: {
        type: 'json_schema',
        name: 'sourced_result',
        schema: {
          type: 'object',
          properties: { value: { type: 'string' } },
          required: ['value'],
          additionalProperties: false,
        },
        strict: true,
      },
    };

    await expect(provider.generate(request)).resolves.toBe(response);
    expect(provider.requests).toEqual([request]);
  });

  it('uses a newly configured response for subsequent requests', async () => {
    const provider = new FakeLlmProvider({ content: 'Initial response' });
    const request: LlmRequest = {
      messages: [{ role: 'user', content: 'Generate a response.' }],
    };

    await expect(provider.generate(request)).resolves.toEqual({
      content: 'Initial response',
    });

    provider.setResponse({ content: 'Updated response' });

    await expect(provider.generate(request)).resolves.toEqual({
      content: 'Updated response',
    });
  });

  it('records and deterministically propagates a configured provider error', async () => {
    const provider = new FakeLlmProvider({ content: 'Unused response' });
    const error = new LlmProviderError('Simulated provider failure.');
    const request: LlmRequest = {
      messages: [{ role: 'user', content: 'Generate a response.' }],
    };
    provider.setError(error);

    await expect(provider.generate(request)).rejects.toBe(error);
    await expect(provider.generate(request)).rejects.toBe(error);
    expect(provider.requests).toEqual([request, request]);
  });

  it('resumes configured responses after the simulated error is cleared', async () => {
    const provider = new FakeLlmProvider({ content: 'Recovered response' });
    const request: LlmRequest = {
      messages: [{ role: 'user', content: 'Generate a response.' }],
    };
    provider.setError(new LlmProviderError('Temporary simulated failure.'));
    await expect(provider.generate(request)).rejects.toBeInstanceOf(
      LlmProviderError,
    );

    provider.setError(null);

    await expect(provider.generate(request)).resolves.toEqual({
      content: 'Recovered response',
    });
  });
});
