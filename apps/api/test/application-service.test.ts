import { describe, expect, it } from 'vitest';
import {
  ApplicationNotFoundError,
  InvalidApplicationDataError,
  InvalidApplicationIdentifierError,
} from '../src/application/application.errors.js';
import {
  ApplicationService,
  type ApplicationPersistence,
} from '../src/application/application.service.js';
import type {
  Application,
  ApplicationWriteCommand,
} from '../src/application/application.types.js';
import type { ApplicationEventDraft } from '../src/application-event/application-event.types.js';

const applicationId = '10000000-0000-4000-8000-000000000000';
const createdAt = new Date('2026-08-01T10:00:00.000Z');

function command(
  overrides: Partial<ApplicationWriteCommand> = {},
): ApplicationWriteCommand {
  return {
    companyName: 'Analytical Engines Ltd',
    roleTitle: 'Software Engineer',
    location: 'Remote',
    jobUrl: 'https://example.com/jobs/software-engineer',
    source: 'CAREER_PAGE',
    status: 'FOUND',
    priority: 'HIGH',
    dateFound: '2026-08-01',
    dateApplied: null,
    notesMarkdown: null,
    ...overrides,
  };
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: applicationId,
    ...command(),
    createdAt,
    updatedAt: new Date('2026-08-02T10:00:00.000Z'),
    ...overrides,
  };
}

class FakeApplicationRepository implements ApplicationPersistence {
  applicationsToFind: Application[] = [];
  applicationToFind: Application | null = null;
  applicationToCreate: Application = application();
  applicationToReplace: Application | null = application();
  readonly foundIds: string[] = [];
  readonly createCommands: ApplicationWriteCommand[] = [];
  readonly createEvents: ApplicationEventDraft[] = [];
  readonly replaceCalls: {
    readonly id: string;
    readonly command: ApplicationWriteCommand;
    readonly events: readonly ApplicationEventDraft[];
  }[] = [];

  async findAll(): Promise<Application[]> {
    return this.applicationsToFind;
  }

  async findById(id: string): Promise<Application | null> {
    this.foundIds.push(id);
    return this.applicationToFind;
  }

  async create(
    commandToCreate: ApplicationWriteCommand,
    event: ApplicationEventDraft,
  ): Promise<Application> {
    this.createCommands.push(commandToCreate);
    this.createEvents.push(event);
    return this.applicationToCreate;
  }

  async replace(
    id: string,
    commandToReplace: ApplicationWriteCommand,
    createEvents: (current: Application) => readonly ApplicationEventDraft[],
  ): Promise<Application | null> {
    if (this.applicationToReplace === null) {
      return null;
    }
    const current = this.applicationToFind ?? application();
    const events = createEvents(current);
    this.replaceCalls.push({ id, command: commandToReplace, events });
    return this.applicationToReplace;
  }
}

describe('ApplicationService', () => {
  it('returns the Application collection from persistence', async () => {
    const repository = new FakeApplicationRepository();
    repository.applicationsToFind = [application(), application({ id: 'other-id' })];
    const service = new ApplicationService(repository);

    await expect(service.getApplications()).resolves.toEqual(
      repository.applicationsToFind,
    );
  });

  it('returns an Application by UUID', async () => {
    const repository = new FakeApplicationRepository();
    repository.applicationToFind = application();
    const service = new ApplicationService(repository);

    await expect(service.getApplication(applicationId)).resolves.toEqual(
      repository.applicationToFind,
    );
    expect(repository.foundIds).toEqual([applicationId]);
  });

  it('rejects an invalid UUID before querying persistence', async () => {
    const repository = new FakeApplicationRepository();
    const service = new ApplicationService(repository);

    await expect(service.getApplication('not-a-uuid')).rejects.toBeInstanceOf(
      InvalidApplicationIdentifierError,
    );
    expect(repository.foundIds).toEqual([]);
  });

  it('reports a missing Application', async () => {
    const repository = new FakeApplicationRepository();
    const service = new ApplicationService(repository);

    await expect(service.getApplication(applicationId)).rejects.toBeInstanceOf(
      ApplicationNotFoundError,
    );
  });

  it('creates a valid Application through persistence', async () => {
    const repository = new FakeApplicationRepository();
    const expected = application();
    repository.applicationToCreate = expected;
    const now = new Date('2026-08-22T12:00:00.000Z');
    const service = new ApplicationService(repository, () => now);
    const createCommand = command();

    await expect(service.createApplication(createCommand)).resolves.toBe(expected);
    expect(repository.createCommands).toEqual([createCommand]);
    expect(repository.createEvents).toEqual([
      expect.objectContaining({
        type: 'APPLICATION_CREATED',
        occurredAt: now,
      }),
    ]);
  });

  it.each([
    {
      label: 'blank company name',
      invalid: command({ companyName: '   ' }),
      path: 'companyName',
    },
    {
      label: 'blank role title',
      invalid: command({ roleTitle: '   ' }),
      path: 'roleTitle',
    },
    {
      label: 'non-HTTP URL',
      invalid: command({ jobUrl: 'ftp://example.com/job' }),
      path: 'jobUrl',
    },
    {
      label: 'malformed URL',
      invalid: command({ jobUrl: 'https://' }),
      path: 'jobUrl',
    },
    {
      label: 'invalid date range',
      invalid: command({ dateFound: '2026-08-02', dateApplied: '2026-08-01' }),
      path: 'dateApplied',
    },
  ])('rejects $label before persistence', async ({ invalid, path }) => {
    const repository = new FakeApplicationRepository();
    const service = new ApplicationService(repository);

    await expect(service.createApplication(invalid)).rejects.toMatchObject({
      constructor: InvalidApplicationDataError,
      issues: expect.arrayContaining([expect.objectContaining({ path })]),
    });
    expect(repository.createCommands).toEqual([]);
  });

  it('allows HTTP, HTTPS, null URLs, and nullable dates', async () => {
    const repository = new FakeApplicationRepository();
    const service = new ApplicationService(repository);

    await service.createApplication(command({ jobUrl: 'http://example.com/job' }));
    await service.createApplication(command({ jobUrl: 'https://example.com/job' }));
    await service.createApplication(
      command({ jobUrl: null, dateFound: null, dateApplied: '2026-08-01' }),
    );

    expect(repository.createCommands).toHaveLength(3);
  });

  it('replaces a valid Application through persistence', async () => {
    const repository = new FakeApplicationRepository();
    const expected = application({ companyName: 'Replacement Company' });
    repository.applicationToReplace = expected;
    repository.applicationToFind = application();
    const now = new Date('2026-08-22T13:00:00.000Z');
    const service = new ApplicationService(repository, () => now);
    const replacement = command({ companyName: 'Replacement Company' });

    await expect(
      service.replaceApplication(applicationId, replacement),
    ).resolves.toBe(expected);
    expect(repository.replaceCalls).toEqual([
      {
        id: applicationId,
        command: replacement,
        events: [
          expect.objectContaining({
            type: 'APPLICATION_UPDATED',
            metadata: { changedFields: ['companyName'] },
            occurredAt: now,
          }),
        ],
      },
    ]);
  });

  it('records both update and status-change events for a status transition', async () => {
    const repository = new FakeApplicationRepository();
    repository.applicationToFind = application({ status: 'FOUND' });
    const now = new Date('2026-08-22T14:00:00.000Z');
    const service = new ApplicationService(repository, () => now);

    await service.replaceApplication(applicationId, command({ status: 'APPLIED' }));

    expect(repository.replaceCalls[0]?.events).toEqual([
      expect.objectContaining({ type: 'APPLICATION_UPDATED', occurredAt: now }),
      expect.objectContaining({
        type: 'APPLICATION_STATUS_CHANGED',
        metadata: { previousStatus: 'FOUND', newStatus: 'APPLIED' },
        occurredAt: now,
      }),
    ]);
  });

  it('validates the replacement UUID before data and persistence', async () => {
    const repository = new FakeApplicationRepository();
    const service = new ApplicationService(repository);

    await expect(
      service.replaceApplication('invalid-id', command({ companyName: '   ' })),
    ).rejects.toBeInstanceOf(InvalidApplicationIdentifierError);
    expect(repository.replaceCalls).toEqual([]);
  });

  it('reports a missing Application during replacement', async () => {
    const repository = new FakeApplicationRepository();
    repository.applicationToReplace = null;
    repository.applicationToFind = application();
    const service = new ApplicationService(repository);

    await expect(
      service.replaceApplication(applicationId, command()),
    ).rejects.toBeInstanceOf(ApplicationNotFoundError);
  });
});
