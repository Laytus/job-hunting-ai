import type { ZodType } from 'zod';
import type {
  LlmJsonSchemaResponseFormat,
  LlmRequest,
  LlmResponse,
} from './llm.types.js';
import type { LlmExecutor } from './tracked-llm.js';

export type StructuredLlmErrorCode =
  | 'INVALID_JSON'
  | 'SCHEMA_VALIDATION_FAILED';

const structuredLlmErrorMessages: Record<StructuredLlmErrorCode, string> = {
  INVALID_JSON: 'The LLM response was not valid JSON.',
  SCHEMA_VALIDATION_FAILED:
    'The LLM response did not match the required schema.',
};

export class StructuredLlmError extends Error {
  constructor(readonly code: StructuredLlmErrorCode) {
    super(structuredLlmErrorMessages[code]);
    this.name = new.target.name;
  }
}

export interface StructuredLlmResult<T> {
  readonly data: T;
  readonly response: LlmResponse;
}

export interface GenerateStructuredLlmOptions<T> {
  readonly operationName: string;
  readonly request: Omit<LlmRequest, 'responseFormat'>;
  readonly responseFormat: LlmJsonSchemaResponseFormat;
  readonly runtimeSchema: ZodType<T>;
}

export async function generateStructured<T>(
  executor: LlmExecutor,
  options: GenerateStructuredLlmOptions<T>,
): Promise<StructuredLlmResult<T>> {
  const response = await executor.execute({
    operationName: options.operationName,
    request: {
      ...options.request,
      responseFormat: options.responseFormat,
    },
  });

  let parsed: unknown;

  try {
    parsed = JSON.parse(response.content) as unknown;
  } catch {
    throw new StructuredLlmError('INVALID_JSON');
  }

  const validation = options.runtimeSchema.safeParse(parsed);
  if (!validation.success) {
    throw new StructuredLlmError('SCHEMA_VALIDATION_FAILED');
  }

  return {
    data: validation.data,
    response,
  };
}
