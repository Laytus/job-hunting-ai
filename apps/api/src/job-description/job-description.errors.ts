import type { HttpMappableDomainError } from '../http/errors.js';

const validationHttpMapping = {
  statusCode: 400,
  code: 'VALIDATION_ERROR',
  safeMessage: 'The request is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const identifierHttpMapping = {
  statusCode: 400,
  code: 'INVALID_IDENTIFIER',
  safeMessage: 'An Application identifier is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const applicationNotFoundHttpMapping = {
  statusCode: 404,
  code: 'NOT_FOUND',
  safeMessage: 'The Application was not found.',
} as const satisfies HttpMappableDomainError['httpMapping'];

export interface JobDescriptionDataIssue {
  readonly path: string;
  readonly message: string;
}

export abstract class JobDescriptionDomainError extends Error {
  abstract readonly kind: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidJobDescriptionDataError
  extends JobDescriptionDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_DATA';
  readonly httpMapping = validationHttpMapping;

  constructor(readonly issues: readonly JobDescriptionDataIssue[]) {
    super('Job Description data is invalid.');
  }
}

export class InvalidJobDescriptionIdentifierError
  extends JobDescriptionDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_IDENTIFIER';
  readonly httpMapping = identifierHttpMapping;

  constructor(readonly identifier: string) {
    super('Application identifier is invalid.');
  }
}

export class JobDescriptionApplicationNotFoundError
  extends JobDescriptionDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'APPLICATION_NOT_FOUND';
  readonly httpMapping = applicationNotFoundHttpMapping;

  constructor(readonly applicationId: string) {
    super('Application was not found.');
  }
}
