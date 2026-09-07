import type { HttpMappableDomainError } from '../http/errors.js';
import { AiUsageError } from '../llm/ai-usage.errors.js';
import { LlmProviderError } from '../llm/llm.errors.js';
import { StructuredLlmError } from '../llm/structured-llm.js';

class AnalyzeInfrastructureHttpError
  extends Error
  implements HttpMappableDomainError
{
  constructor(
    readonly httpMapping: HttpMappableDomainError['httpMapping'],
    options: ErrorOptions,
  ) {
    super(httpMapping.safeMessage, options);
    this.name = new.target.name;
  }
}

function usageHttpMapping(
  error: AiUsageError,
): HttpMappableDomainError['httpMapping'] {
  if (error.code === 'USAGE_NOT_ALLOWED') {
    return {
      statusCode: 429,
      code: error.code,
      safeMessage: 'LLM usage is not allowed for this operation.',
    };
  }

  return {
    statusCode: 503,
    code: error.code,
    safeMessage: 'AI usage infrastructure is unavailable.',
  };
}

export function mapAnalyzeApiError(error: unknown): unknown {
  if (error instanceof AiUsageError) {
    return new AnalyzeInfrastructureHttpError(usageHttpMapping(error), {
      cause: error,
    });
  }

  if (error instanceof LlmProviderError) {
    return new AnalyzeInfrastructureHttpError(
      {
        statusCode: 502,
        code: 'LLM_PROVIDER_FAILED',
        safeMessage: 'The AI provider could not complete the analysis.',
      },
      { cause: error },
    );
  }

  if (error instanceof StructuredLlmError) {
    return new AnalyzeInfrastructureHttpError(
      {
        statusCode: 502,
        code: error.code,
        safeMessage: 'The AI provider returned an unusable analysis.',
      },
      { cause: error },
    );
  }

  return error;
}
