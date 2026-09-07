import { describe, expect, it } from 'vitest';
import { developmentSeedData, developmentSeedMarker } from '../src/seed/development-seed.data.js';
import {
  DevelopmentSeedSafetyError,
  getDevelopmentSeedDatabaseUrl,
} from '../src/seed/development-seed.js';

const developmentUrl =
  'postgresql://job_hunting_ai:job_hunting_ai@localhost:5432/job_hunting_ai';

describe('development seed safety', () => {
  it('accepts an explicit or implicit local development environment', () => {
    expect(
      getDevelopmentSeedDatabaseUrl({
        NODE_ENV: 'development',
        DATABASE_URL: developmentUrl,
      }),
    ).toBe(developmentUrl);
    expect(getDevelopmentSeedDatabaseUrl({ DATABASE_URL: developmentUrl })).toBe(
      developmentUrl,
    );
  });

  it.each([
    {
      label: 'production execution',
      environment: { NODE_ENV: 'production', DATABASE_URL: developmentUrl },
    },
    {
      label: 'test execution',
      environment: { NODE_ENV: 'test', DATABASE_URL: developmentUrl },
    },
    {
      label: 'continuous integration',
      environment: { CI: 'true', DATABASE_URL: developmentUrl },
    },
    {
      label: 'a remote database',
      environment: {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://user:password@db.example.com:5432/job_hunting_ai',
      },
    },
    {
      label: 'a test database',
      environment: {
        NODE_ENV: 'development',
        DATABASE_URL:
          'postgresql://job_hunting_ai:job_hunting_ai@localhost:5432/job_hunting_ai_test',
      },
    },
    {
      label: 'a maintenance database',
      environment: {
        NODE_ENV: 'development',
        DATABASE_URL:
          'postgresql://job_hunting_ai:job_hunting_ai@localhost:5432/postgres',
      },
    },
    {
      label: 'the configured test target',
      environment: {
        NODE_ENV: 'development',
        DATABASE_URL: developmentUrl,
        DATABASE_TEST_URL: developmentUrl,
      },
    },
  ])('rejects $label', ({ environment }) => {
    expect(() => getDevelopmentSeedDatabaseUrl(environment)).toThrow(
      DevelopmentSeedSafetyError,
    );
  });

  it('requires DATABASE_URL', () => {
    expect(() =>
      getDevelopmentSeedDatabaseUrl({ NODE_ENV: 'development' }),
    ).toThrow('DATABASE_URL is required');
  });
});

describe('development seed ownership data', () => {
  it('uses unique deterministic identifiers across every managed entity', () => {
    const identifiers = [
      developmentSeedData.candidateProfile.id,
      ...developmentSeedData.candidateExperiences.map(({ id }) => id),
      ...developmentSeedData.candidateEducation.map(({ id }) => id),
      ...developmentSeedData.candidateProjects.map(({ id }) => id),
      ...developmentSeedData.candidateSkills.map(({ id }) => id),
      ...developmentSeedData.candidateLanguages.map(({ id }) => id),
      ...developmentSeedData.applications.map(({ id }) => id),
      ...developmentSeedData.jobDescriptions.map(({ id }) => id),
      ...developmentSeedData.interviews.map(({ id }) => id),
      ...developmentSeedData.applicationEvents.map(({ id }) => id),
    ];

    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it('marks every seed-owned root that may be reset', () => {
    expect(developmentSeedData.candidateProfile.additionalContext).toContain(
      developmentSeedMarker,
    );
    expect(
      developmentSeedData.applications.every(({ notesMarkdown }) =>
        notesMarkdown?.includes(developmentSeedMarker),
      ),
    ).toBe(true);
  });
});
