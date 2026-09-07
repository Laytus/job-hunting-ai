import {
  applicationPriorities,
  applicationSources,
  applicationStatuses,
} from './application.types.js';

const nonEmptyString = {
  type: 'string',
  minLength: 1,
  pattern: '\\S',
} as const;

const nullableNonEmptyString = {
  anyOf: [nonEmptyString, { type: 'null' }],
} as const;

const uuid = {
  type: 'string',
  format: 'uuid',
} as const;

const date = {
  type: 'string',
  format: 'date',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
} as const;

const nullableDate = {
  anyOf: [date, { type: 'null' }],
} as const;

const timestamp = {
  type: 'string',
  format: 'date-time',
} as const;

const nullableHttpUrl = {
  anyOf: [
    {
      type: 'string',
      minLength: 1,
      format: 'uri',
      pattern: '^[hH][tT][tT][pP][sS]?://',
    },
    { type: 'null' },
  ],
} as const;

const writableProperties = {
  companyName: nonEmptyString,
  roleTitle: nonEmptyString,
  location: nullableNonEmptyString,
  jobUrl: nullableHttpUrl,
  source: { type: 'string', enum: applicationSources },
  status: { type: 'string', enum: applicationStatuses },
  priority: { type: 'string', enum: applicationPriorities },
  dateFound: nullableDate,
  dateApplied: nullableDate,
  notesMarkdown: nullableNonEmptyString,
} as const;

const writableFields = [
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

export const applicationWriteRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: writableFields,
  properties: writableProperties,
} as const;

export const applicationIdentifierParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: uuid },
} as const;

const applicationResource = {
  type: 'object',
  additionalProperties: false,
  required: [...writableFields, 'id', 'createdAt', 'updatedAt'],
  properties: {
    id: uuid,
    ...writableProperties,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
} as const;

export const applicationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['application'],
  properties: {
    application: applicationResource,
  },
} as const;

export const applicationListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['applications'],
  properties: {
    applications: {
      type: 'array',
      items: applicationResource,
    },
  },
} as const;
