import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import type { LlmConfig } from './llm.config.js';
import { LlmProviderError } from './llm.errors.js';
import type { LlmProvider } from './llm-provider.js';
import type {
  LlmMessageRole,
  LlmRequest,
  LlmResponse,
} from './llm.types.js';

interface OpenAiResponseRequest {
  readonly model: string;
  readonly input: Array<{
    readonly role: LlmMessageRole;
    readonly content: string;
  }>;
  readonly max_output_tokens?: number;
  readonly text?: {
    readonly format: {
      readonly type: 'json_schema';
      readonly name: string;
      readonly schema: Record<string, unknown>;
      readonly strict?: boolean;
    };
  };
  readonly tools?: Array<{
    readonly type: 'web_search';
  }>;
  readonly include?: Array<'web_search_call.action.sources'>;
  readonly tool_choice?: 'auto';
}

interface OpenAiRequestOptions {
  readonly timeout: number;
  readonly maxRetries: number;
}

interface OpenAiResponseResult {
  readonly output_text: string;
  readonly model: string;
  readonly output?: readonly unknown[];
  readonly usage?: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly total_tokens: number;
  };
}

export interface OpenAiResponsesClient {
  create(
    request: OpenAiResponseRequest,
    options: OpenAiRequestOptions,
  ): Promise<OpenAiResponseResult>;
}

function createSdkResponsesClient(): OpenAiResponsesClient {
  let client: OpenAI;

  try {
    client = new OpenAI();
  } catch {
    throw new LlmProviderError(
      'OpenAI provider configuration is unavailable. Set OPENAI_API_KEY.',
    );
  }

  return {
    create: (request, options) => client.responses.create(request, options),
  };
}

function normalizeProviderError(error: unknown): LlmProviderError {
  if (error instanceof LlmProviderError) {
    return error;
  }

  if (
    error instanceof AuthenticationError ||
    error instanceof PermissionDeniedError
  ) {
    return new LlmProviderError('LLM provider authentication failed.');
  }

  if (error instanceof RateLimitError) {
    return new LlmProviderError('LLM provider rate limit exceeded.');
  }

  if (error instanceof APIConnectionTimeoutError) {
    return new LlmProviderError('LLM provider request timed out.');
  }

  if (error instanceof APIConnectionError) {
    return new LlmProviderError('LLM provider is unavailable.');
  }

  if (error instanceof APIError) {
    if (error.status !== undefined && error.status >= 500) {
      return new LlmProviderError('LLM provider is unavailable.');
    }

    return new LlmProviderError('LLM provider rejected the request.');
  }

  return new LlmProviderError('LLM provider request failed.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function appendWebSource(
  webSources: Array<{ url: string }>,
  url: unknown,
): void {
  if (typeof url === 'string' && url.trim() !== '') {
    webSources.push({ url });
  }
}

function extractWebSources(
  output: readonly unknown[] | undefined,
): LlmResponse['webSources'] {
  if (output === undefined) {
    return undefined;
  }

  const webSources: Array<{ url: string }> = [];

  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }

    if (item['type'] === 'web_search_call') {
      const action = item['action'];
      if (!isRecord(action)) {
        continue;
      }

      if (action['type'] === 'search' && Array.isArray(action['sources'])) {
        for (const source of action['sources']) {
          if (isRecord(source)) {
            appendWebSource(webSources, source['url']);
          }
        }
      } else if (
        action['type'] === 'open_page' ||
        action['type'] === 'find_in_page'
      ) {
        appendWebSource(webSources, action['url']);
      }
      continue;
    }

    if (item['type'] !== 'message' || !Array.isArray(item['content'])) {
      continue;
    }

    for (const content of item['content']) {
      if (
        !isRecord(content) ||
        content['type'] !== 'output_text' ||
        !Array.isArray(content['annotations'])
      ) {
        continue;
      }

      for (const annotation of content['annotations']) {
        if (isRecord(annotation) && annotation['type'] === 'url_citation') {
          appendWebSource(webSources, annotation['url']);
        }
      }
    }
  }

  return webSources.length === 0 ? undefined : webSources;
}

export class OpenAiLlmProvider implements LlmProvider {
  private readonly responsesClient: OpenAiResponsesClient;

  constructor(
    private readonly config: LlmConfig,
    responsesClient?: OpenAiResponsesClient,
  ) {
    this.responsesClient = responsesClient ?? createSdkResponsesClient();
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const webSearchEnabled =
      request.tools?.some((tool) => tool.type === 'web_search') === true;
    const providerRequest: OpenAiResponseRequest = {
      model: request.model ?? this.config.defaultModel,
      input: request.messages.map(({ role, content }) => ({ role, content })),
      ...(this.config.maxTokens === undefined
        ? {}
        : { max_output_tokens: this.config.maxTokens }),
      ...(request.responseFormat === undefined
        ? {}
        : {
            text: {
              format: {
                type: request.responseFormat.type,
                name: request.responseFormat.name,
                schema: { ...request.responseFormat.schema },
                ...(request.responseFormat.strict === undefined
                  ? {}
                  : { strict: request.responseFormat.strict }),
              },
            },
          }),
      ...(webSearchEnabled
        ? {
            tools: [{ type: 'web_search' as const }],
            include: ['web_search_call.action.sources' as const],
            tool_choice: 'auto' as const,
          }
        : {}),
    };

    try {
      const response = await this.responsesClient.create(providerRequest, {
        timeout: this.config.timeoutMs,
        maxRetries: 0,
      });

      if (response.output_text.trim() === '') {
        throw new LlmProviderError(
          'LLM provider returned an unusable response.',
        );
      }

      const webSources = extractWebSources(response.output);

      return {
        content: response.output_text,
        model: response.model,
        ...(response.usage === undefined
          ? {}
          : {
              usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                totalTokens: response.usage.total_tokens,
              },
            }),
        ...(webSources === undefined ? {} : { webSources }),
      };
    } catch (error) {
      throw normalizeProviderError(error);
    }
  }
}
