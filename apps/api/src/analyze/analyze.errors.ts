import type { HttpMappableDomainError } from '../http/errors.js';

export type AnalyzeWorkflowErrorCode =
  | 'APPLICATION_NOT_FOUND'
  | 'ANALYSIS_NOT_FOUND'
  | 'ANALYSIS_ALREADY_RUNNING'
  | 'SCORING_FAILED'
  | 'ANALYZE_PERSISTENCE_FAILED'
  | 'UNEXPECTED_ANALYZE_FAILURE';

export abstract class AnalyzeWorkflowError
  extends Error
  implements HttpMappableDomainError
{
  abstract readonly code: AnalyzeWorkflowErrorCode;
  abstract readonly httpMapping: HttpMappableDomainError['httpMapping'];

  protected constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class AnalyzeApplicationNotFoundError extends AnalyzeWorkflowError {
  readonly code = 'APPLICATION_NOT_FOUND';
  readonly httpMapping = {
    statusCode: 404,
    code: this.code,
    safeMessage: 'The Application was not found.',
  } as const;

  constructor() {
    super('The Application was not found.');
  }
}

export class AnalysisNotFoundError extends AnalyzeWorkflowError {
  readonly code = 'ANALYSIS_NOT_FOUND';
  readonly httpMapping = {
    statusCode: 404,
    code: this.code,
    safeMessage: 'The Job Analysis was not found.',
  } as const;

  constructor() {
    super('The Job Analysis was not found.');
  }
}

export class AnalysisAlreadyRunningError extends AnalyzeWorkflowError {
  readonly code = 'ANALYSIS_ALREADY_RUNNING';
  readonly httpMapping = {
    statusCode: 409,
    code: this.code,
    safeMessage: 'An Analyze run is already in progress for this Application.',
  } as const;

  constructor() {
    super('An Analyze execution is already running for this Application.');
  }
}

export class AnalyzeScoringError extends AnalyzeWorkflowError {
  readonly code = 'SCORING_FAILED';
  readonly httpMapping = {
    statusCode: 500,
    code: this.code,
    safeMessage: 'The Analyze result could not be scored.',
  } as const;

  constructor(options?: ErrorOptions) {
    super('The Analyze result could not be scored.', options);
  }
}

export class AnalyzePersistenceError extends AnalyzeWorkflowError {
  readonly code = 'ANALYZE_PERSISTENCE_FAILED';
  readonly httpMapping = {
    statusCode: 500,
    code: this.code,
    safeMessage: 'Analyze workflow state could not be persisted.',
  } as const;

  constructor(options?: ErrorOptions) {
    super('Analyze workflow state could not be persisted.', options);
  }
}

export class UnexpectedAnalyzeFailureError extends AnalyzeWorkflowError {
  readonly code = 'UNEXPECTED_ANALYZE_FAILURE';
  readonly httpMapping = {
    statusCode: 500,
    code: this.code,
    safeMessage: 'The Analyze workflow failed unexpectedly.',
  } as const;

  constructor(options?: ErrorOptions) {
    super('The Analyze workflow failed unexpectedly.', options);
  }
}

export class JobAnalysisRunningConflictError extends Error {
  constructor() {
    super('A RUNNING Job Analysis already exists for this Application.');
    this.name = new.target.name;
  }
}
