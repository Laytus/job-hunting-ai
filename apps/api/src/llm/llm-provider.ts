import type { LlmRequest, LlmResponse } from './llm.types.js';

export interface LlmProvider {
  generate(request: LlmRequest): Promise<LlmResponse>;
}
