import type { HttpMappableDomainError } from '../http/errors.js';

const identifierHttpMapping = {
  statusCode: 400,
  code: 'INVALID_IDENTIFIER',
  safeMessage: 'An Application identifier is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const notFoundHttpMapping = {
  statusCode: 404,
  code: 'NOT_FOUND',
  safeMessage: 'The Application was not found.',
} as const satisfies HttpMappableDomainError['httpMapping'];

export abstract class ApplicationEventDomainError extends Error {
  abstract readonly kind: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidApplicationEventIdentifierError
  extends ApplicationEventDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_IDENTIFIER';
  readonly httpMapping = identifierHttpMapping;

  constructor(readonly identifier: string) {
    super('Application identifier is invalid.');
  }
}

export class ApplicationEventApplicationNotFoundError
  extends ApplicationEventDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'APPLICATION_NOT_FOUND';
  readonly httpMapping = notFoundHttpMapping;

  constructor(readonly applicationId: string) {
    super('Application was not found.');
  }
}
