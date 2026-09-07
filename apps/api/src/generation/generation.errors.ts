import type {
  GenerationDocumentType,
  GenerationLanguage,
  GenerationTemplateId,
} from './generation.types.js';
import type { HttpMappableDomainError } from '../http/errors.js';

export const generationTemplateErrorCodes = [
  'UNSUPPORTED_GENERATION_TEMPLATE',
  'GENERATION_TEMPLATE_NOT_FOUND',
  'GENERATION_TEMPLATE_EMPTY',
  'GENERATION_TEMPLATE_LOAD_FAILED',
] as const;

export type GenerationTemplateErrorCode =
  (typeof generationTemplateErrorCodes)[number];

const errorMessages: Record<GenerationTemplateErrorCode, string> = {
  UNSUPPORTED_GENERATION_TEMPLATE:
    'The requested Generation document type and language are not supported.',
  GENERATION_TEMPLATE_NOT_FOUND:
    'The configured Generation template resource is unavailable.',
  GENERATION_TEMPLATE_EMPTY:
    'The configured Generation template resource is empty.',
  GENERATION_TEMPLATE_LOAD_FAILED:
    'The configured Generation template resource could not be loaded.',
};

export class GenerationTemplateError extends Error {
  override readonly name = 'GenerationTemplateError';

  constructor(
    readonly code: GenerationTemplateErrorCode,
    readonly templateId: GenerationTemplateId | null = null,
    readonly documentType: GenerationDocumentType | null = null,
    readonly language: GenerationLanguage | null = null,
  ) {
    super(errorMessages[code]);
  }
}

export const generationContextErrorCodes = [
  'CANDIDATE_PROFILE_UNAVAILABLE',
  'APPLICATION_UNAVAILABLE',
  'JOB_DESCRIPTION_UNAVAILABLE',
  'INVALID_SOURCE_CONTEXT',
] as const;

export type GenerationContextErrorCode =
  (typeof generationContextErrorCodes)[number];

const contextErrorMessages: Record<GenerationContextErrorCode, string> = {
  CANDIDATE_PROFILE_UNAVAILABLE:
    'The Candidate Profile required for Generation is unavailable.',
  APPLICATION_UNAVAILABLE:
    'The Application required for Generation is unavailable.',
  JOB_DESCRIPTION_UNAVAILABLE:
    'The Job Description required for Generation is unavailable.',
  INVALID_SOURCE_CONTEXT:
    'The supplied Generation sources do not form a valid completed context.',
};

export class GenerationContextError extends Error {
  override readonly name = 'GenerationContextError';

  constructor(readonly code: GenerationContextErrorCode) {
    super(contextErrorMessages[code]);
  }
}

export const generationWorkflowErrorCodes = [
  'INVALID_GENERATION_REQUEST',
  'INVALID_DOCUMENT_TYPE',
  'INVALID_OUTPUT_LANGUAGE',
  'APPLICATION_UNAVAILABLE',
  'CANDIDATE_UNAVAILABLE',
  'JOB_DESCRIPTION_UNAVAILABLE',
  'DOCUMENT_ALREADY_EXISTS',
  'DOCUMENT_NOT_FOUND',
  'INVALID_GENERATION_TARGET',
  'GENERATION_ALREADY_RUNNING',
  'GENERATION_COMPOSITION_FAILED',
  'GENERATION_PERSISTENCE_FAILED',
  'UNEXPECTED_GENERATION_FAILURE',
] as const;

export type GenerationWorkflowErrorCode =
  (typeof generationWorkflowErrorCodes)[number];

const workflowErrorDetails: Record<
  GenerationWorkflowErrorCode,
  HttpMappableDomainError['httpMapping']
> = {
  INVALID_GENERATION_REQUEST: {
    statusCode: 400,
    code: 'INVALID_GENERATION_REQUEST',
    safeMessage: 'The Generation request is invalid.',
  },
  INVALID_DOCUMENT_TYPE: {
    statusCode: 400,
    code: 'INVALID_DOCUMENT_TYPE',
    safeMessage: 'The requested Generation document type is invalid.',
  },
  INVALID_OUTPUT_LANGUAGE: {
    statusCode: 400,
    code: 'INVALID_OUTPUT_LANGUAGE',
    safeMessage: 'The requested Generation output language is invalid.',
  },
  APPLICATION_UNAVAILABLE: {
    statusCode: 404,
    code: 'APPLICATION_UNAVAILABLE',
    safeMessage: 'The Application required for Generation is unavailable.',
  },
  CANDIDATE_UNAVAILABLE: {
    statusCode: 404,
    code: 'CANDIDATE_UNAVAILABLE',
    safeMessage: 'The Candidate Profile required for Generation is unavailable.',
  },
  JOB_DESCRIPTION_UNAVAILABLE: {
    statusCode: 404,
    code: 'JOB_DESCRIPTION_UNAVAILABLE',
    safeMessage: 'The Job Description required for Generation is unavailable.',
  },
  DOCUMENT_ALREADY_EXISTS: {
    statusCode: 409,
    code: 'DOCUMENT_ALREADY_EXISTS',
    safeMessage: 'A generated Document of this type already exists.',
  },
  DOCUMENT_NOT_FOUND: {
    statusCode: 404,
    code: 'DOCUMENT_NOT_FOUND',
    safeMessage: 'The Generation target Document was not found.',
  },
  INVALID_GENERATION_TARGET: {
    statusCode: 409,
    code: 'INVALID_GENERATION_TARGET',
    safeMessage: 'The Document is not a valid Generation target.',
  },
  GENERATION_ALREADY_RUNNING: {
    statusCode: 409,
    code: 'GENERATION_ALREADY_RUNNING',
    safeMessage: 'Generation is already running for this Document type.',
  },
  GENERATION_COMPOSITION_FAILED: {
    statusCode: 500,
    code: 'GENERATION_COMPOSITION_FAILED',
    safeMessage: 'The generated Document could not be composed.',
  },
  GENERATION_PERSISTENCE_FAILED: {
    statusCode: 500,
    code: 'GENERATION_PERSISTENCE_FAILED',
    safeMessage: 'The generated Document could not be persisted.',
  },
  UNEXPECTED_GENERATION_FAILURE: {
    statusCode: 500,
    code: 'UNEXPECTED_GENERATION_FAILURE',
    safeMessage: 'Generation failed unexpectedly.',
  },
};

export class GenerationWorkflowError
  extends Error
  implements HttpMappableDomainError
{
  readonly httpMapping: HttpMappableDomainError['httpMapping'];

  constructor(
    readonly code: GenerationWorkflowErrorCode,
    options?: ErrorOptions,
  ) {
    super(workflowErrorDetails[code].safeMessage, options);
    this.name = new.target.name;
    this.httpMapping = workflowErrorDetails[code];
  }
}
