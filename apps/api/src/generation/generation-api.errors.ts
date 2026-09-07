import type { HttpMappableDomainError } from '../http/errors.js';
import { AiUsageError } from '../llm/ai-usage.errors.js';
import { LlmProviderError } from '../llm/llm.errors.js';
import { StructuredLlmError } from '../llm/structured-llm.js';
import {
  GenerationContextError,
  GenerationTemplateError,
  GenerationWorkflowError,
} from './generation.errors.js';

class GenerationApiHttpError
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

function mappedError(
  error: Error,
  statusCode: number,
  code: string,
  safeMessage: string,
): GenerationApiHttpError {
  return new GenerationApiHttpError(
    { statusCode, code, safeMessage },
    { cause: error },
  );
}

export function mapGenerationApiError(error: unknown): unknown {
  if (error instanceof AiUsageError) {
    return mappedError(
      error,
      error.code === 'USAGE_NOT_ALLOWED' ? 429 : 503,
      error.code,
      error.code === 'USAGE_NOT_ALLOWED'
        ? 'LLM usage is not allowed for this operation.'
        : 'AI usage infrastructure is unavailable.',
    );
  }

  if (error instanceof LlmProviderError) {
    return mappedError(
      error,
      502,
      'LLM_PROVIDER_FAILED',
      'The AI provider could not complete Generation.',
    );
  }

  if (error instanceof StructuredLlmError) {
    return mappedError(
      error,
      502,
      error.code,
      'The AI provider returned an unusable Generation result.',
    );
  }

  if (error instanceof GenerationTemplateError) {
    return mappedError(
      error,
      502,
      error.code,
      'The configured Generation template is unavailable.',
    );
  }

  if (error instanceof GenerationContextError) {
    const statusCode = error.code === 'INVALID_SOURCE_CONTEXT' ? 409 : 404;
    return mappedError(
      error,
      statusCode,
      error.code,
      error.message,
    );
  }

  if (
    error instanceof GenerationWorkflowError &&
    error.code === 'GENERATION_COMPOSITION_FAILED'
  ) {
    return mappedError(
      error,
      502,
      error.code,
      'The generated Document content was unusable.',
    );
  }

  return error;
}
