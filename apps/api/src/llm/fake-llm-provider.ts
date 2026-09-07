import type { LlmProviderError } from './llm.errors.js';
import type { LlmProvider } from './llm-provider.js';
import type { LlmRequest, LlmResponse } from './llm.types.js';

export class FakeLlmProvider implements LlmProvider {
  private readonly recordedRequests: LlmRequest[] = [];
  private response: LlmResponse;
  private error: LlmProviderError | null = null;

  constructor(response: LlmResponse) {
    this.response = response;
  }

  get requests(): readonly LlmRequest[] {
    return this.recordedRequests;
  }

  setResponse(response: LlmResponse): void {
    this.response = response;
  }

  setError(error: LlmProviderError | null): void {
    this.error = error;
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.recordedRequests.push(request);

    if (this.error !== null) {
      throw this.error;
    }

    return this.response;
  }
}
