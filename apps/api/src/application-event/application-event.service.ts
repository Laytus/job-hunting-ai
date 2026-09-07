import {
  ApplicationEventApplicationNotFoundError,
  InvalidApplicationEventIdentifierError,
} from './application-event.errors.js';
import type { ApplicationEvent } from './application-event.types.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface ApplicationEventPersistence {
  applicationExists(applicationId: string): Promise<boolean>;
  findAllByApplicationId(applicationId: string): Promise<ApplicationEvent[]>;
}

export class ApplicationEventService {
  constructor(private readonly repository: ApplicationEventPersistence) {}

  async getApplicationEvents(applicationId: string): Promise<ApplicationEvent[]> {
    if (!uuidPattern.test(applicationId)) {
      throw new InvalidApplicationEventIdentifierError(applicationId);
    }
    if (!(await this.repository.applicationExists(applicationId))) {
      throw new ApplicationEventApplicationNotFoundError(applicationId);
    }

    return this.repository.findAllByApplicationId(applicationId);
  }
}
