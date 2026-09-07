import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  CandidateChildOwnershipConflictError,
  CandidateNaturalKeyConflictError,
  DuplicateCandidateChildIdentifierError,
  InvalidCandidateDataError,
  InvalidCandidateIdentifierError,
} from '../src/candidate/candidate.errors.js';

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('API error handling', () => {
  async function injectError(error: Error) {
    const app = buildApp();
    apps.push(app);
    app.get('/test/domain-error', async () => {
      throw error;
    });

    return app.inject({ method: 'GET', url: '/test/domain-error' });
  }

  it('maps Candidate validation errors through generic domain metadata', async () => {
    for (const error of [
      new InvalidCandidateDataError('internal validation detail', [
        { path: 'experiences[0].endDate', message: 'internal issue' },
      ]),
      new DuplicateCandidateChildIdentifierError(
        'experiences',
        '11000000-0000-4000-8000-000000000000',
      ),
    ]) {
      const response = await injectError(error);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request is invalid.',
        },
      });
      expect(response.body).not.toContain('internal');
      expect(response.body).not.toContain('11000000-0000-4000-8000-000000000000');
    }
  });

  it('maps Candidate identifier errors through generic domain metadata', async () => {
    const response = await injectError(
      new InvalidCandidateIdentifierError('body.experiences[0].id'),
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_IDENTIFIER',
        message: 'A Candidate identifier is invalid.',
      },
    });
    expect(response.body).not.toContain('experiences');
  });

  it('maps Candidate ownership and natural-key conflicts through generic metadata', async () => {
    for (const error of [
      new CandidateChildOwnershipConflictError(
        'experiences',
        '11000000-0000-4000-8000-000000000000',
      ),
      new CandidateNaturalKeyConflictError('skills'),
    ]) {
      const response = await injectError(error);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        error: {
          code: 'CONFLICT',
          message: 'The Candidate update conflicts with existing data.',
        },
      });
      expect(response.body).not.toContain('skills');
      expect(response.body).not.toContain('11000000-0000-4000-8000-000000000000');
      expect(response.body).not.toContain('stack');
    }
  });

  it('supports safe structurally mapped infrastructure errors', async () => {
    const error = Object.assign(new Error('private infrastructure detail'), {
      httpMapping: {
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        safeMessage: 'The service is temporarily unavailable.',
      },
    });
    const response = await injectError(error);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is temporarily unavailable.',
      },
    });
    expect(response.body).not.toContain('private infrastructure detail');
  });

  it('does not expose unexpected error details', async () => {
    const app = buildApp();
    apps.push(app);
    app.get('/test/unexpected-error', async () => {
      throw new Error('postgresql://user:secret@localhost/private');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test/unexpected-error',
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(response.body).not.toContain('secret');
  });

  it('normalizes Fastify validation failures', async () => {
    const app = buildApp();
    apps.push(app);
    app.post(
      '/test/validated',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['value'],
            properties: { value: { type: 'string', minLength: 1 } },
          },
        },
      },
      async () => ({ status: 'ok' }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/test/validated',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
      },
    });
  });
});
