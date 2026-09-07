import type { HttpMappableDomainError } from '../http/errors.js';
import type { CandidateChildCollection } from './candidate.types.js';

const candidateValidationHttpMapping = {
  statusCode: 400,
  code: 'VALIDATION_ERROR',
  safeMessage: 'The request is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const candidateIdentifierHttpMapping = {
  statusCode: 400,
  code: 'INVALID_IDENTIFIER',
  safeMessage: 'A Candidate identifier is invalid.',
} as const satisfies HttpMappableDomainError['httpMapping'];

const candidateConflictHttpMapping = {
  statusCode: 409,
  code: 'CONFLICT',
  safeMessage: 'The Candidate update conflicts with existing data.',
} as const satisfies HttpMappableDomainError['httpMapping'];

export interface CandidateDataIssue {
  readonly path: string;
  readonly message: string;
}

export abstract class CandidateDomainError extends Error {
  abstract readonly kind: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidCandidateDataError
  extends CandidateDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_DATA';
  readonly httpMapping = candidateValidationHttpMapping;

  constructor(
    message: string,
    readonly issues: readonly CandidateDataIssue[] = [],
  ) {
    super(message);
  }
}

export class InvalidCandidateIdentifierError
  extends CandidateDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'INVALID_IDENTIFIER';
  readonly httpMapping = candidateIdentifierHttpMapping;

  constructor(readonly path: string) {
    super(`The Candidate identifier at ${path} is invalid.`);
  }
}

export class DuplicateCandidateChildIdentifierError
  extends CandidateDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'DUPLICATE_CHILD_IDENTIFIER';
  readonly httpMapping = candidateValidationHttpMapping;

  constructor(
    readonly collection: CandidateChildCollection,
    readonly identifier: string,
  ) {
    super(`Candidate child identifier is repeated in ${collection}.`);
  }
}

export class CandidateChildOwnershipConflictError
  extends CandidateDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'CHILD_OWNERSHIP_CONFLICT';
  readonly httpMapping = candidateConflictHttpMapping;

  constructor(
    readonly collection: CandidateChildCollection,
    readonly identifier: string,
  ) {
    super(`Candidate child identifier does not belong to ${collection}.`);
  }
}

export class CandidateNaturalKeyConflictError
  extends CandidateDomainError
  implements HttpMappableDomainError
{
  readonly kind = 'NATURAL_KEY_CONFLICT';
  readonly httpMapping = candidateConflictHttpMapping;

  constructor(readonly collection: 'skills' | 'languages') {
    super(`Candidate ${collection} contain duplicate normalized names.`);
  }
}

export class CandidateInvariantViolationError extends CandidateDomainError {
  readonly kind = 'INVARIANT_VIOLATION';

  constructor(readonly invariant: string) {
    super(`Candidate invariant violated: ${invariant}.`);
  }
}
