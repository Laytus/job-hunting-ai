import { describe, expect, it } from 'vitest';
import {
  ApplicationEventApplicationNotFoundError,
  InvalidApplicationEventIdentifierError,
} from '../src/application-event/application-event.errors.js';
import {
  ApplicationEventService,
  type ApplicationEventPersistence,
} from '../src/application-event/application-event.service.js';
import type { ApplicationEvent } from '../src/application-event/application-event.types.js';

const applicationId = '10000000-0000-4000-8000-000000000000';

function event(overrides: Partial<ApplicationEvent> = {}): ApplicationEvent {
  return {
    id: '20000000-0000-4000-8000-000000000000',
    applicationId,
    type: 'APPLICATION_CREATED',
    title: 'Application created',
    description: 'An Application was created.',
    metadata: { status: 'FOUND' },
    occurredAt: new Date('2026-08-22T12:00:00.000Z'),
    createdAt: new Date('2026-08-22T12:00:01.000Z'),
    ...overrides,
  };
}

class FakeApplicationEventRepository implements ApplicationEventPersistence {
  exists = true;
  events: ApplicationEvent[] = [];
  readonly existenceCalls: string[] = [];
  readonly findCalls: string[] = [];

  async applicationExists(id: string): Promise<boolean> {
    this.existenceCalls.push(id);
    return this.exists;
  }

  async findAllByApplicationId(id: string): Promise<ApplicationEvent[]> {
    this.findCalls.push(id);
    return this.events;
  }
}

describe('ApplicationEventService', () => {
  it('returns the persisted event history for an Application', async () => {
    const repository = new FakeApplicationEventRepository();
    repository.events = [event()];
    const service = new ApplicationEventService(repository);

    await expect(service.getApplicationEvents(applicationId)).resolves.toBe(
      repository.events,
    );
    expect(repository.existenceCalls).toEqual([applicationId]);
    expect(repository.findCalls).toEqual([applicationId]);
  });

  it('rejects a malformed Application identifier before persistence', async () => {
    const repository = new FakeApplicationEventRepository();
    const service = new ApplicationEventService(repository);

    await expect(service.getApplicationEvents('invalid')).rejects.toBeInstanceOf(
      InvalidApplicationEventIdentifierError,
    );
    expect(repository.existenceCalls).toEqual([]);
    expect(repository.findCalls).toEqual([]);
  });

  it('reports a missing Application without querying events', async () => {
    const repository = new FakeApplicationEventRepository();
    repository.exists = false;
    const service = new ApplicationEventService(repository);

    await expect(
      service.getApplicationEvents(applicationId),
    ).rejects.toBeInstanceOf(ApplicationEventApplicationNotFoundError);
    expect(repository.findCalls).toEqual([]);
  });
});
