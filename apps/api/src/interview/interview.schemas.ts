import { interviewStatuses, interviewTypes } from './interview.types.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const nullableTimestamp = { anyOf: [timestamp, { type: 'null' }] } as const;
const nullableNonEmptyString = {
  anyOf: [
    { type: 'string', minLength: 1, pattern: '\\S' },
    { type: 'null' },
  ],
} as const;

const writableProperties = {
  type: { type: 'string', enum: interviewTypes },
  status: { type: 'string', enum: interviewStatuses },
  scheduledAt: nullableTimestamp,
  completedAt: nullableTimestamp,
  notesMarkdown: nullableNonEmptyString,
  feedbackMarkdown: nullableNonEmptyString,
  sortOrder: { type: 'integer', minimum: 0 },
} as const;

const writableFields = [
  'type',
  'status',
  'scheduledAt',
  'completedAt',
  'notesMarkdown',
  'feedbackMarkdown',
  'sortOrder',
] as const;

const interviewResource = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'applicationId', ...writableFields, 'createdAt', 'updatedAt'],
  properties: {
    id: uuid,
    applicationId: uuid,
    ...writableProperties,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
} as const;

export const interviewApplicationParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: uuid },
} as const;

export const interviewIdentifierParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'interviewId'],
  properties: { id: uuid, interviewId: uuid },
} as const;

export const interviewWriteRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: writableFields,
  properties: writableProperties,
} as const;

export const interviewResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['interview'],
  properties: { interview: interviewResource },
} as const;

export const interviewListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['interviews'],
  properties: {
    interviews: { type: 'array', items: interviewResource },
  },
} as const;
