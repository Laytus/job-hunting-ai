import {
  APIConnectionTimeoutError,
  AuthenticationError,
} from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { LlmProviderError } from './llm.errors.js';
import type { LlmProvider } from './llm-provider.js';
import {
  OpenAiLlmProvider,
  type OpenAiResponsesClient,
} from './openai-llm-provider.js';

const config = {
  defaultModel: 'configured-model',
  timeoutMs: 5_000,
  maxTokens: 256,
} as const;

function createClient(
  implementation: OpenAiResponsesClient['create'],
): OpenAiResponsesClient {
  return { create: vi.fn(implementation) };
}

describe('OpenAiLlmProvider', () => {
  it('implements LlmProvider and maps ordered messages and configuration', async () => {
    const client = createClient(async () => ({
      output_text: 'Generic response',
      model: 'configured-model',
    }));
    const provider: LlmProvider = new OpenAiLlmProvider(config, client);

    await provider.generate({
      messages: [
        { role: 'system', content: 'Follow these generic instructions.' },
        { role: 'user', content: 'Provide a short response.' },
        { role: 'assistant', content: 'Earlier generic response.' },
      ],
    });

    expect(client.create).toHaveBeenCalledWith(
      {
        model: 'configured-model',
        input: [
          { role: 'system', content: 'Follow these generic instructions.' },
          { role: 'user', content: 'Provide a short response.' },
          { role: 'assistant', content: 'Earlier generic response.' },
        ],
        max_output_tokens: 256,
      },
      { timeout: 5_000, maxRetries: 0 },
    );
  });

  it('prefers the request model and omits an unconfigured token limit', async () => {
    const client = createClient(async () => ({
      output_text: 'Generic response',
      model: 'request-model',
    }));
    const provider = new OpenAiLlmProvider(
      { defaultModel: 'configured-model', timeoutMs: 1_000 },
      client,
    );

    await provider.generate({
      model: 'request-model',
      messages: [{ role: 'user', content: 'Provide a response.' }],
    });

    expect(client.create).toHaveBeenCalledWith(
      {
        model: 'request-model',
        input: [{ role: 'user', content: 'Provide a response.' }],
      },
      { timeout: 1_000, maxRetries: 0 },
    );
  });

  it('maps the generic response format to Responses API Structured Outputs', async () => {
    const client = createClient(async () => ({
      output_text: '{"title":"Example","score":0.9}',
      model: 'configured-model',
    }));
    const provider = new OpenAiLlmProvider(config, client);
    const schema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        score: { type: 'number' },
      },
      required: ['title', 'score'],
      additionalProperties: false,
    } as const;

    await provider.generate({
      messages: [
        { role: 'system', content: 'Follow the response format.' },
        { role: 'user', content: 'Return a generic result.' },
      ],
      responseFormat: {
        type: 'json_schema',
        name: 'example_result',
        schema,
        strict: true,
      },
    });

    expect(client.create).toHaveBeenCalledWith(
      {
        model: 'configured-model',
        input: [
          { role: 'system', content: 'Follow the response format.' },
          { role: 'user', content: 'Return a generic result.' },
        ],
        max_output_tokens: 256,
        text: {
          format: {
            type: 'json_schema',
            name: 'example_result',
            schema,
            strict: true,
          },
        },
      },
      { timeout: 5_000, maxRetries: 0 },
    );
  });

  it('maps opt-in web search and provider-reported source metadata', async () => {
    const client = createClient(async () => ({
      output_text: 'Sourced response',
      model: 'configured-model',
      output: [
        {
          type: 'web_search_call',
          action: {
            type: 'search',
            sources: [
              { type: 'url', url: 'https://example.com/first' },
              { type: 'url', url: 'https://example.com/second' },
            ],
          },
        },
      ],
      usage: {
        input_tokens: 20,
        output_tokens: 10,
        total_tokens: 30,
      },
    }));
    const provider = new OpenAiLlmProvider(config, client);

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Find a sourced response.' }],
        tools: [{ type: 'web_search' }],
      }),
    ).resolves.toEqual({
      content: 'Sourced response',
      model: 'configured-model',
      usage: {
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
      },
      webSources: [
        { url: 'https://example.com/first' },
        { url: 'https://example.com/second' },
      ],
    });
    expect(client.create).toHaveBeenCalledWith(
      {
        model: 'configured-model',
        input: [{ role: 'user', content: 'Find a sourced response.' }],
        max_output_tokens: 256,
        tools: [{ type: 'web_search' }],
        include: ['web_search_call.action.sources'],
        tool_choice: 'auto',
      },
      { timeout: 5_000, maxRetries: 0 },
    );
  });

  it('combines web search with strict structured output in one request', async () => {
    const client = createClient(async () => ({
      output_text: '{"value":"result"}',
      model: 'configured-model',
    }));
    const provider = new OpenAiLlmProvider(config, client);
    const schema = {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    } as const;

    await provider.generate({
      messages: [{ role: 'user', content: 'Return a sourced result.' }],
      tools: [{ type: 'web_search' }],
      responseFormat: {
        type: 'json_schema',
        name: 'sourced_result',
        schema,
        strict: true,
      },
    });

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [{ type: 'web_search' }],
        include: ['web_search_call.action.sources'],
        tool_choice: 'auto',
        text: {
          format: {
            type: 'json_schema',
            name: 'sourced_result',
            schema,
            strict: true,
          },
        },
      }),
      { timeout: 5_000, maxRetries: 0 },
    );
  });

  it('preserves source order across web actions and citation annotations', async () => {
    const client = createClient(async () => ({
      output_text: 'Sourced response',
      model: 'configured-model',
      output: [
        { type: 'message', content: [] },
        {
          type: 'web_search_call',
          action: {
            type: 'search',
            sources: [
              { type: 'url', url: 'https://example.com/first' },
              { type: 'url' },
              { type: 'url', url: '   ' },
              null,
            ],
          },
        },
        {
          type: 'web_search_call',
          action: { type: 'open_page', url: 'https://example.com/opened' },
        },
        {
          type: 'web_search_call',
          action: {
            type: 'find_in_page',
            pattern: 'evidence',
            url: 'https://example.com/searched-page',
          },
        },
        {
          type: 'web_search_call',
          action: {
            type: 'search',
            sources: [
              { type: 'url', url: 'https://example.com/second' },
              { type: 'url', url: 'https://example.com/first' },
            ],
          },
        },
        { type: 'web_search_call', action: { type: 'search' } },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Sourced response',
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://example.com/cited',
                  title: 'Cited source',
                  start_index: 0,
                  end_index: 16,
                },
                { type: 'file_citation', file_id: 'file-1' },
                { type: 'url_citation', url: '   ' },
              ],
            },
            { type: 'refusal', refusal: 'Not applicable' },
          ],
        },
      ],
    }));
    const provider = new OpenAiLlmProvider(config, client);

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Find sources.' }],
        tools: [{ type: 'web_search' }],
      }),
    ).resolves.toMatchObject({
      webSources: [
        { url: 'https://example.com/first' },
        { url: 'https://example.com/opened' },
        { url: 'https://example.com/searched-page' },
        { url: 'https://example.com/second' },
        { url: 'https://example.com/first' },
        { url: 'https://example.com/cited' },
      ],
    });
  });

  it('omits web source metadata when the provider reports no usable sources', async () => {
    const client = createClient(async () => ({
      output_text: 'Response without sources',
      model: 'configured-model',
      output: [
        {
          type: 'web_search_call',
          action: { type: 'open_page', url: null },
        },
        { type: 'message', content: [{ type: 'output_text', annotations: [] }] },
      ],
    }));
    const provider = new OpenAiLlmProvider(config, client);

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Find sources.' }],
        tools: [{ type: 'web_search' }],
      }),
    ).resolves.toEqual({
      content: 'Response without sources',
      model: 'configured-model',
    });
  });

  it('maps text, model, and token usage without exposing the SDK response', async () => {
    const client = createClient(async () => ({
      output_text: 'Mapped response',
      model: 'response-model',
      usage: {
        input_tokens: 12,
        output_tokens: 7,
        total_tokens: 19,
      },
    }));
    const provider = new OpenAiLlmProvider(config, client);

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Provide a response.' }],
      }),
    ).resolves.toEqual({
      content: 'Mapped response',
      model: 'response-model',
      usage: {
        inputTokens: 12,
        outputTokens: 7,
        totalTokens: 19,
      },
    });
  });

  it('normalizes authentication failures without leaking provider details', async () => {
    const providerMessage = 'Sensitive provider authentication detail';
    const client = createClient(() =>
      Promise.reject(
        new AuthenticationError(
          401,
          { message: providerMessage },
          providerMessage,
          new Headers(),
        ),
      ),
    );
    const provider = new OpenAiLlmProvider(config, client);

    const result = provider.generate({
      messages: [{ role: 'user', content: 'Provide a response.' }],
    });

    await expect(result).rejects.toEqual(
      new LlmProviderError('LLM provider authentication failed.'),
    );
    await expect(result).rejects.not.toHaveProperty(
      'message',
      expect.stringContaining(providerMessage),
    );
  });

  it('normalizes timeouts behind the provider error boundary', async () => {
    const client = createClient(() =>
      Promise.reject(new APIConnectionTimeoutError()),
    );
    const provider = new OpenAiLlmProvider(config, client);

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Provide a response.' }],
      }),
    ).rejects.toEqual(
      new LlmProviderError('LLM provider request timed out.'),
    );
  });

  it('normalizes unknown failures without leaking internal details', async () => {
    const internalMessage = 'Internal client detail';
    const client = createClient(() => Promise.reject(new Error(internalMessage)));
    const provider = new OpenAiLlmProvider(config, client);

    const result = provider.generate({
      messages: [{ role: 'user', content: 'Provide a response.' }],
    });

    await expect(result).rejects.toEqual(
      new LlmProviderError('LLM provider request failed.'),
    );
    await expect(result).rejects.not.toHaveProperty(
      'message',
      expect.stringContaining(internalMessage),
    );
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty text result as an unusable provider response', async () => {
    const client = createClient(async () => ({
      output_text: '   ',
      model: 'configured-model',
    }));
    const provider = new OpenAiLlmProvider(config, client);

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Provide a response.' }],
      }),
    ).rejects.toEqual(
      new LlmProviderError('LLM provider returned an unusable response.'),
    );
  });

  it('does not require an API key when a test client is injected', async () => {
    const client = createClient(async () => ({
      output_text: 'Network-free response',
      model: 'configured-model',
    }));
    const provider = new OpenAiLlmProvider(config, client);

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Provide a response.' }],
      }),
    ).resolves.toMatchObject({ content: 'Network-free response' });
  });
});
