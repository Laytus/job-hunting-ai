import type { FastifyError, FastifyInstance } from 'fastify';

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

export interface HttpMappableDomainError {
  readonly httpMapping: {
    readonly statusCode: number;
    readonly code: string;
    readonly safeMessage: string;
  };
}

interface PostgreSqlError {
  readonly code?: unknown;
  readonly constraint_name?: unknown;
  readonly constraint?: unknown;
}

export function apiError(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function uuidValidationIssue(error: FastifyError): { path: string; message: string } | null {
  const validation = error.validation;
  if (!validation) {
    return null;
  }

  for (const issue of validation) {
    if (issue.keyword === 'format' && issue.params['format'] === 'uuid') {
      const context =
        typeof error.validationContext === 'string' ? error.validationContext : 'request';
      return {
        path: `${context}${issue.instancePath}`,
        message: 'must be a valid UUID',
      };
    }
  }

  return null;
}

function domainHttpMapping(error: unknown): HttpMappableDomainError['httpMapping'] | null {
  if (!(error instanceof Error) || !('httpMapping' in error)) {
    return null;
  }

  const mapping = (error as { readonly httpMapping?: unknown }).httpMapping;
  if (typeof mapping !== 'object' || mapping === null) {
    return null;
  }

  const candidate = mapping as {
    readonly statusCode?: unknown;
    readonly code?: unknown;
    readonly safeMessage?: unknown;
  };
  if (
    typeof candidate.statusCode !== 'number' ||
    !Number.isInteger(candidate.statusCode) ||
    candidate.statusCode < 400 ||
    candidate.statusCode > 599 ||
    typeof candidate.code !== 'string' ||
    !/^[A-Z][A-Z0-9_]*$/.test(candidate.code) ||
    typeof candidate.safeMessage !== 'string' ||
    candidate.safeMessage.trim() === ''
  ) {
    return null;
  }

  return {
    statusCode: candidate.statusCode,
    code: candidate.code,
    safeMessage: candidate.safeMessage,
  };
}

export function findPostgreSqlError(error: unknown): PostgreSqlError | null {
  const visited = new Set<unknown>();
  let current = error;

  while (
    typeof current === 'object' &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(current);
    const candidate = current as PostgreSqlError & { readonly cause?: unknown };

    if (typeof candidate.code === 'string') {
      return candidate;
    }

    current = candidate.cause;
  }

  return null;
}

export function isPostgreSqlConstraintError(
  error: unknown,
  code: string,
  constraint: string,
): boolean {
  const postgresError = findPostgreSqlError(error);
  const constraintName =
    postgresError?.constraint_name ?? postgresError?.constraint;

  return (
    postgresError?.code === code &&
    typeof constraintName === 'string' &&
    constraintName === constraint
  );
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const invalidUuid = uuidValidationIssue(error);
    if (invalidUuid !== null) {
      return reply.status(400).send(
        apiError('INVALID_IDENTIFIER', 'A request identifier is invalid.', {
          issues: [invalidUuid],
        }),
      );
    }

    if (
      error.validation ||
      error.code === 'FST_ERR_CTP_INVALID_JSON_BODY' ||
      error.statusCode === 400
    ) {
      return reply
        .status(400)
        .send(apiError('VALIDATION_ERROR', 'The request is invalid.'));
    }

    const domainMapping = domainHttpMapping(error);
    if (domainMapping !== null) {
      if (domainMapping.statusCode >= 500) {
        app.log.error({ err: error }, 'Mapped API infrastructure error');
      }
      return reply
        .status(domainMapping.statusCode)
        .send(apiError(domainMapping.code, domainMapping.safeMessage));
    }

    app.log.error({ err: error }, 'Unhandled API error');
    return reply
      .status(500)
      .send(apiError('INTERNAL_ERROR', 'An unexpected error occurred.'));
  });
}
