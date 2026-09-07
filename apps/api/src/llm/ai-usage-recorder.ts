import { AiUsageError } from './ai-usage.errors.js';
import type { AiUsage, CreateAiUsageCommand } from './ai-usage.types.js';
import type { LlmRequest, LlmResponse } from './llm.types.js';

export interface AiUsageWriter {
  recordUsage(command: CreateAiUsageCommand): Promise<AiUsage>;
}

export interface RecordAiUsageOptions {
  readonly operationName: string;
  readonly request: LlmRequest;
  readonly response: LlmResponse;
}

function isTokenCount(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0;
}

function resolveModel(request: LlmRequest, response: LlmResponse): string | null {
  const responseModel = response.model?.trim();
  if (responseModel !== undefined && responseModel !== '') {
    return responseModel;
  }

  const requestModel = request.model?.trim();
  return requestModel !== undefined && requestModel !== '' ? requestModel : null;
}

export class AiUsageRecorder {
  constructor(private readonly writer: AiUsageWriter) {}

  async record(options: RecordAiUsageOptions): Promise<AiUsage> {
    const usage = options.response.usage;
    const model = resolveModel(options.request, options.response);

    if (
      options.operationName.trim() === '' ||
      model === null ||
      usage === undefined ||
      !isTokenCount(usage.inputTokens) ||
      !isTokenCount(usage.outputTokens) ||
      !isTokenCount(usage.totalTokens)
    ) {
      throw new AiUsageError('USAGE_METADATA_UNAVAILABLE');
    }

    try {
      return await this.writer.recordUsage({
        operationName: options.operationName,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      });
    } catch {
      throw new AiUsageError('USAGE_RECORDING_FAILED');
    }
  }
}
