import type { HttpMappableDomainError } from '../http/errors.js';

export class ResearchRunningConflictError extends Error {
  constructor() {
    super('A RUNNING Research already exists for this Application.');
    this.name = new.target.name;
  }
}

export type ResearchGraphReferenceErrorCode =
  | 'DUPLICATE_SOURCE_KEY'
  | 'DUPLICATE_CLAIM_KEY'
  | 'SOURCE_KEY_NOT_FOUND'
  | 'CLAIM_KEY_NOT_FOUND';

export class ResearchGraphReferenceError extends Error {
  constructor(readonly code: ResearchGraphReferenceErrorCode) {
    super(`The Research graph contains an invalid reference: ${code}.`);
    this.name = new.target.name;
  }
}

export class ResearchPersistenceInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export type ResearchWorkflowErrorCode =
  | 'RESEARCH_NOT_FOUND'
  | 'RESEARCH_ALREADY_RUNNING'
  | 'RESEARCH_PERSISTENCE_FAILED'
  | 'UNEXPECTED_RESEARCH_FAILURE';

export abstract class ResearchWorkflowError
  extends Error
  implements HttpMappableDomainError
{
  abstract readonly code: ResearchWorkflowErrorCode;
  abstract readonly httpMapping: HttpMappableDomainError['httpMapping'];

  protected constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ResearchNotFoundError extends ResearchWorkflowError {
  readonly code = 'RESEARCH_NOT_FOUND';
  readonly httpMapping = {
    statusCode: 404,
    code: this.code,
    safeMessage: 'The Research was not found.',
  } as const;

  constructor() {
    super('The Research was not found.');
  }
}

export class ResearchAlreadyRunningError extends ResearchWorkflowError {
  readonly code = 'RESEARCH_ALREADY_RUNNING';
  readonly httpMapping = {
    statusCode: 409,
    code: this.code,
    safeMessage: 'A Research run is already in progress for this Application.',
  } as const;

  constructor() {
    super('A Research execution is already running for this Application.');
  }
}

export class ResearchPersistenceError extends ResearchWorkflowError {
  readonly code = 'RESEARCH_PERSISTENCE_FAILED';
  readonly httpMapping = {
    statusCode: 500,
    code: this.code,
    safeMessage: 'Research workflow state could not be persisted.',
  } as const;

  constructor(options?: ErrorOptions) {
    super('Research workflow state could not be persisted.', options);
  }
}

export class UnexpectedResearchFailureError extends ResearchWorkflowError {
  readonly code = 'UNEXPECTED_RESEARCH_FAILURE';
  readonly httpMapping = {
    statusCode: 500,
    code: this.code,
    safeMessage: 'The Research workflow failed unexpectedly.',
  } as const;

  constructor(options?: ErrorOptions) {
    super('The Research workflow failed unexpectedly.', options);
  }
}

export type ResearchValidationErrorCode =
  | 'INVALID_RESEARCH_SOURCE'
  | 'UNVERIFIED_RESEARCH_SOURCE'
  | 'INVALID_RESEARCH_CLAIM'
  | 'INVALID_CLAIM_SOURCE_RELATIONSHIP'
  | 'RESEARCH_SOURCE_LIMIT_EXCEEDED'
  | 'RESEARCH_CONFIDENCE_FAILED';

export type ResearchValidationErrorReason =
  | 'INVALID_URL'
  | 'INVALID_PUBLISHED_DATE'
  | 'INVALID_SOURCE_ID'
  | 'DUPLICATE_SOURCE_ID'
  | 'CONFLICTING_SOURCE_METADATA'
  | 'SOURCE_NOT_REPORTED_BY_PROVIDER'
  | 'DUPLICATE_CLAIM_ID'
  | 'INVALID_CLAIM_ID'
  | 'MISSING_CLAIM_VALUE'
  | 'INVALID_COMPENSATION_AMOUNT'
  | 'MISSING_COMPENSATION_VALUE'
  | 'INCOMPLETE_COMPENSATION_RANGE'
  | 'AMBIGUOUS_COMPENSATION_VALUE'
  | 'INVALID_COMPENSATION_CURRENCY'
  | 'INVALID_COMPENSATION_PERIOD'
  | 'INVALID_COMPENSATION_YEAR'
  | 'INVALID_INTERVIEW_STAGE_ORDER'
  | 'MISSING_CLAIM_EVIDENCE'
  | 'MISSING_SUPPORTING_EVIDENCE'
  | 'UNKNOWN_SOURCE_REFERENCE'
  | 'DUPLICATE_CLAIM_SOURCE_LINK'
  | 'INVALID_RESEARCH_DATE'
  | 'IMPOSSIBLE_CONFIDENCE_STATE'
  | 'TOO_MANY_SOURCES';

const researchValidationMessages: Record<
  ResearchValidationErrorCode,
  string
> = {
  INVALID_RESEARCH_SOURCE: 'The Research output contains an invalid source.',
  UNVERIFIED_RESEARCH_SOURCE:
    'A Research source could not be verified against provider provenance.',
  INVALID_RESEARCH_CLAIM: 'The Research output contains an invalid claim.',
  INVALID_CLAIM_SOURCE_RELATIONSHIP:
    'The Research output contains an invalid claim-source relationship.',
  RESEARCH_SOURCE_LIMIT_EXCEEDED:
    'The Research output exceeds the source limit.',
  RESEARCH_CONFIDENCE_FAILED:
    'Research confidence could not be calculated.',
};

export class ResearchValidationError extends Error {
  constructor(
    readonly code: ResearchValidationErrorCode,
    readonly reason: ResearchValidationErrorReason,
  ) {
    super(researchValidationMessages[code]);
    this.name = new.target.name;
  }
}
