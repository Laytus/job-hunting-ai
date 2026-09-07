import { describe, expect, it } from 'vitest';
import {
  InvalidJobDescriptionDataError,
  InvalidJobDescriptionIdentifierError,
  JobDescriptionApplicationNotFoundError,
} from '../src/job-description/job-description.errors.js';
import {
  JobDescriptionService,
  type JobDescriptionPersistence,
} from '../src/job-description/job-description.service.js';
import type {
  JobDescription,
  JobDescriptionReplacementResult,
  JobDescriptionWriteCommand,
  JobDescriptionWriteInput,
} from '../src/job-description/job-description.types.js';
import type { ApplicationEventDraft } from '../src/application-event/application-event.types.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const jobDescriptionId = '20000000-0000-4000-8000-000000000000';

function input(
  overrides: Partial<JobDescriptionWriteInput> = {},
): JobDescriptionWriteInput {
  return {
    title: 'Senior Quant Developer',
    companyName: 'Analytical Engines Ltd',
    descriptionMarkdown: '# Senior Quant Developer',
    requirementsMarkdown: '- TypeScript',
    responsibilitiesMarkdown: '- Build reliable systems',
    structuredData: { skills: ['TypeScript'] },
    sourceUrl: 'https://example.com/jobs/quant-developer',
    ...overrides,
  };
}

function jobDescription(
  overrides: Partial<JobDescription> = {},
): JobDescription {
  return {
    id: jobDescriptionId,
    applicationId,
    title: 'Senior Quant Developer',
    companyName: 'Analytical Engines Ltd',
    descriptionMarkdown: '# Senior Quant Developer',
    requirementsMarkdown: '- TypeScript',
    responsibilitiesMarkdown: '- Build reliable systems',
    structuredData: { skills: ['TypeScript'] },
    sourceUrl: 'https://example.com/jobs/quant-developer',
    createdAt: new Date('2026-08-21T10:00:00.000Z'),
    updatedAt: new Date('2026-08-21T11:00:00.000Z'),
    ...overrides,
  };
}

class FakeJobDescriptionRepository implements JobDescriptionPersistence {
  applicationExistsResult = true;
  jobDescriptionToFind: JobDescription | null = null;
  replacementResult: JobDescriptionReplacementResult | null = {
    created: true,
    jobDescription: jobDescription(),
  };
  readonly existenceChecks: string[] = [];
  readonly findCalls: string[] = [];
  readonly replacementCalls: {
    readonly applicationId: string;
    readonly command: JobDescriptionWriteCommand;
    readonly createdEvent: ApplicationEventDraft;
    readonly updatedEvent: ApplicationEventDraft;
  }[] = [];

  async applicationExists(id: string): Promise<boolean> {
    this.existenceChecks.push(id);
    return this.applicationExistsResult;
  }

  async findByApplicationId(id: string): Promise<JobDescription | null> {
    this.findCalls.push(id);
    return this.jobDescriptionToFind;
  }

  async replaceForApplication(
    id: string,
    command: JobDescriptionWriteCommand,
    createdEvent: ApplicationEventDraft,
    updatedEvent: ApplicationEventDraft,
  ): Promise<JobDescriptionReplacementResult | null> {
    this.replacementCalls.push({
      applicationId: id,
      command,
      createdEvent,
      updatedEvent,
    });
    return this.replacementResult;
  }
}

describe('JobDescriptionService', () => {
  it('returns null when the Application exists without a Job Description', async () => {
    const repository = new FakeJobDescriptionRepository();
    const service = new JobDescriptionService(repository);

    await expect(service.getJobDescription(applicationId)).resolves.toBeNull();
    expect(repository.existenceChecks).toEqual([applicationId]);
    expect(repository.findCalls).toEqual([applicationId]);
  });

  it('returns an existing Job Description', async () => {
    const repository = new FakeJobDescriptionRepository();
    repository.jobDescriptionToFind = jobDescription();
    const service = new JobDescriptionService(repository);

    await expect(service.getJobDescription(applicationId)).resolves.toBe(
      repository.jobDescriptionToFind,
    );
  });

  it('reports a missing parent Application without querying the child', async () => {
    const repository = new FakeJobDescriptionRepository();
    repository.applicationExistsResult = false;
    const service = new JobDescriptionService(repository);

    await expect(service.getJobDescription(applicationId)).rejects.toBeInstanceOf(
      JobDescriptionApplicationNotFoundError,
    );
    expect(repository.findCalls).toEqual([]);
  });

  it('rejects an invalid Application UUID before persistence', async () => {
    const repository = new FakeJobDescriptionRepository();
    const service = new JobDescriptionService(repository);

    await expect(service.getJobDescription('not-a-uuid')).rejects.toBeInstanceOf(
      InvalidJobDescriptionIdentifierError,
    );
    expect(repository.existenceChecks).toEqual([]);
  });

  it.each([
    {
      label: 'blank description',
      value: input({ descriptionMarkdown: '   ' }),
      path: 'descriptionMarkdown',
    },
    { label: 'blank optional text', value: input({ title: '  ' }), path: 'title' },
    {
      label: 'non-HTTP URL',
      value: input({ sourceUrl: 'ftp://example.com/job' }),
      path: 'sourceUrl',
    },
    {
      label: 'malformed URL',
      value: input({ sourceUrl: 'https://' }),
      path: 'sourceUrl',
    },
  ])('rejects $label before persistence', async ({ value, path }) => {
    const repository = new FakeJobDescriptionRepository();
    const service = new JobDescriptionService(repository);

    await expect(
      service.replaceJobDescription(applicationId, value),
    ).rejects.toMatchObject({
      constructor: InvalidJobDescriptionDataError,
      issues: expect.arrayContaining([expect.objectContaining({ path })]),
    });
    expect(repository.replacementCalls).toEqual([]);
  });

  it('creates a Job Description and normalizes omitted nullable fields', async () => {
    const repository = new FakeJobDescriptionRepository();
    const now = new Date('2026-08-22T12:00:00.000Z');
    const service = new JobDescriptionService(repository, () => now);
    const minimalInput = { descriptionMarkdown: '# Role' };

    await expect(
      service.replaceJobDescription(applicationId, minimalInput),
    ).resolves.toEqual(repository.replacementResult);
    expect(repository.replacementCalls).toEqual([
      {
        applicationId,
        command: {
          title: null,
          companyName: null,
          descriptionMarkdown: '# Role',
          requirementsMarkdown: null,
          responsibilitiesMarkdown: null,
          structuredData: null,
          sourceUrl: null,
        },
        createdEvent: expect.objectContaining({
          type: 'JOB_DESCRIPTION_CREATED',
          occurredAt: now,
        }),
        updatedEvent: expect.objectContaining({
          type: 'JOB_DESCRIPTION_UPDATED',
          occurredAt: now,
        }),
      },
    ]);
  });

  it('returns an update result from persistence', async () => {
    const repository = new FakeJobDescriptionRepository();
    repository.replacementResult = {
      created: false,
      jobDescription: jobDescription({ title: 'Updated title' }),
    };
    const service = new JobDescriptionService(repository);

    await expect(
      service.replaceJobDescription(applicationId, input({ title: 'Updated title' })),
    ).resolves.toEqual(repository.replacementResult);
  });

  it('reports a missing parent Application during replacement', async () => {
    const repository = new FakeJobDescriptionRepository();
    repository.replacementResult = null;
    const service = new JobDescriptionService(repository);

    await expect(
      service.replaceJobDescription(applicationId, input()),
    ).rejects.toBeInstanceOf(JobDescriptionApplicationNotFoundError);
  });
});
