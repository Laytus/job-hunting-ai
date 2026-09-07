import {
  InvalidInterviewDataError,
  InvalidInterviewIdentifierError,
  InterviewApplicationNotFoundError,
  InterviewNotFoundError,
  type InterviewDataIssue,
} from './interview.errors.js';
import type { ApplicationEventDraft } from '../application-event/application-event.types.js';
import {
  interviewStatuses,
  interviewTypes,
  type Interview,
  type InterviewWriteCommand,
  type InterviewWriteInput,
} from './interview.types.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const timezonePattern = /(?:Z|[+-]\d{2}:\d{2})$/u;

export interface InterviewPersistence {
  applicationExists(applicationId: string): Promise<boolean>;
  findAllByApplicationId(applicationId: string): Promise<Interview[]>;
  createForApplication(
    applicationId: string,
    command: InterviewWriteCommand,
    event: ApplicationEventDraft,
  ): Promise<Interview | null>;
  replaceForApplication(
    applicationId: string,
    interviewId: string,
    command: InterviewWriteCommand,
    event: ApplicationEventDraft,
  ): Promise<Interview | null>;
}

function assertValidIdentifier(identifier: string): void {
  if (!uuidPattern.test(identifier)) {
    throw new InvalidInterviewIdentifierError(identifier);
  }
}

function parseTimestamp(
  value: string | null,
  path: string,
  issues: InterviewDataIssue[],
): Date | null {
  if (value === null) {
    return null;
  }

  const parsed = new Date(value);
  if (
    !value.includes('T') ||
    !timezonePattern.test(value) ||
    Number.isNaN(parsed.getTime())
  ) {
    issues.push({ path, message: 'Use a valid timestamp with a timezone.' });
    return null;
  }

  return parsed;
}

function validateCommand(input: InterviewWriteInput): InterviewWriteCommand {
  const issues: InterviewDataIssue[] = [];
  const scheduledAt = parseTimestamp(input.scheduledAt, 'scheduledAt', issues);
  const completedAt = parseTimestamp(input.completedAt, 'completedAt', issues);

  if (!interviewTypes.includes(input.type)) {
    issues.push({ path: 'type', message: 'Use an approved Interview type.' });
  }
  if (!interviewStatuses.includes(input.status)) {
    issues.push({ path: 'status', message: 'Use an approved Interview status.' });
  }
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0) {
    issues.push({ path: 'sortOrder', message: 'Sort order must be non-negative.' });
  }
  if (input.notesMarkdown !== null && input.notesMarkdown.trim() === '') {
    issues.push({ path: 'notesMarkdown', message: 'Use a non-empty value or null.' });
  }
  if (
    input.feedbackMarkdown !== null &&
    input.feedbackMarkdown.trim() === ''
  ) {
    issues.push({
      path: 'feedbackMarkdown',
      message: 'Use a non-empty value or null.',
    });
  }
  if (
    scheduledAt !== null &&
    completedAt !== null &&
    completedAt < scheduledAt
  ) {
    issues.push({
      path: 'completedAt',
      message: 'Completed time must be on or after scheduled time.',
    });
  }

  if (issues.length > 0) {
    throw new InvalidInterviewDataError(issues);
  }

  return {
    type: input.type,
    status: input.status,
    scheduledAt,
    completedAt,
    notesMarkdown: input.notesMarkdown,
    feedbackMarkdown: input.feedbackMarkdown,
    sortOrder: input.sortOrder,
  };
}

export class InterviewService {
  constructor(
    private readonly repository: InterviewPersistence,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getInterviews(applicationId: string): Promise<Interview[]> {
    assertValidIdentifier(applicationId);
    if (!(await this.repository.applicationExists(applicationId))) {
      throw new InterviewApplicationNotFoundError(applicationId);
    }

    return this.repository.findAllByApplicationId(applicationId);
  }

  async createInterview(
    applicationId: string,
    input: InterviewWriteInput,
  ): Promise<Interview> {
    assertValidIdentifier(applicationId);
    const command = validateCommand(input);
    const interview = await this.repository.createForApplication(
      applicationId,
      command,
      {
        type: 'INTERVIEW_CREATED',
        title: 'Interview created',
        description: 'An interview was added to the application.',
        metadata: {
          type: command.type,
          status: command.status,
        },
        occurredAt: this.now(),
      },
    );

    if (interview === null) {
      throw new InterviewApplicationNotFoundError(applicationId);
    }

    return interview;
  }

  async replaceInterview(
    applicationId: string,
    interviewId: string,
    input: InterviewWriteInput,
  ): Promise<Interview> {
    assertValidIdentifier(applicationId);
    assertValidIdentifier(interviewId);
    const command = validateCommand(input);
    const interview = await this.repository.replaceForApplication(
      applicationId,
      interviewId,
      command,
      {
        type: 'INTERVIEW_UPDATED',
        title: 'Interview updated',
        description: 'An application interview was updated.',
        metadata: {
          interviewId,
          type: command.type,
          status: command.status,
        },
        occurredAt: this.now(),
      },
    );

    if (interview !== null) {
      return interview;
    }
    if (!(await this.repository.applicationExists(applicationId))) {
      throw new InterviewApplicationNotFoundError(applicationId);
    }

    throw new InterviewNotFoundError(applicationId, interviewId);
  }
}
