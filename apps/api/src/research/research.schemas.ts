import {
  researchClaimSourceRelationships,
  researchClaimTypes,
  researchConfidences,
  researchEvidenceTypes,
  researchSourceQualities,
  researchSourceTypes,
  researchStatuses,
} from './research.types.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const calendarDate = { type: 'string', format: 'date' } as const;
const nullableTimestamp = { anyOf: [timestamp, { type: 'null' }] } as const;
const nullableCalendarDate = {
  anyOf: [calendarDate, { type: 'null' }],
} as const;
const nullableString = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const;
const nullableNonblankString = {
  anyOf: [
    { type: 'string', minLength: 1, pattern: '\\S' },
    { type: 'null' },
  ],
} as const;

const summaryProperties = {
  id: uuid,
  applicationId: uuid,
  status: { type: 'string', enum: researchStatuses },
  promptVersion: nullableNonblankString,
  researchDate: timestamp,
  failureCode: nullableNonblankString,
  failureMessage: nullableNonblankString,
  startedAt: timestamp,
  completedAt: nullableTimestamp,
  failedAt: nullableTimestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
} as const;

const summaryFields = [
  'id',
  'applicationId',
  'status',
  'promptVersion',
  'researchDate',
  'failureCode',
  'failureMessage',
  'startedAt',
  'completedAt',
  'failedAt',
  'createdAt',
  'updatedAt',
] as const;

const summaryResource = {
  type: 'object',
  additionalProperties: false,
  required: summaryFields,
  properties: summaryProperties,
} as const;

const sourceResource = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'url',
    'title',
    'publisher',
    'sourceType',
    'sourceQuality',
    'publishedAt',
    'retrievedAt',
    'notes',
    'createdAt',
  ],
  properties: {
    id: uuid,
    url: { type: 'string', minLength: 1 },
    title: nullableString,
    publisher: nullableString,
    sourceType: { type: 'string', enum: researchSourceTypes },
    sourceQuality: { type: 'string', enum: researchSourceQualities },
    publishedAt: nullableCalendarDate,
    retrievedAt: timestamp,
    notes: nullableString,
    createdAt: timestamp,
  },
} as const;

const claimResource = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'type',
    'valueText',
    'valueJson',
    'confidence',
    'evidenceType',
    'notes',
    'createdAt',
  ],
  properties: {
    id: uuid,
    type: { type: 'string', enum: researchClaimTypes },
    valueText: nullableString,
    valueJson: {
      anyOf: [
        { type: 'object', additionalProperties: true },
        { type: 'null' },
      ],
    },
    confidence: { type: 'string', enum: researchConfidences },
    evidenceType: { type: 'string', enum: researchEvidenceTypes },
    notes: nullableString,
    createdAt: timestamp,
  },
} as const;

const relationshipResource = {
  type: 'object',
  additionalProperties: false,
  required: ['claimId', 'sourceId', 'relationship', 'evidenceText'],
  properties: {
    claimId: uuid,
    sourceId: uuid,
    relationship: {
      type: 'string',
      enum: researchClaimSourceRelationships,
    },
    evidenceText: { type: 'string' },
  },
} as const;

const detailResource = {
  type: 'object',
  additionalProperties: false,
  required: [
    ...summaryFields,
    'summaryMarkdown',
    'warnings',
    'sources',
    'claims',
    'relationships',
  ],
  properties: {
    ...summaryProperties,
    summaryMarkdown: nullableString,
    warnings: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: sourceResource },
    claims: { type: 'array', items: claimResource },
    relationships: { type: 'array', items: relationshipResource },
  },
} as const;

export const researchApplicationParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['applicationId'],
  properties: { applicationId: uuid },
} as const;

export const researchDetailParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['applicationId', 'researchId'],
  properties: { applicationId: uuid, researchId: uuid },
} as const;

export const researchExecuteRequestSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      maxProperties: 0,
      properties: {},
    },
    { type: 'null' },
  ],
} as const;

export const researchDetailResponseSchema = detailResource;

export const researchHistoryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: { items: { type: 'array', items: summaryResource } },
} as const;
