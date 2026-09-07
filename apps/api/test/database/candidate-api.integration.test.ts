import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { buildApp } from '../../src/app.js';
import * as schema from '../../src/db/schema.js';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface TimestampedResource {
  id: string;
  createdAt: string;
  updatedAt: string;
}

interface CandidateExperienceResponse extends TimestampedResource {
  organization: string;
  role: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  descriptionMarkdown: string | null;
  sortOrder: number;
}

interface CandidateEducationResponse extends TimestampedResource {
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  location: string | null;
  startDate: string;
  endDate: string | null;
  descriptionMarkdown: string | null;
  sortOrder: number;
}

interface CandidateProjectResponse extends TimestampedResource {
  name: string;
  role: string | null;
  descriptionMarkdown: string;
  projectUrl: string | null;
  repositoryUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  technologies: string[];
  sortOrder: number;
}

interface CandidateSkillResponse extends TimestampedResource {
  name: string;
  category: string;
  level: string | null;
  notes: string | null;
  sortOrder: number;
}

interface CandidateLanguageResponse extends TimestampedResource {
  language: string;
  level: string;
  certification: string | null;
  notes: string | null;
  sortOrder: number;
}

interface CandidateResponse extends TimestampedResource {
  fullName: string;
  headline: string | null;
  summaryMarkdown: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  location: string | null;
  targetRoles: string[];
  targetLocations: string[];
  careerGoalsMarkdown: string | null;
  cvMarkdown: string | null;
  additionalContext: string | null;
  experiences: CandidateExperienceResponse[];
  education: CandidateEducationResponse[];
  projects: CandidateProjectResponse[];
  skills: CandidateSkillResponse[];
  languages: CandidateLanguageResponse[];
  candidateContextUpdatedAt: string;
}

interface CandidateEnvelope {
  candidate: CandidateResponse | null;
}

const creationPayload = {
  fullName: 'Ada Lovelace',
  headline: 'Staff Software Engineer',
  summaryMarkdown: 'Builds dependable systems.',
  linkedinUrl: 'https://www.linkedin.com/in/ada-lovelace',
  githubUrl: null,
  portfolioUrl: 'https://ada.example.com',
  location: 'Santiago, Chile',
  targetRoles: ['Staff Software Engineer'],
  targetLocations: ['Remote', 'Santiago'],
  careerGoalsMarkdown: null,
  cvMarkdown: '# Ada Lovelace',
  additionalContext: null,
  experiences: [
    {
      organization: 'Sort Later Ltd',
      role: 'Engineer',
      location: null,
      startDate: '2024-01-01',
      endDate: null,
      descriptionMarkdown: null,
      sortOrder: 1,
    },
    {
      organization: 'Newer Systems',
      role: 'Senior Engineer',
      location: 'Remote',
      startDate: '2023-01-01',
      endDate: null,
      descriptionMarkdown: 'Led platform delivery.',
      sortOrder: 0,
    },
    {
      organization: 'Older Systems',
      role: 'Software Engineer',
      location: null,
      startDate: '2020-01-01',
      endDate: '2021-12-31',
      descriptionMarkdown: null,
      sortOrder: 0,
    },
  ],
  education: [
    {
      institution: 'University of London',
      degree: 'BSc Computer Science',
      fieldOfStudy: 'Computer Science',
      location: 'London, UK',
      startDate: '2016-03-01',
      endDate: '2019-12-31',
      descriptionMarkdown: null,
      sortOrder: 0,
    },
  ],
  projects: [
    {
      name: 'Undated Project',
      role: null,
      descriptionMarkdown: 'An ongoing experiment.',
      projectUrl: null,
      repositoryUrl: null,
      startDate: null,
      endDate: null,
      technologies: [],
      sortOrder: 0,
    },
    {
      name: 'Dated Project',
      role: 'Maintainer',
      descriptionMarkdown: 'A production platform.',
      projectUrl: 'https://projects.example.com/dated',
      repositoryUrl: 'https://github.com/ada/dated',
      startDate: '2022-01-01',
      endDate: null,
      technologies: ['TypeScript', 'PostgreSQL'],
      sortOrder: 0,
    },
  ],
  skills: [
    {
      name: 'React',
      category: 'FRAMEWORK',
      level: 'ADVANCED',
      notes: null,
      sortOrder: 0,
    },
    {
      name: 'PostgreSQL',
      category: 'DATABASE',
      level: 'ADVANCED',
      notes: null,
      sortOrder: 0,
    },
    {
      name: 'TypeScript',
      category: 'PROGRAMMING_LANGUAGE',
      level: 'ADVANCED',
      notes: null,
      sortOrder: 1,
    },
  ],
  languages: [
    {
      language: 'Spanish',
      level: 'Professional',
      certification: null,
      notes: null,
      sortOrder: 0,
    },
    {
      language: 'English',
      level: 'Fluent',
      certification: null,
      notes: null,
      sortOrder: 0,
    },
  ],
};

function parseCandidate(responseBody: string): CandidateResponse {
  const envelope = JSON.parse(responseBody) as CandidateEnvelope;

  expect(envelope.candidate).not.toBeNull();

  if (envelope.candidate === null) {
    throw new Error('Expected a Candidate response.');
  }

  return envelope.candidate;
}

function expectUuid(value: string): void {
  expect(value).toMatch(UUID_PATTERN);
}

function expectIsoTimestamp(value: string): void {
  expect(new Date(value).toISOString()).toBe(value);
}

function maximumUpdatedAt(candidate: CandidateResponse): string {
  const timestamps = [
    candidate.updatedAt,
    ...candidate.experiences.map((entry) => entry.updatedAt),
    ...candidate.education.map((entry) => entry.updatedAt),
    ...candidate.projects.map((entry) => entry.updatedAt),
    ...candidate.skills.map((entry) => entry.updatedAt),
    ...candidate.languages.map((entry) => entry.updatedAt),
  ];

  return new Date(
    Math.max(...timestamps.map((timestamp) => Date.parse(timestamp))),
  ).toISOString();
}

describe('Candidate API with PostgreSQL', () => {
  let client: Sql;
  let database: PostgresJsDatabase<typeof schema>;
  let app: ReturnType<typeof buildApp>;

  async function resetCandidateState(): Promise<void> {
    await client.unsafe('truncate table candidate_profiles cascade');
  }

  beforeAll(async () => {
    const target = getTestDatabaseTarget();

    client = postgres(target.url, {
      max: 5,
      onnotice: () => undefined,
    });
    database = drizzle(client, { schema });
    app = buildApp({ database });
    await app.ready();
  });

  beforeEach(resetCandidateState);
  afterEach(resetCandidateState);

  afterAll(async () => {
    await app.close();
    await client.end();
  });

  it('persists and replaces the complete Candidate aggregate through Fastify', async () => {
    const initialResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/candidate',
    });

    expect(initialResponse.statusCode).toBe(200);
    expect(initialResponse.json()).toEqual({ candidate: null });

    const createResponse = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: creationPayload,
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.headers.location).toBe('/api/v1/candidate');

    const created = parseCandidate(createResponse.body);

    expect(created).toMatchObject({
      ...creationPayload,
      experiences: expect.any(Array),
      education: expect.any(Array),
      projects: expect.any(Array),
      skills: expect.any(Array),
      languages: expect.any(Array),
    });
    expectUuid(created.id);
    expectIsoTimestamp(created.createdAt);
    expectIsoTimestamp(created.updatedAt);
    expectIsoTimestamp(created.candidateContextUpdatedAt);
    expect(created.candidateContextUpdatedAt).toBe(maximumUpdatedAt(created));

    for (const child of [
      ...created.experiences,
      ...created.education,
      ...created.projects,
      ...created.skills,
      ...created.languages,
    ]) {
      expectUuid(child.id);
      expectIsoTimestamp(child.createdAt);
      expectIsoTimestamp(child.updatedAt);
    }

    expect(created.experiences.map((entry) => entry.organization)).toEqual([
      'Newer Systems',
      'Older Systems',
      'Sort Later Ltd',
    ]);
    expect(created.projects.map((entry) => entry.name)).toEqual([
      'Dated Project',
      'Undated Project',
    ]);
    expect(created.skills.map((entry) => entry.name)).toEqual([
      'React',
      'PostgreSQL',
      'TypeScript',
    ]);
    expect(created.languages.map((entry) => entry.language)).toEqual([
      'English',
      'Spanish',
    ]);

    const firstReadResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/candidate',
    });

    expect(firstReadResponse.statusCode).toBe(200);
    expect(firstReadResponse.json()).toEqual({ candidate: created });

    const newerExperience = created.experiences.find(
      (entry) => entry.organization === 'Newer Systems',
    );
    const retainedEducation = created.education[0];
    const datedProject = created.projects.find(
      (entry) => entry.name === 'Dated Project',
    );
    const retainedReact = created.skills.find(
      (entry) => entry.name === 'React',
    );
    const retainedTypeScript = created.skills.find(
      (entry) => entry.name === 'TypeScript',
    );
    const retainedEnglish = created.languages.find(
      (entry) => entry.language === 'English',
    );

    expect(newerExperience).toBeDefined();
    expect(retainedEducation).toBeDefined();
    expect(datedProject).toBeDefined();
    expect(retainedReact).toBeDefined();
    expect(retainedTypeScript).toBeDefined();
    expect(retainedEnglish).toBeDefined();

    if (
      newerExperience === undefined ||
      retainedEducation === undefined ||
      datedProject === undefined ||
      retainedReact === undefined ||
      retainedTypeScript === undefined ||
      retainedEnglish === undefined
    ) {
      throw new Error('Expected retained Candidate children.');
    }

    const replacementPayload = {
      fullName: 'Ada Byron',
      headline: 'Principal Software Engineer',
      summaryMarkdown: creationPayload.summaryMarkdown,
      linkedinUrl: creationPayload.linkedinUrl,
      githubUrl: creationPayload.githubUrl,
      portfolioUrl: creationPayload.portfolioUrl,
      location: creationPayload.location,
      targetRoles: ['Principal Software Engineer'],
      targetLocations: creationPayload.targetLocations,
      careerGoalsMarkdown: 'Lead reliable product engineering teams.',
      cvMarkdown: creationPayload.cvMarkdown,
      additionalContext: creationPayload.additionalContext,
      experiences: [
        {
          organization: 'Future Systems',
          role: 'Principal Engineer',
          location: 'Remote',
          startDate: '2025-01-01',
          endDate: null,
          descriptionMarkdown: 'Owns technical direction.',
          sortOrder: 0,
        },
        {
          id: newerExperience.id,
          organization: newerExperience.organization,
          role: 'Principal Engineer',
          location: newerExperience.location,
          startDate: newerExperience.startDate,
          endDate: newerExperience.endDate,
          descriptionMarkdown: newerExperience.descriptionMarkdown,
          sortOrder: newerExperience.sortOrder,
        },
      ],
      education: [
        {
          id: retainedEducation.id,
          institution: retainedEducation.institution,
          degree: retainedEducation.degree,
          fieldOfStudy: retainedEducation.fieldOfStudy,
          location: retainedEducation.location,
          startDate: retainedEducation.startDate,
          endDate: retainedEducation.endDate,
          descriptionMarkdown: retainedEducation.descriptionMarkdown,
          sortOrder: retainedEducation.sortOrder,
        },
      ],
      projects: [
        {
          name: 'Fresh Project',
          role: 'Creator',
          descriptionMarkdown: 'A newly added project.',
          projectUrl: null,
          repositoryUrl: null,
          startDate: '2024-01-01',
          endDate: null,
          technologies: ['Angular'],
          sortOrder: 0,
        },
        {
          id: datedProject.id,
          name: datedProject.name,
          role: datedProject.role,
          descriptionMarkdown: datedProject.descriptionMarkdown,
          projectUrl: datedProject.projectUrl,
          repositoryUrl: datedProject.repositoryUrl,
          startDate: datedProject.startDate,
          endDate: datedProject.endDate,
          technologies: ['TypeScript', 'PostgreSQL', 'Fastify'],
          sortOrder: datedProject.sortOrder,
        },
      ],
      skills: [
        {
          id: retainedReact.id,
          name: retainedReact.name,
          category: retainedReact.category,
          level: retainedReact.level,
          notes: retainedReact.notes,
          sortOrder: retainedReact.sortOrder,
        },
        {
          name: 'Drizzle',
          category: 'LIBRARY',
          level: 'INTERMEDIATE',
          notes: null,
          sortOrder: 0,
        },
        {
          id: retainedTypeScript.id,
          name: retainedTypeScript.name,
          category: retainedTypeScript.category,
          level: 'EXPERT',
          notes: retainedTypeScript.notes,
          sortOrder: retainedTypeScript.sortOrder,
        },
      ],
      languages: [
        {
          id: retainedEnglish.id,
          language: retainedEnglish.language,
          level: 'Native',
          certification: retainedEnglish.certification,
          notes: retainedEnglish.notes,
          sortOrder: retainedEnglish.sortOrder,
        },
        {
          language: 'French',
          level: 'Professional',
          certification: null,
          notes: null,
          sortOrder: 0,
        },
      ],
    };

    const replacementResponse = await app.inject({
      method: 'PUT',
      url: '/api/v1/candidate',
      payload: replacementPayload,
    });

    expect(replacementResponse.statusCode).toBe(200);
    expect(replacementResponse.headers.location).toBeUndefined();

    const replaced = parseCandidate(replacementResponse.body);
    const changedExperience = replaced.experiences.find(
      (entry) => entry.organization === 'Newer Systems',
    );
    const addedExperience = replaced.experiences.find(
      (entry) => entry.organization === 'Future Systems',
    );
    const unchangedEducation = replaced.education[0];
    const changedProject = replaced.projects.find(
      (entry) => entry.name === 'Dated Project',
    );
    const unchangedReact = replaced.skills.find(
      (entry) => entry.name === 'React',
    );
    const changedTypeScript = replaced.skills.find(
      (entry) => entry.name === 'TypeScript',
    );
    const changedEnglish = replaced.languages.find(
      (entry) => entry.language === 'English',
    );

    expect(replaced.id).toBe(created.id);
    expect(replaced.createdAt).toBe(created.createdAt);
    expect(replaced.updatedAt).not.toBe(created.updatedAt);
    expect(replaced.fullName).toBe('Ada Byron');
    expect(replaced.candidateContextUpdatedAt).toBe(maximumUpdatedAt(replaced));
    expect(replaced.candidateContextUpdatedAt).not.toBe(
      created.candidateContextUpdatedAt,
    );

    expect(changedExperience).toMatchObject({
      id: newerExperience.id,
      createdAt: newerExperience.createdAt,
      role: 'Principal Engineer',
    });
    expect(changedExperience?.updatedAt).not.toBe(newerExperience.updatedAt);
    expect(addedExperience).toBeDefined();
    expectUuid(addedExperience?.id ?? '');
    expect(created.experiences.map((entry) => entry.id)).not.toContain(
      addedExperience?.id,
    );

    expect(unchangedEducation).toMatchObject({
      id: retainedEducation.id,
      createdAt: retainedEducation.createdAt,
      updatedAt: retainedEducation.updatedAt,
    });
    expect(unchangedReact).toMatchObject({
      id: retainedReact.id,
      createdAt: retainedReact.createdAt,
      updatedAt: retainedReact.updatedAt,
    });
    expect(changedProject).toMatchObject({
      id: datedProject.id,
      createdAt: datedProject.createdAt,
      technologies: ['TypeScript', 'PostgreSQL', 'Fastify'],
    });
    expect(changedProject?.updatedAt).not.toBe(datedProject.updatedAt);
    expect(changedTypeScript).toMatchObject({
      id: retainedTypeScript.id,
      createdAt: retainedTypeScript.createdAt,
      level: 'EXPERT',
    });
    expect(changedTypeScript?.updatedAt).not.toBe(retainedTypeScript.updatedAt);
    expect(changedEnglish).toMatchObject({
      id: retainedEnglish.id,
      createdAt: retainedEnglish.createdAt,
      level: 'Native',
    });
    expect(changedEnglish?.updatedAt).not.toBe(retainedEnglish.updatedAt);

    expect(replaced.experiences.map((entry) => entry.organization)).toEqual([
      'Future Systems',
      'Newer Systems',
    ]);
    expect(replaced.experiences.map((entry) => entry.organization)).not.toContain(
      'Older Systems',
    );
    expect(replaced.projects.map((entry) => entry.name)).toEqual([
      'Fresh Project',
      'Dated Project',
    ]);
    expect(replaced.projects.map((entry) => entry.name)).not.toContain(
      'Undated Project',
    );
    expect(replaced.skills.map((entry) => entry.name)).toEqual([
      'React',
      'Drizzle',
      'TypeScript',
    ]);
    expect(replaced.skills.map((entry) => entry.name)).not.toContain(
      'PostgreSQL',
    );
    expect(replaced.languages.map((entry) => entry.language)).toEqual([
      'English',
      'French',
    ]);
    expect(replaced.languages.map((entry) => entry.language)).not.toContain(
      'Spanish',
    );

    const finalReadResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/candidate',
    });

    expect(finalReadResponse.statusCode).toBe(200);
    expect(finalReadResponse.json()).toEqual({ candidate: replaced });
  });

  it('keeps the health endpoint independent from database initialization', async () => {
    const originalDatabaseUrl = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];

    const healthApp = buildApp();

    try {
      const response = await healthApp.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    } finally {
      await healthApp.close();

      if (originalDatabaseUrl === undefined) {
        delete process.env['DATABASE_URL'];
      } else {
        process.env['DATABASE_URL'] = originalDatabaseUrl;
      }
    }
  });
});
