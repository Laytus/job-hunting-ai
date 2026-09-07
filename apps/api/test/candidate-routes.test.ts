import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { CandidateChildOwnershipConflictError } from '../src/candidate/candidate.errors.js';
import type { CandidateService } from '../src/candidate/candidate.routes.js';
import {
  CandidateProfileService,
  type CandidateRepository,
  type CandidateReplacementResult,
  type CandidateWithContext,
} from '../src/candidate/candidate.service.js';
import type {
  CandidateAggregate,
  CandidateReplacementCommand,
} from '../src/candidate/candidate.types.js';

const profileId = '10000000-0000-4000-8000-000000000000';
const experienceId = '11000000-0000-4000-8000-000000000000';
const educationId = '12000000-0000-4000-8000-000000000000';
const projectId = '13000000-0000-4000-8000-000000000000';
const skillId = '14000000-0000-4000-8000-000000000000';
const languageId = '15000000-0000-4000-8000-000000000000';
const createdAt = new Date('2026-01-01T10:00:00.000Z');
const updatedAt = new Date('2026-01-02T10:00:00.000Z');
const newestContextTimestamp = new Date('2026-01-08T10:00:00.000Z');

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

function candidateAggregate(): CandidateAggregate {
  return {
    id: profileId,
    fullName: 'Ada Lovelace',
    headline: null,
    summaryMarkdown: '# Summary',
    linkedinUrl: 'https://www.linkedin.com/in/ada',
    githubUrl: null,
    portfolioUrl: 'https://ada.example.com',
    location: 'London',
    targetRoles: ['Staff Engineer'],
    targetLocations: [],
    careerGoalsMarkdown: null,
    cvMarkdown: '# CV',
    additionalContext: null,
    createdAt,
    updatedAt,
    experiences: [
      {
        id: experienceId,
        organization: 'Analytical Engines Ltd',
        role: 'Engineer',
        location: null,
        startDate: '2020-01-01',
        endDate: null,
        descriptionMarkdown: null,
        sortOrder: 0,
        createdAt,
        updatedAt: new Date('2026-01-03T10:00:00.000Z'),
      },
    ],
    education: [
      {
        id: educationId,
        institution: 'University of London',
        degree: 'Mathematics',
        fieldOfStudy: null,
        location: null,
        startDate: '2016-01-01',
        endDate: '2020-01-01',
        descriptionMarkdown: null,
        sortOrder: 0,
        createdAt,
        updatedAt: new Date('2026-01-04T10:00:00.000Z'),
      },
    ],
    projects: [
      {
        id: projectId,
        name: 'Analytical Engine Notes',
        role: null,
        descriptionMarkdown: '# Project',
        projectUrl: null,
        repositoryUrl: 'https://github.com/ada/engine',
        startDate: null,
        endDate: null,
        technologies: [],
        sortOrder: 0,
        createdAt,
        updatedAt: newestContextTimestamp,
      },
    ],
    skills: [
      {
        id: skillId,
        name: 'TypeScript',
        category: 'PROGRAMMING_LANGUAGE',
        level: null,
        notes: null,
        sortOrder: 0,
        createdAt,
        updatedAt: new Date('2026-01-06T10:00:00.000Z'),
      },
    ],
    languages: [
      {
        id: languageId,
        language: 'English',
        level: 'Professional',
        certification: null,
        notes: null,
        sortOrder: 0,
        createdAt,
        updatedAt: new Date('2026-01-07T10:00:00.000Z'),
      },
    ],
  };
}

function updateCandidateRequest(
  overrides: Partial<CandidateReplacementCommand> = {},
): CandidateReplacementCommand {
  return {
    fullName: 'Ada Lovelace',
    headline: null,
    summaryMarkdown: '# Summary',
    linkedinUrl: 'https://www.linkedin.com/in/ada',
    githubUrl: null,
    portfolioUrl: 'https://ada.example.com',
    location: 'London',
    targetRoles: ['Staff Engineer'],
    targetLocations: [],
    careerGoalsMarkdown: null,
    cvMarkdown: '# CV',
    additionalContext: null,
    experiences: [],
    education: [],
    projects: [],
    skills: [],
    languages: [],
    ...overrides,
  };
}

class FakeCandidateService implements CandidateService {
  candidateToGet: CandidateWithContext | null = null;
  getError: unknown;
  replacementResult: CandidateReplacementResult | null = null;
  replacementError: unknown;
  readonly replacementCommands: CandidateReplacementCommand[] = [];

  async getCandidate(): Promise<CandidateWithContext | null> {
    if (this.getError !== undefined) {
      throw this.getError;
    }
    return this.candidateToGet;
  }

  async replaceCandidate(command: CandidateReplacementCommand): Promise<CandidateReplacementResult> {
    this.replacementCommands.push(command);
    if (this.replacementError !== undefined) {
      throw this.replacementError;
    }
    if (this.replacementResult === null) {
      throw new Error('Fake Candidate service replacement result was not configured.');
    }
    return this.replacementResult;
  }
}

function buildCandidateApp(service: CandidateService) {
  const app = buildApp({ candidateService: service });
  apps.push(app);
  return app;
}

describe('Candidate API routes', () => {
  it('returns the singleton empty state from GET /api/v1/candidate', async () => {
    const app = buildCandidateApp(new FakeCandidateService());

    const response = await app.inject({ method: 'GET', url: '/api/v1/candidate' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ candidate: null });
  });

  it('allows GET Candidate domain errors to reach centralized mapping', async () => {
    const service = new FakeCandidateService();
    service.getError = new CandidateChildOwnershipConflictError('experiences', experienceId);
    const app = buildCandidateApp(service);

    const response = await app.inject({ method: 'GET', url: '/api/v1/candidate' });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'The Candidate update conflicts with existing data.',
      },
    });
    expect(response.body).not.toContain(experienceId);
  });

  it('serializes a populated aggregate through the real Candidate service seam', async () => {
    const stored = candidateAggregate();
    const repository: CandidateRepository = {
      loadAggregate: async () => stored,
      replaceAggregate: async () => ({ created: false, aggregate: stored }),
    };
    const app = buildCandidateApp(new CandidateProfileService(repository));

    const response = await app.inject({ method: 'GET', url: '/api/v1/candidate' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      candidate: {
        id: profileId,
        fullName: 'Ada Lovelace',
        headline: null,
        summaryMarkdown: '# Summary',
        linkedinUrl: 'https://www.linkedin.com/in/ada',
        githubUrl: null,
        portfolioUrl: 'https://ada.example.com',
        location: 'London',
        targetRoles: ['Staff Engineer'],
        targetLocations: [],
        careerGoalsMarkdown: null,
        cvMarkdown: '# CV',
        additionalContext: null,
        experiences: [
          {
            id: experienceId,
            organization: 'Analytical Engines Ltd',
            role: 'Engineer',
            location: null,
            startDate: '2020-01-01',
            endDate: null,
            descriptionMarkdown: null,
            sortOrder: 0,
            createdAt: createdAt.toISOString(),
            updatedAt: '2026-01-03T10:00:00.000Z',
          },
        ],
        education: [
          {
            id: educationId,
            institution: 'University of London',
            degree: 'Mathematics',
            fieldOfStudy: null,
            location: null,
            startDate: '2016-01-01',
            endDate: '2020-01-01',
            descriptionMarkdown: null,
            sortOrder: 0,
            createdAt: createdAt.toISOString(),
            updatedAt: '2026-01-04T10:00:00.000Z',
          },
        ],
        projects: [
          {
            id: projectId,
            name: 'Analytical Engine Notes',
            role: null,
            descriptionMarkdown: '# Project',
            projectUrl: null,
            repositoryUrl: 'https://github.com/ada/engine',
            startDate: null,
            endDate: null,
            technologies: [],
            sortOrder: 0,
            createdAt: createdAt.toISOString(),
            updatedAt: newestContextTimestamp.toISOString(),
          },
        ],
        skills: [
          {
            id: skillId,
            name: 'TypeScript',
            category: 'PROGRAMMING_LANGUAGE',
            level: null,
            notes: null,
            sortOrder: 0,
            createdAt: createdAt.toISOString(),
            updatedAt: '2026-01-06T10:00:00.000Z',
          },
        ],
        languages: [
          {
            id: languageId,
            language: 'English',
            level: 'Professional',
            certification: null,
            notes: null,
            sortOrder: 0,
            createdAt: createdAt.toISOString(),
            updatedAt: '2026-01-07T10:00:00.000Z',
          },
        ],
        candidateContextUpdatedAt: newestContextTimestamp.toISOString(),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
    });
  });

  it('returns 201, Location, and the created Candidate from PUT', async () => {
    const service = new FakeCandidateService();
    const stored = candidateAggregate();
    service.replacementResult = {
      created: true,
      candidate: stored,
      candidateContextUpdatedAt: newestContextTimestamp,
    };
    const app = buildCandidateApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: updateCandidateRequest(),
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe('/api/v1/candidate');
    expect(response.json()).toMatchObject({
      candidate: {
        id: profileId,
        candidateContextUpdatedAt: newestContextTimestamp.toISOString(),
      },
    });
  });

  it('returns 200 without Location when PUT replaces the Candidate', async () => {
    const service = new FakeCandidateService();
    const stored = candidateAggregate();
    service.replacementResult = {
      created: false,
      candidate: stored,
      candidateContextUpdatedAt: newestContextTimestamp,
    };
    const app = buildCandidateApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: updateCandidateRequest(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.location).toBeUndefined();
  });

  it('accepts required child collections as empty arrays', async () => {
    const service = new FakeCandidateService();
    const stored = candidateAggregate();
    service.replacementResult = {
      created: false,
      candidate: stored,
      candidateContextUpdatedAt: newestContextTimestamp,
    };
    const app = buildCandidateApp(service);
    const payload = updateCandidateRequest();

    const response = await app.inject({ method: 'PUT', url: '/api/v1/candidate', payload });

    expect(response.statusCode).toBe(200);
    expect(service.replacementCommands).toEqual([payload]);
  });

  it('maps malformed child UUIDs to INVALID_IDENTIFIER before calling the service', async () => {
    const service = new FakeCandidateService();
    const app = buildCandidateApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: updateCandidateRequest({
        experiences: [
          {
            id: 'not-a-uuid',
            organization: 'Analytical Engines Ltd',
            role: 'Engineer',
            location: null,
            startDate: '2020-01-01',
            endDate: null,
            descriptionMarkdown: null,
            sortOrder: 0,
          },
        ],
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_IDENTIFIER',
        message: 'A request identifier is invalid.',
        details: {
          issues: [{ path: 'body/experiences/0/id', message: 'must be a valid UUID' }],
        },
      },
    });
    expect(service.replacementCommands).toEqual([]);
  });

  it('rejects non-HTTP URLs as validation failures', async () => {
    const service = new FakeCandidateService();
    const app = buildCandidateApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: updateCandidateRequest({ linkedinUrl: 'ftp://example.com/profile' }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
    });
    expect(service.replacementCommands).toEqual([]);
  });

  it('rejects impossible calendar dates at the HTTP boundary', async () => {
    const service = new FakeCandidateService();
    const app = buildCandidateApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: updateCandidateRequest({
        experiences: [
          {
            organization: 'Analytical Engines Ltd',
            role: 'Engineer',
            location: null,
            startDate: '2026-02-30',
            endDate: null,
            descriptionMarkdown: null,
            sortOrder: 0,
          },
        ],
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(service.replacementCommands).toEqual([]);
  });

  it('rejects invalid Candidate enum values', async () => {
    const service = new FakeCandidateService();
    const app = buildCandidateApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: {
        ...updateCandidateRequest(),
        skills: [
          {
            name: 'TypeScript',
            category: 'INVALID_CATEGORY',
            level: null,
            notes: null,
            sortOrder: 0,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(service.replacementCommands).toEqual([]);
  });

  it('rejects unknown request properties', async () => {
    const service = new FakeCandidateService();
    const app = buildCandidateApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: { ...updateCandidateRequest(), unexpected: 'value' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(service.replacementCommands).toEqual([]);
  });

  it('returns a safe conflict envelope for Candidate ownership errors', async () => {
    const service = new FakeCandidateService();
    service.replacementError = new CandidateChildOwnershipConflictError(
      'experiences',
      experienceId,
    );
    const app = buildCandidateApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: updateCandidateRequest(),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'The Candidate update conflicts with existing data.',
      },
    });
    expect(response.body).not.toContain(experienceId);
  });

  it('redacts unexpected Candidate service failures', async () => {
    const service = new FakeCandidateService();
    service.replacementError = new Error('postgresql://user:secret@localhost/private');
    const app = buildCandidateApp(service);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: updateCandidateRequest(),
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(response.body).not.toContain('secret');
    expect(response.body).not.toContain('stack');
  });

  it('keeps health and app construction PostgreSQL-independent without DATABASE_URL', async () => {
    const previousDatabaseUrl = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    try {
      const app = buildApp();
      apps.push(app);
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/api/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    } finally {
      if (previousDatabaseUrl === undefined) {
        delete process.env['DATABASE_URL'];
      } else {
        process.env['DATABASE_URL'] = previousDatabaseUrl;
      }
    }
  });
});
