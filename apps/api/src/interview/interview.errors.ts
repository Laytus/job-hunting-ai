import type { HttpMappableDomainError } from '../http/errors.js';

const validationHttpMapping = {
  statusCode: 400,
  code: 'VALIDATION_ERROR',
  safeMessage: 'The request is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const identifierHttpMapping = {
  statusCode: 400,
  code: 'INVALID_IDENTIFIER',
  safeMessage: 'A request identifier is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const applicationNotFoundHttpMapping = {
  statusCode: 404,
  code: 'NOT_FOUND',
  safeMessage: 'The Application was not found.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const interviewNotFoundHttpMapping = {
  statusCode: 404,
  code: 'NOT_FOUND',
  safeMessage: 'The Interview was not found.',
} as const satisfies HttpMappableDomainError['httpMapping'];

export interface InterviewDataIssue {
  readonly path: string;
  readonly message: string;
}

export abstract class InterviewDomainError extends Error {
  abstract readonly kind: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidInterviewDataError
  extends InterviewDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_DATA';
  readonly httpMapping = validationHttpMapping;

  constructor(readonly issues: readonly InterviewDataIssue[]) {
    super('Interview data is invalid.');
  }
}

export class InvalidInterviewIdentifierError
  extends InterviewDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_IDENTIFIER';
  readonly httpMapping = identifierHttpMapping;

  constructor(readonly identifier: string) {
    super('Interview identifier is invalid.');
  }
}

export class InterviewApplicationNotFoundError
  extends InterviewDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'APPLICATION_NOT_FOUND';
  readonly httpMapping = applicationNotFoundHttpMapping;

  constructor(readonly applicationId: string) {
    super('Application was not found.');
  }
}

export class InterviewNotFoundError
  extends InterviewDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INTERVIEW_NOT_FOUND';
  readonly httpMapping = interviewNotFoundHttpMapping;

  constructor(
    readonly applicationId: string,
    readonly interviewId: string,
  ) {
    super('Interview was not found.');
  }
}
