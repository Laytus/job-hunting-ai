import {
  InvalidJobDescriptionDataError,
  InvalidJobDescriptionIdentifierError,
  JobDescriptionApplicationNotFoundError,
  type JobDescriptionDataIssue,
} from './job-description.errors.js';
import type { ApplicationEventDraft } from '../application-event/application-event.types.js';
import type {
  JobDescription,
  JobDescriptionReplacementResult,
  JobDescriptionWriteCommand,
  JobDescriptionWriteInput,
} from './job-description.types.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface JobDescriptionPersistence {
  applicationExists(applicationId: string): Promise<boolean>;
  findByApplicationId(applicationId: string): Promise<JobDescription | null>;
  replaceForApplication(
    applicationId: string,
    command: JobDescriptionWriteCommand,
    createdEvent: ApplicationEventDraft,
    updatedEvent: ApplicationEventDraft,
  ): Promise<JobDescriptionReplacementResult | null>;
}

function assertValidIdentifier(applicationId: string): void {
  if (!uuidPattern.test(applicationId)) {
    throw new InvalidJobDescriptionIdentifierError(applicationId);
  }
}

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//iu.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeAndValidate(
  input: JobDescriptionWriteInput,
): JobDescriptionWriteCommand {
  const command: JobDescriptionWriteCommand = {
    title: input.title ?? null,
    companyName: input.companyName ?? null,
    descriptionMarkdown: input.descriptionMarkdown,
    requirementsMarkdown: input.requirementsMarkdown ?? null,
    responsibilitiesMarkdown: input.responsibilitiesMarkdown ?? null,
    structuredData: input.structuredData ?? null,
    sourceUrl: input.sourceUrl ?? null,
  };
  const issues: JobDescriptionDataIssue[] = [];

  if (command.descriptionMarkdown.trim() === '') {
    issues.push({
      path: 'descriptionMarkdown',
      message: 'Description Markdown is required.',
    });
  }

  for (const [path, value] of [
    ['title', command.title],
    ['companyName', command.companyName],
    ['requirementsMarkdown', command.requirementsMarkdown],
    ['responsibilitiesMarkdown', command.responsibilitiesMarkdown],
  ] as const) {
    if (value !== null && value.trim() === '') {
      issues.push({ path, message: 'Use a non-empty value or null.' });
    }
  }

  if (command.sourceUrl !== null && !isHttpUrl(command.sourceUrl)) {
    issues.push({ path: 'sourceUrl', message: 'Source URL must use HTTP or HTTPS.' });
  }

  if (issues.length > 0) {
    throw new InvalidJobDescriptionDataError(issues);
  }

  return command;
}

export class JobDescriptionService {
  constructor(
    private readonly repository: JobDescriptionPersistence,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getJobDescription(applicationId: string): Promise<JobDescription | null> {
    assertValidIdentifier(applicationId);

    if (!(await this.repository.applicationExists(applicationId))) {
      throw new JobDescriptionApplicationNotFoundError(applicationId);
    }

    return this.repository.findByApplicationId(applicationId);
  }

  async replaceJobDescription(
    applicationId: string,
    input: JobDescriptionWriteInput,
  ): Promise<JobDescriptionReplacementResult> {
    assertValidIdentifier(applicationId);
    const command = normalizeAndValidate(input);
    const occurredAt = this.now();
    const result = await this.repository.replaceForApplication(
      applicationId,
      command,
      {
        type: 'JOB_DESCRIPTION_CREATED',
        title: 'Job description created',
        description: 'A job description was added to the application.',
        metadata: null,
        occurredAt,
      },
      {
        type: 'JOB_DESCRIPTION_UPDATED',
        title: 'Job description updated',
        description: 'The application job description was updated.',
        metadata: null,
        occurredAt,
      },
    );

    if (result === null) {
      throw new JobDescriptionApplicationNotFoundError(applicationId);
    }

    return result;
  }
}
