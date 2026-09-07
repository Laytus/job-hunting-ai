export type LlmMessageRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  readonly role: LlmMessageRole;
  readonly content: string;
}

export interface LlmJsonSchemaResponseFormat {
  readonly type: 'json_schema';
  readonly name: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly strict?: boolean;
}

export type LlmResponseFormat = LlmJsonSchemaResponseFormat;

export interface LlmWebSearchTool {
  readonly type: 'web_search';
}

export type LlmTool = LlmWebSearchTool;

export interface LlmRequest {
  readonly messages: readonly LlmMessage[];
  readonly model?: string;
  readonly responseFormat?: LlmResponseFormat;
  readonly tools?: readonly LlmTool[];
}

export interface LlmUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface LlmWebSource {
  readonly url: string;
}

export interface LlmResponse {
  readonly content: string;
  readonly model?: string;
  readonly usage?: LlmUsage;
  readonly webSources?: readonly LlmWebSource[];
}
