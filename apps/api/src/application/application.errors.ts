import type { HttpMappableDomainError } from '../http/errors.js';

const applicationValidationHttpMapping = {
  statusCode: 400,
  code: 'VALIDATION_ERROR',
  safeMessage: 'The request is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const applicationIdentifierHttpMapping = {
  statusCode: 400,
  code: 'INVALID_IDENTIFIER',
  safeMessage: 'An Application identifier is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const applicationNotFoundHttpMapping = {
  statusCode: 404,
  code: 'NOT_FOUND',
  safeMessage: 'The Application was not found.',
} as const satisfies HttpMappableDomainError['httpMapping'];

export interface ApplicationDataIssue {
  readonly path: string;
  readonly message: string;
}

export abstract class ApplicationDomainError extends Error {
  abstract readonly kind: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidApplicationDataError
  extends ApplicationDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_DATA';
  readonly httpMapping = applicationValidationHttpMapping;

  constructor(readonly issues: readonly ApplicationDataIssue[]) {
    super('Application data is invalid.');
  }
}

export class InvalidApplicationIdentifierError
  extends ApplicationDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_IDENTIFIER';
  readonly httpMapping = applicationIdentifierHttpMapping;

  constructor(readonly identifier: string) {
    super('Application identifier is invalid.');
  }
}

export class ApplicationNotFoundError
  extends ApplicationDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'NOT_FOUND';
  readonly httpMapping = applicationNotFoundHttpMapping;

  constructor(readonly identifier: string) {
    super('Application was not found.');
  }
}
