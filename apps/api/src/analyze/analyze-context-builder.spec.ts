import { describe, expect, it } from 'vitest';
import type { Application } from '../application/application.types.js';
import type { CandidateAggregate } from '../candidate/candidate.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { AnalyzeContextBuilder } from './analyze-context-builder.js';
import { AnalyzeContextError } from './analyze-context.errors.js';
import { AnalyzePromptBuilder } from './analyze-prompt.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const timestamp = new Date('2026-08-25T12:00:00.000Z');

function candidate(
  overrides: Partial<CandidateAggregate> = {},
): CandidateAggregate {
  return {
    id: '20000000-0000-4000-8000-000000000000',
    fullName: 'Ada Lovelace',
    headline: 'Backend systems engineer',
    summaryMarkdown: 'Builds reliable distributed systems.',
    linkedinUrl: 'https://linkedin.example/ada',
    githubUrl: 'https://github.example/ada',
    portfolioUrl: 'https://portfolio.example/ada',
    location: 'Santiago, Chile',
    targetRoles: ['Staff Backend Engineer', 'Platform Engineer'],
    targetLocations: ['Remote', 'Santiago'],
    careerGoalsMarkdown: 'Grow into technical leadership.',
    cvMarkdown: '# CV\nBackend engineering experience.',
    additionalContext: 'Available for remote-first teams.',
    createdAt: timestamp,
    updatedAt: timestamp,
    experiences: [
      {
        id: '31000000-0000-4000-8000-000000000000',
        organization: 'Second Systems',
        role: 'Senior Engineer',
        location: 'Remote',
        startDate: '2023-01-01',
        endDate: null,
        descriptionMarkdown: 'Led TypeScript platform development.',
        sortOrder: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: '30000000-0000-4000-8000-000000000000',
        organization: 'First Systems',
        role: 'Software Engineer',
        location: 'Santiago',
        startDate: '2020-01-01',
        endDate: '2022-12-31',
        descriptionMarkdown: 'Built PostgreSQL-backed services.',
        sortOrder: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    education: [
      {
        id: '40000000-0000-4000-8000-000000000000',
        institution: 'University of Chile',
        degree: 'BSc Computer Science',
        fieldOfStudy: 'Distributed Systems',
        location: 'Santiago',
        startDate: '2015-03-01',
        endDate: '2019-12-01',
        descriptionMarkdown: 'Studied algorithms and systems.',
        sortOrder: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    projects: [
      {
        id: '50000000-0000-4000-8000-000000000000',
        name: 'Queue Monitor',
        role: 'Maintainer',
        descriptionMarkdown: 'Observability tooling for distributed queues.',
        projectUrl: 'https://project.example/queue-monitor',
        repositoryUrl: 'https://github.example/queue-monitor',
        startDate: '2024-01-01',
        endDate: null,
        technologies: ['TypeScript', 'PostgreSQL'],
        sortOrder: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    skills: [
      {
        id: '60000000-0000-4000-8000-000000000000',
        name: 'PostgreSQL',
        category: 'DATABASE',
        level: 'ADVANCED',
        notes: 'Query design and operations.',
        sortOrder: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: '61000000-0000-4000-8000-000000000000',
        name: 'TypeScript',
        category: 'PROGRAMMING_LANGUAGE',
        level: 'EXPERT',
        notes: null,
        sortOrder: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    languages: [
      {
        id: '70000000-0000-4000-8000-000000000000',
        language: 'Spanish',
        level: 'Native',
        certification: null,
        notes: null,
        sortOrder: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: '71000000-0000-4000-8000-000000000000',
        language: 'English',
        level: 'Professional',
        certification: 'C2 certificate',
        notes: 'Daily professional use.',
        sortOrder: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    ...overrides,
  };
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: applicationId,
    companyName: 'Analytical Engines Ltd',
    roleTitle: 'Staff Backend Engineer',
    location: 'Remote — Chile',
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
    id: '80000000-0000-4000-8000-000000000000',
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

describe('AnalyzeContextBuilder', () => {
  const builder = new AnalyzeContextBuilder();

  it('includes only approved Candidate, Application, and Job Description source fields', () => {
    const context = builder.build({
      candidate: candidate(),
      application: application(),
      jobDescription: jobDescription(),
    });

    expect(context).toEqual({
      candidate: {
        fullName: 'Ada Lovelace',
        headline: 'Backend systems engineer',
        summaryMarkdown: 'Builds reliable distributed systems.',
        location: 'Santiago, Chile',
        targetRoles: ['Staff Backend Engineer', 'Platform Engineer'],
        targetLocations: ['Remote', 'Santiago'],
        careerGoalsMarkdown: 'Grow into technical leadership.',
        cvMarkdown: '# CV\nBackend engineering experience.',
        additionalContext: 'Available for remote-first teams.',
        experiences: [
          {
            organization: 'First Systems',
            role: 'Software Engineer',
            location: 'Santiago',
            startDate: '2020-01-01',
            endDate: '2022-12-31',
            descriptionMarkdown: 'Built PostgreSQL-backed services.',
          },
          {
            organization: 'Second Systems',
            role: 'Senior Engineer',
            location: 'Remote',
            startDate: '2023-01-01',
            endDate: null,
            descriptionMarkdown: 'Led TypeScript platform development.',
          },
        ],
        education: [
          {
            institution: 'University of Chile',
            degree: 'BSc Computer Science',
            fieldOfStudy: 'Distributed Systems',
            location: 'Santiago',
            startDate: '2015-03-01',
            endDate: '2019-12-01',
            descriptionMarkdown: 'Studied algorithms and systems.',
          },
        ],
        projects: [
          {
            name: 'Queue Monitor',
            role: 'Maintainer',
            descriptionMarkdown: 'Observability tooling for distributed queues.',
            startDate: '2024-01-01',
            endDate: null,
            technologies: ['TypeScript', 'PostgreSQL'],
          },
        ],
        skills: [
          {
            name: 'TypeScript',
            category: 'PROGRAMMING_LANGUAGE',
            level: 'EXPERT',
            notes: null,
          },
          {
            name: 'PostgreSQL',
            category: 'DATABASE',
            level: 'ADVANCED',
            notes: 'Query design and operations.',
          },
        ],
        languages: [
          {
            language: 'English',
            level: 'Professional',
            certification: 'C2 certificate',
            notes: 'Daily professional use.',
          },
          {
            language: 'Spanish',
            level: 'Native',
            certification: null,
            notes: null,
          },
        ],
      },
      application: {
        companyName: 'Analytical Engines Ltd',
        roleTitle: 'Staff Backend Engineer',
        location: 'Remote — Chile',
        source: 'CAREER_PAGE',
        jobUrl: 'https://jobs.example/staff-backend',
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

  it('excludes priority, prior AI state, generated artifacts, usage metadata, and derived Job Description data', () => {
    const excludedSentinels = [
      'APPLICATION_NOTES_SENTINEL',
      'PREVIOUS_SCORE_SENTINEL',
      'PREVIOUS_ANALYSIS_SENTINEL',
      'GENERATED_DOCUMENT_SENTINEL',
      'RESEARCH_SENTINEL',
      'USAGE_SENTINEL',
      'STRUCTURED_DATA_SENTINEL',
      'PROFILE_LINK_SENTINEL',
      'PROJECT_LINK_SENTINEL',
    ];
    const enrichedSources = {
      candidate: {
        ...candidate({
          linkedinUrl: 'PROFILE_LINK_SENTINEL',
          projects: [
            {
              ...candidate().projects[0]!,
              projectUrl: 'PROJECT_LINK_SENTINEL',
            },
          ],
        }),
        generatedDocuments: ['GENERATED_DOCUMENT_SENTINEL'],
      },
      application: {
        ...application({ notesMarkdown: 'APPLICATION_NOTES_SENTINEL' }),
        previousSuggestedScore: 'PREVIOUS_SCORE_SENTINEL',
      },
      jobDescription: jobDescription({
        structuredData: { value: 'STRUCTURED_DATA_SENTINEL' },
      }),
      previousJobAnalysis: 'PREVIOUS_ANALYSIS_SENTINEL',
      research: 'RESEARCH_SENTINEL',
      aiUsage: 'USAGE_SENTINEL',
    };

    const context = builder.build(enrichedSources);
    const serializedContext = JSON.stringify(context);
    const serializedPrompt = JSON.stringify(
      new AnalyzePromptBuilder().build(context),
    );

    expect(context.application).not.toHaveProperty('priority');
    expect(context.application).not.toHaveProperty('status');
    expect(context.application).not.toHaveProperty('notesMarkdown');
    expect(context.jobDescription).not.toHaveProperty('structuredData');
    expect(context.candidate).not.toHaveProperty('linkedinUrl');
    expect(serializedContext).not.toContain('"priority"');
    expect(serializedPrompt).not.toContain('CRITICAL');
    for (const sentinel of excludedSentinels) {
      expect(serializedContext).not.toContain(sentinel);
      expect(serializedPrompt).not.toContain(sentinel);
    }
  });

  it.each([
    {
      field: 'candidate',
      sources: {
        candidate: null,
        application: application(),
        jobDescription: jobDescription(),
      },
      code: 'CANDIDATE_PROFILE_UNAVAILABLE',
    },
    {
      field: 'application',
      sources: {
        candidate: candidate(),
        application: undefined,
        jobDescription: jobDescription(),
      },
      code: 'APPLICATION_UNAVAILABLE',
    },
    {
      field: 'jobDescription',
      sources: {
        candidate: candidate(),
        application: application(),
        jobDescription: null,
      },
      code: 'JOB_DESCRIPTION_UNAVAILABLE',
    },
  ] as const)('rejects a missing mandatory $field source', ({ sources, code }) => {
    expect(() => builder.build(sources)).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it('rejects a Job Description owned by another Application', () => {
    expect(() =>
      builder.build({
        candidate: candidate(),
        application: application(),
        jobDescription: jobDescription({
          applicationId: '90000000-0000-4000-8000-000000000000',
        }),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AnalyzeContextError>>({
        code: 'INVALID_SOURCE_CONTEXT',
      }),
    );
  });

  it('normalizes absent optional fields to null and absent collections to empty arrays', () => {
    const candidateWithAbsentValues = {
      ...candidate({
        headline: null,
        summaryMarkdown: null,
        location: null,
        targetRoles: [],
        targetLocations: [],
        careerGoalsMarkdown: null,
        cvMarkdown: null,
        additionalContext: null,
        experiences: [],
        education: [],
        projects: [],
        skills: [],
        languages: [],
      }),
      headline: undefined,
      additionalContext: undefined,
    } as unknown as CandidateAggregate;
    const jobDescriptionWithAbsentValues = {
      ...jobDescription({
        title: null,
        companyName: null,
        requirementsMarkdown: null,
        responsibilitiesMarkdown: null,
        sourceUrl: null,
      }),
      requirementsMarkdown: undefined,
    } as unknown as JobDescription;

    const context = builder.build({
      candidate: candidateWithAbsentValues,
      application: application({ location: null, jobUrl: null }),
      jobDescription: jobDescriptionWithAbsentValues,
    });

    expect(context.candidate).toMatchObject({
      headline: null,
      additionalContext: null,
      targetRoles: [],
      targetLocations: [],
      experiences: [],
      education: [],
      projects: [],
      skills: [],
      languages: [],
    });
    expect(context.application).toMatchObject({ location: null, jobUrl: null });
    expect(context.jobDescription).toMatchObject({
      title: null,
      companyName: null,
      requirementsMarkdown: null,
      responsibilitiesMarkdown: null,
      sourceUrl: null,
    });
  });

  it('applies repository-defined deterministic collection ordering without mutating sources', () => {
    const firstCandidate = candidate();
    const secondCandidate = candidate({
      experiences: [...firstCandidate.experiences].reverse(),
      education: [...firstCandidate.education].reverse(),
      projects: [...firstCandidate.projects].reverse(),
      skills: [...firstCandidate.skills].reverse(),
      languages: [...firstCandidate.languages].reverse(),
    });
    const originalSkillOrder = secondCandidate.skills.map(({ name }) => name);

    const first = builder.build({
      candidate: firstCandidate,
      application: application(),
      jobDescription: jobDescription(),
    });
    const second = builder.build({
      candidate: secondCandidate,
      application: application(),
      jobDescription: jobDescription(),
    });

    expect(second).toEqual(first);
    expect(secondCandidate.skills.map(({ name }) => name)).toEqual(
      originalSkillOrder,
    );
  });
});
