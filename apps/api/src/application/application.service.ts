import {
  ApplicationNotFoundError,
  InvalidApplicationDataError,
  InvalidApplicationIdentifierError,
  type ApplicationDataIssue,
} from './application.errors.js';
import type { ApplicationEventDraft } from '../application-event/application-event.types.js';
import type { Application, ApplicationWriteCommand } from './application.types.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface ApplicationPersistence {
  findAll(): Promise<Application[]>;
  findById(id: string): Promise<Application | null>;
  create(
    command: ApplicationWriteCommand,
    event: ApplicationEventDraft,
  ): Promise<Application>;
  replace(
    id: string,
    command: ApplicationWriteCommand,
    createEvents: (current: Application) => readonly ApplicationEventDraft[],
  ): Promise<Application | null>;
}

const mutableApplicationFields = [
  'companyName',
  'roleTitle',
  'location',
  'jobUrl',
  'source',
  'status',
  'priority',
  'dateFound',
  'dateApplied',
  'notesMarkdown',
] as const;

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

function validateCommand(command: ApplicationWriteCommand): void {
  const issues: ApplicationDataIssue[] = [];

  if (command.companyName.trim() === '') {
    issues.push({ path: 'companyName', message: 'Company name is required.' });
  }
  if (command.roleTitle.trim() === '') {
    issues.push({ path: 'roleTitle', message: 'Role title is required.' });
  }
  if (command.jobUrl !== null && !isHttpUrl(command.jobUrl)) {
    issues.push({ path: 'jobUrl', message: 'Job URL must use HTTP or HTTPS.' });
  }
  if (
    command.dateFound !== null &&
    command.dateApplied !== null &&
    command.dateApplied < command.dateFound
  ) {
    issues.push({
      path: 'dateApplied',
      message: 'Applied date must be on or after found date.',
    });
  }

  if (issues.length > 0) {
    throw new InvalidApplicationDataError(issues);
  }
}

function assertValidIdentifier(id: string): void {
  if (!uuidPattern.test(id)) {
    throw new InvalidApplicationIdentifierError(id);
  }
}

export class ApplicationService {
  constructor(
    private readonly repository: ApplicationPersistence,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getApplications(): Promise<Application[]> {
    return this.repository.findAll();
  }

  async getApplication(id: string): Promise<Application> {
    assertValidIdentifier(id);
    const application = await this.repository.findById(id);

    if (application === null) {
      throw new ApplicationNotFoundError(id);
    }

    return application;
  }

  async createApplication(command: ApplicationWriteCommand): Promise<Application> {
    validateCommand(command);
    return this.repository.create(command, {
      type: 'APPLICATION_CREATED',
      title: 'Application created',
      description: `Application for ${command.roleTitle} at ${command.companyName} was created.`,
      metadata: {
        companyName: command.companyName,
        roleTitle: command.roleTitle,
        status: command.status,
      },
      occurredAt: this.now(),
    });
  }

  async replaceApplication(
    id: string,
    command: ApplicationWriteCommand,
  ): Promise<Application> {
    assertValidIdentifier(id);
    validateCommand(command);
    const application = await this.repository.replace(id, command, (current) => {
      const occurredAt = this.now();
      const changedFields = mutableApplicationFields.filter(
        (field) => current[field] !== command[field],
      );
      const events: ApplicationEventDraft[] = [
        {
          type: 'APPLICATION_UPDATED',
          title: 'Application updated',
          description: 'Application details were updated.',
          metadata: { changedFields },
          occurredAt,
        },
      ];
      if (current.status !== command.status) {
        events.push({
          type: 'APPLICATION_STATUS_CHANGED',
          title: 'Application status changed',
          description: `Application status changed from ${current.status} to ${command.status}.`,
          metadata: {
            previousStatus: current.status,
            newStatus: command.status,
          },
          occurredAt,
        });
      }
      return events;
    });

    if (application === null) {
      throw new ApplicationNotFoundError(id);
    }

    return application;
  }
}
