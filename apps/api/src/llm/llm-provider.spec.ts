import { describe, expect, it } from 'vitest';
import { LlmProviderError } from './llm.errors.js';
import type { LlmProvider } from './llm-provider.js';
import type { LlmRequest, LlmResponse } from './llm.types.js';

class TestLlmProvider implements LlmProvider {
  request: LlmRequest | null = null;

  constructor(private readonly response: LlmResponse) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.request = request;
    return this.response;
  }
}

describe('LlmProvider contracts', () => {
  it('accepts domain-independent messages and preserves their roles and content', async () => {
    const provider = new TestLlmProvider({ content: 'Generated response' });
    const request: LlmRequest = {
      messages: [
        { role: 'system', content: 'Follow the supplied instructions.' },
        { role: 'user', content: 'Generate a response.' },
        { role: 'assistant', content: 'Earlier response.' },
      ],
    };

    await provider.generate(request);

    expect(provider.request?.messages).toEqual(request.messages);
  });

  it('represents optional model and token usage information', async () => {
    const response: LlmResponse = {
      content: 'Generated response',
      model: 'test-model',
      usage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
      },
    };
    const provider = new TestLlmProvider(response);

    await expect(
      provider.generate({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Generate a response.' }],
      }),
    ).resolves.toEqual(response);
    expect(provider.request?.model).toBe('test-model');
  });

  it('allows providers to omit model and usage information', async () => {
    const provider = new TestLlmProvider({ content: 'Generated response' });

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Generate a response.' }],
      }),
    ).resolves.toEqual({ content: 'Generated response' });
  });

  it('optionally carries a provider-independent JSON Schema response format', async () => {
    const provider = new TestLlmProvider({ content: '{"value":"ok"}' });
    const responseFormat = {
      type: 'json_schema',
      name: 'example_result',
      schema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
      strict: true,
    } as const;

    await provider.generate({
      messages: [{ role: 'user', content: 'Return a structured response.' }],
      responseFormat,
    });

    expect(provider.request?.responseFormat).toEqual(responseFormat);
  });

  it('represents opt-in web search and generic provider source metadata', async () => {
    const response: LlmResponse = {
      content: 'Web-enabled response',
      webSources: [
        { url: 'https://example.com/first' },
        { url: 'https://example.com/second' },
      ],
    };
    const provider = new TestLlmProvider(response);

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Use the available tool.' }],
        tools: [{ type: 'web_search' }],
      }),
    ).resolves.toEqual(response);
    expect(provider.request?.tools).toEqual([{ type: 'web_search' }]);
  });

  it('represents and propagates provider failures', async () => {
    const error = new LlmProviderError('Provider execution failed.');
    const provider: LlmProvider = {
      generate: () => Promise.reject(error),
    };

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Generate a response.' }],
      }),
    ).rejects.toBe(error);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('LlmProviderError');
    expect(error.message).toBe('Provider execution failed.');
  });
});
