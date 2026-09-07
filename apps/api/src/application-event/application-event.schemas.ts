import { applicationEventTypes } from './application-event.types.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;

const applicationEventResource = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'applicationId',
    'type',
    'title',
    'description',
    'metadata',
    'occurredAt',
    'createdAt',
  ],
  properties: {
    id: uuid,
    applicationId: uuid,
    type: { type: 'string', enum: applicationEventTypes },
    title: { type: 'string', minLength: 1, pattern: '\\S' },
    description: { type: 'string', minLength: 1, pattern: '\\S' },
    metadata: {
      anyOf: [
        { type: 'object', additionalProperties: true },
        { type: 'null' },
      ],
    },
    occurredAt: timestamp,
    createdAt: timestamp,
  },
} as const;

export const applicationEventParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: uuid },
} as const;

export const applicationEventListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: { type: 'array', items: applicationEventResource },
  },
} as const;
