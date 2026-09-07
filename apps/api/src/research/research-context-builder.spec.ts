import { describe, expect, it } from 'vitest';
import type { Application } from '../application/application.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { ResearchContextBuilder } from './research-context-builder.js';
import { ResearchContextError } from './research-context.errors.js';
import { ResearchPromptBuilder } from './research-prompt.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const timestamp = new Date('2026-08-26T12:00:00.000Z');

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: applicationId,
    companyName: 'Analytical Engines Ltd',
    roleTitle: 'Staff Backend Engineer',
    location: 'Paris, France',
    jobUrl: 'https://jobs.example/staff-backend',
    source: 'CAREER_PAGE',
    status: 'FOUND',
    priority: 'CRITICAL',
    dateFound: '2026-08-20',
    dateApplied: null,
    notesMarkdown: 'Private application notes.',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function jobDescription(
  overrides: Partial<JobDescription> = {},
): JobDescription {
  return {
    id: '20000000-0000-4000-8000-000000000000',
    applicationId,
    title: 'Staff Backend Engineer',
    companyName: 'Analytical Engines Ltd',
    descriptionMarkdown: '# Role\nBuild reliable distributed services.',
    requirementsMarkdown: '- Advanced TypeScript\n- PostgreSQL',
    responsibilitiesMarkdown: '- Lead backend architecture',
    structuredData: { extractedSkill: 'derived-value' },
    sourceUrl: 'https://jobs.example/staff-backend',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('ResearchContextBuilder', () => {
  const builder = new ResearchContextBuilder();

  it('includes only approved Application and Job Description source fields', () => {
    expect(
      builder.build({
        application: application(),
        jobDescription: jobDescription(),
      }),
    ).toEqual({
      application: {
        companyName: 'Analytical Engines Ltd',
        roleTitle: 'Staff Backend Engineer',
        location: 'Paris, France',
        jobUrl: 'https://jobs.example/staff-backend',
        source: 'CAREER_PAGE',
      },
      jobDescription: {
        title: 'Staff Backend Engineer',
        companyName: 'Analytical Engines Ltd',
        descriptionMarkdown: '# Role\nBuild reliable distributed services.',
        requirementsMarkdown: '- Advanced TypeScript\n- PostgreSQL',
        responsibilitiesMarkdown: '- Lead backend architecture',
        sourceUrl: 'https://jobs.example/staff-backend',
      },
    });
  });

  it('excludes persistence metadata and every disallowed upstream domain', () => {
    const sentinels = [
      'PRIVATE_NOTES_SENTINEL',
      'DERIVED_JD_SENTINEL',
      'CANDIDATE_SENTINEL',
      'ANALYZE_SENTINEL',
      'PREVIOUS_RESEARCH_SENTINEL',
      'DOCUMENT_SENTINEL',
      'INTERVIEW_SENTINEL',
      'EVENT_SENTINEL',
      'USAGE_SENTINEL',
    ];
    const sources = {
      application: {
        ...application({ notesMarkdown: 'PRIVATE_NOTES_SENTINEL' }),
        candidate: 'CANDIDATE_SENTINEL',
        analyze: 'ANALYZE_SENTINEL',
      },
      jobDescription: jobDescription({
        structuredData: { value: 'DERIVED_JD_SENTINEL' },
      }),
      previousResearch: 'PREVIOUS_RESEARCH_SENTINEL',
      documents: 'DOCUMENT_SENTINEL',
      interviews: 'INTERVIEW_SENTINEL',
      applicationEvents: 'EVENT_SENTINEL',
      aiUsage: 'USAGE_SENTINEL',
    };

    const context = builder.build(sources);
    const serializedContext = JSON.stringify(context);
    const serializedPrompt = JSON.stringify(
      new ResearchPromptBuilder().build(context),
    );

    expect(context.application).not.toHaveProperty('id');
    expect(context.application).not.toHaveProperty('status');
    expect(context.application).not.toHaveProperty('priority');
    expect(context.application).not.toHaveProperty('notesMarkdown');
    expect(context.jobDescription).not.toHaveProperty('id');
    expect(context.jobDescription).not.toHaveProperty('applicationId');
    expect(context.jobDescription).not.toHaveProperty('structuredData');
    for (const sentinel of sentinels) {
      expect(serializedContext).not.toContain(sentinel);
      expect(serializedPrompt).not.toContain(sentinel);
    }
  });

  it.each([
    {
      field: 'Application',
      sources: { application: undefined, jobDescription: jobDescription() },
      code: 'APPLICATION_UNAVAILABLE',
    },
    {
      field: 'Job Description',
      sources: { application: application(), jobDescription: null },
      code: 'JOB_DESCRIPTION_UNAVAILABLE',
    },
  ] as const)('rejects a missing $field', ({ sources, code }) => {
    expect(() => builder.build(sources)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('rejects a Job Description owned by another Application', () => {
    expect(() =>
      builder.build({
        application: application(),
        jobDescription: jobDescription({
          applicationId: '30000000-0000-4000-8000-000000000000',
        }),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ResearchContextError>>({
        code: 'INVALID_SOURCE_CONTEXT',
      }),
    );
  });

  it('normalizes optional undefined values to null', () => {
    const applicationWithUndefined = {
      ...application({ location: null, jobUrl: null }),
      location: undefined,
      jobUrl: undefined,
    } as unknown as Application;
    const jobDescriptionWithUndefined = {
      ...jobDescription({
        title: null,
        companyName: null,
        requirementsMarkdown: null,
        responsibilitiesMarkdown: null,
        sourceUrl: null,
      }),
      title: undefined,
      requirementsMarkdown: undefined,
    } as unknown as JobDescription;

    const context = builder.build({
      application: applicationWithUndefined,
      jobDescription: jobDescriptionWithUndefined,
    });

    expect(context.application.location).toBeNull();
    expect(context.application.jobUrl).toBeNull();
    expect(context.jobDescription).toMatchObject({
      title: null,
      companyName: null,
      requirementsMarkdown: null,
      responsibilitiesMarkdown: null,
      sourceUrl: null,
    });
  });

  it('preserves source Markdown, does not mutate inputs, and is deterministic', () => {
    const sourceApplication = application();
    const sourceJobDescription = jobDescription({
      descriptionMarkdown: '  # Exact heading\n\nKeep trailing space.  ',
      requirementsMarkdown: '\n- Requirement\n',
    });
    const applicationSnapshot = { ...sourceApplication };
    const jobDescriptionSnapshot = { ...sourceJobDescription };

    const first = builder.build({
      application: sourceApplication,
      jobDescription: sourceJobDescription,
    });
    const second = builder.build({
      application: sourceApplication,
      jobDescription: sourceJobDescription,
    });

    expect(first).toEqual(second);
    expect(first.jobDescription.descriptionMarkdown).toBe(
      '  # Exact heading\n\nKeep trailing space.  ',
    );
    expect(first.jobDescription.requirementsMarkdown).toBe(
      '\n- Requirement\n',
    );
    expect(sourceApplication).toEqual(applicationSnapshot);
    expect(sourceJobDescription).toEqual(jobDescriptionSnapshot);
  });
});
