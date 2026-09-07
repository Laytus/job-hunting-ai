export const applicationEventTypes = [
  'APPLICATION_CREATED',
  'APPLICATION_UPDATED',
  'APPLICATION_STATUS_CHANGED',
  'JOB_DESCRIPTION_CREATED',
  'JOB_DESCRIPTION_UPDATED',
  'INTERVIEW_CREATED',
  'INTERVIEW_UPDATED',
] as const;

export type ApplicationEventType = (typeof applicationEventTypes)[number];

export interface ApplicationEvent {
  readonly id: string;
  readonly applicationId: string;
  readonly type: ApplicationEventType;
  readonly title: string;
  readonly description: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly occurredAt: Date;
  readonly createdAt: Date;
}

export interface ApplicationEventDraft {
  readonly type: ApplicationEventType;
  readonly title: string;
  readonly description: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly occurredAt: Date;
}
