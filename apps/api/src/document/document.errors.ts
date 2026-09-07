import type { HttpMappableDomainError } from '../http/errors.js';

const validationHttpMapping = {
  statusCode: 400,
  code: 'VALIDATION_ERROR',
  safeMessage: 'The request is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const identifierHttpMapping = {
  statusCode: 400,
  code: 'INVALID_IDENTIFIER',
  safeMessage: 'A Document identifier is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const notFoundHttpMapping = {
  statusCode: 404,
  code: 'NOT_FOUND',
  safeMessage: 'The Document was not found.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const ownerNotFoundHttpMapping = {
  statusCode: 404,
  code: 'NOT_FOUND',
  safeMessage: 'The Document owner was not found.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const applicationNotFoundHttpMapping = {
  statusCode: 404,
  code: 'NOT_FOUND',
  safeMessage: 'The Application was not found.',
} as const satisfies HttpMappableDomainError['httpMapping'];

export interface DocumentDataIssue {
  readonly path: string;
  readonly message: string;
}

export abstract class DocumentDomainError extends Error {
  abstract readonly kind: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidDocumentDataError
  extends DocumentDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_DATA';
  readonly httpMapping = validationHttpMapping;

  constructor(readonly issues: readonly DocumentDataIssue[]) {
    super('Document data is invalid.');
  }
}

export class InvalidDocumentIdentifierError
  extends DocumentDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_IDENTIFIER';
  readonly httpMapping = identifierHttpMapping;

  constructor(readonly identifier: string) {
    super('Document identifier is invalid.');
  }
}

export class DocumentNotFoundError
  extends DocumentDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'NOT_FOUND';
  readonly httpMapping = notFoundHttpMapping;

  constructor(readonly identifier: string) {
    super('Document was not found.');
  }
}

export class DocumentOwnerNotFoundError
  extends DocumentDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'OWNER_NOT_FOUND';
  readonly httpMapping = ownerNotFoundHttpMapping;

  constructor() {
    super('Document owner was not found.');
  }
}

export class DocumentApplicationNotFoundError
  extends DocumentDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'APPLICATION_NOT_FOUND';
  readonly httpMapping = applicationNotFoundHttpMapping;

  constructor(readonly applicationId: string) {
    super('Application was not found.');
  }
}

export class DocumentInvariantViolationError extends DocumentDomainError {
  readonly kind = 'INVARIANT_VIOLATION';

  constructor(readonly invariant: string) {
    super('A persisted Document invariant was violated.');
  }
}
