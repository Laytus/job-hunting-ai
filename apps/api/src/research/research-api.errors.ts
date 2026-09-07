import type { HttpMappableDomainError } from '../http/errors.js';
import { AiUsageError } from '../llm/ai-usage.errors.js';
import { LlmProviderError } from '../llm/llm.errors.js';
import { StructuredLlmError } from '../llm/structured-llm.js';
import { ResearchValidationError } from './research.errors.js';

class ResearchInfrastructureHttpError
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

export function mapResearchApiError(error: unknown): unknown {
  if (error instanceof AiUsageError) {
    return new ResearchInfrastructureHttpError(usageHttpMapping(error), {
      cause: error,
    });
  }

  if (error instanceof LlmProviderError) {
    return new ResearchInfrastructureHttpError(
      {
        statusCode: 502,
        code: 'LLM_PROVIDER_FAILED',
        safeMessage: 'The AI provider could not complete the research.',
      },
      { cause: error },
    );
  }

  if (error instanceof StructuredLlmError) {
    return new ResearchInfrastructureHttpError(
      {
        statusCode: 502,
        code: error.code,
        safeMessage: 'The AI provider returned an unusable Research result.',
      },
      { cause: error },
    );
  }

  if (error instanceof ResearchValidationError) {
    return new ResearchInfrastructureHttpError(
      {
        statusCode: 502,
        code: error.code,
        safeMessage: 'The AI provider returned an unusable Research result.',
      },
      { cause: error },
    );
  }

  return error;
}
