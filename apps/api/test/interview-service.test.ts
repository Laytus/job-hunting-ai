import { describe, expect, it } from 'vitest';
import {
  InvalidInterviewDataError,
  InvalidInterviewIdentifierError,
  InterviewApplicationNotFoundError,
  InterviewNotFoundError,
} from '../src/interview/interview.errors.js';
import {
  InterviewService,
  type InterviewPersistence,
} from '../src/interview/interview.service.js';
import type {
  Interview,
  InterviewWriteCommand,
  InterviewWriteInput,
} from '../src/interview/interview.types.js';
import type { ApplicationEventDraft } from '../src/application-event/application-event.types.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const interviewId = '20000000-0000-4000-8000-000000000000';

function input(overrides: Partial<InterviewWriteInput> = {}): InterviewWriteInput {
  return {
    type: 'TECHNICAL',
    status: 'SCHEDULED',
    scheduledAt: '2026-09-01T14:00:00.000Z',
    completedAt: null,
    notesMarkdown: '# Preparation',
    feedbackMarkdown: null,
    sortOrder: 1,
    ...overrides,
  };
}

function interview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: interviewId,
    applicationId,
    type: 'TECHNICAL',
    status: 'SCHEDULED',
    scheduledAt: new Date('2026-09-01T14:00:00.000Z'),
    completedAt: null,
    notesMarkdown: '# Preparation',
    feedbackMarkdown: null,
    sortOrder: 1,
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    ...overrides,
  };
}

class FakeInterviewRepository implements InterviewPersistence {
  applicationExistsResult = true;
  interviewsToFind: Interview[] = [];
  interviewToCreate: Interview | null = interview();
  interviewToReplace: Interview | null = interview();
  readonly existenceCalls: string[] = [];
  readonly findCalls: string[] = [];
  readonly createCalls: {
    readonly applicationId: string;
    readonly command: InterviewWriteCommand;
    readonly event: ApplicationEventDraft;
  }[] = [];
  readonly replaceCalls: {
    readonly applicationId: string;
    readonly interviewId: string;
    readonly command: InterviewWriteCommand;
    readonly event: ApplicationEventDraft;
  }[] = [];

  async applicationExists(id: string): Promise<boolean> {
    this.existenceCalls.push(id);
    return this.applicationExistsResult;
  }

  async findAllByApplicationId(id: string): Promise<Interview[]> {
    this.findCalls.push(id);
    return this.interviewsToFind;
  }

  async createForApplication(
    id: string,
    command: InterviewWriteCommand,
    event: ApplicationEventDraft,
  ): Promise<Interview | null> {
    this.createCalls.push({ applicationId: id, command, event });
    return this.interviewToCreate;
  }

  async replaceForApplication(
    id: string,
    childId: string,
    command: InterviewWriteCommand,
    event: ApplicationEventDraft,
  ): Promise<Interview | null> {
    this.replaceCalls.push({
      applicationId: id,
      interviewId: childId,
      command,
      event,
    });
    return this.interviewToReplace;
  }
}

describe('InterviewService', () => {
  it('returns the Interview collection for an existing Application', async () => {
    const repository = new FakeInterviewRepository();
    repository.interviewsToFind = [interview()];
    const service = new InterviewService(repository);

    await expect(service.getInterviews(applicationId)).resolves.toEqual(
      repository.interviewsToFind,
    );
    expect(repository.findCalls).toEqual([applicationId]);
  });

  it('rejects malformed identifiers before persistence', async () => {
    const repository = new FakeInterviewRepository();
    const service = new InterviewService(repository);

    await expect(service.getInterviews('invalid')).rejects.toBeInstanceOf(
      InvalidInterviewIdentifierError,
    );
    await expect(
      service.replaceInterview(applicationId, 'invalid', input()),
    ).rejects.toBeInstanceOf(InvalidInterviewIdentifierError);
    expect(repository.findCalls).toEqual([]);
    expect(repository.replaceCalls).toEqual([]);
  });

  it('reports a missing Application for list and creation', async () => {
    const repository = new FakeInterviewRepository();
    repository.applicationExistsResult = false;
    repository.interviewToCreate = null;
    const service = new InterviewService(repository);

    await expect(service.getInterviews(applicationId)).rejects.toBeInstanceOf(
      InterviewApplicationNotFoundError,
    );
    await expect(
      service.createInterview(applicationId, input()),
    ).rejects.toBeInstanceOf(InterviewApplicationNotFoundError);
  });

  it('creates an Interview with parsed timestamps', async () => {
    const repository = new FakeInterviewRepository();
    const now = new Date('2026-08-22T12:00:00.000Z');
    const service = new InterviewService(repository, () => now);

    await expect(service.createInterview(applicationId, input())).resolves.toBe(
      repository.interviewToCreate,
    );
    expect(repository.createCalls).toEqual([
      {
        applicationId,
        command: {
          type: 'TECHNICAL',
          status: 'SCHEDULED',
          scheduledAt: new Date('2026-09-01T14:00:00.000Z'),
          completedAt: null,
          notesMarkdown: '# Preparation',
          feedbackMarkdown: null,
          sortOrder: 1,
        },
        event: expect.objectContaining({
          type: 'INTERVIEW_CREATED',
          metadata: { type: 'TECHNICAL', status: 'SCHEDULED' },
          occurredAt: now,
        }),
      },
    ]);
  });

  it('replaces an Interview with full validated data', async () => {
    const repository = new FakeInterviewRepository();
    repository.interviewToReplace = interview({
      status: 'COMPLETED',
      completedAt: new Date('2026-09-01T15:00:00.000Z'),
    });
    const service = new InterviewService(repository);
    const replacement = input({
      status: 'COMPLETED',
      completedAt: '2026-09-01T15:00:00.000Z',
      feedbackMarkdown: '# Strong interview',
    });

    await expect(
      service.replaceInterview(applicationId, interviewId, replacement),
    ).resolves.toBe(repository.interviewToReplace);
    expect(repository.replaceCalls).toHaveLength(1);
    expect(repository.replaceCalls[0]).toMatchObject({ applicationId, interviewId });
    expect(repository.replaceCalls[0]?.event).toMatchObject({
      type: 'INTERVIEW_UPDATED',
      metadata: {
        interviewId,
        type: 'TECHNICAL',
        status: 'COMPLETED',
      },
    });
  });

  it('reports an absent owned Interview', async () => {
    const repository = new FakeInterviewRepository();
    repository.interviewToReplace = null;
    const service = new InterviewService(repository);

    await expect(
      service.replaceInterview(applicationId, interviewId, input()),
    ).rejects.toBeInstanceOf(InterviewNotFoundError);
  });

  it('reports a missing parent during replacement', async () => {
    const repository = new FakeInterviewRepository();
    repository.interviewToReplace = null;
    repository.applicationExistsResult = false;
    const service = new InterviewService(repository);

    await expect(
      service.replaceInterview(applicationId, interviewId, input()),
    ).rejects.toBeInstanceOf(InterviewApplicationNotFoundError);
  });

  it.each([
    {
      label: 'an invalid type',
      value: { ...input(), type: 'PHONE' } as unknown as InterviewWriteInput,
      path: 'type',
    },
    {
      label: 'an invalid status',
      value: { ...input(), status: 'PENDING' } as unknown as InterviewWriteInput,
      path: 'status',
    },
    {
      label: 'a timestamp without timezone',
      value: input({ scheduledAt: '2026-09-01T14:00:00' }),
      path: 'scheduledAt',
    },
    {
      label: 'completed before scheduled',
      value: input({ completedAt: '2026-09-01T13:00:00.000Z' }),
      path: 'completedAt',
    },
    { label: 'negative ordering', value: input({ sortOrder: -1 }), path: 'sortOrder' },
    {
      label: 'blank notes',
      value: input({ notesMarkdown: '   ' }),
      path: 'notesMarkdown',
    },
  ])('rejects $label before persistence', async ({ value, path }) => {
    const repository = new FakeInterviewRepository();
    const service = new InterviewService(repository);

    await expect(
      service.createInterview(applicationId, value),
    ).rejects.toMatchObject({
      constructor: InvalidInterviewDataError,
      issues: expect.arrayContaining([expect.objectContaining({ path })]),
    });
    expect(repository.createCalls).toEqual([]);
  });
});
