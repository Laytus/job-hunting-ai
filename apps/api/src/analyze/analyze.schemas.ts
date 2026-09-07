import { analyzeOutputJsonSchema } from './analyze.schema.js';
import { jobAnalysisStatuses } from './analyze.types.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const nullableTimestamp = {
  anyOf: [timestamp, { type: 'null' }],
} as const;
const nullableNonblankString = {
  anyOf: [
    { type: 'string', minLength: 1, pattern: '\\S' },
    { type: 'null' },
  ],
} as const;
const nullableScore = {
  anyOf: [
    { type: 'integer', minimum: 0, maximum: 100 },
    { type: 'null' },
  ],
} as const;

const summaryProperties = {
  id: uuid,
  applicationId: uuid,
  status: { type: 'string', enum: jobAnalysisStatuses },
  suggestedScore: nullableScore,
  failureCode: nullableNonblankString,
  failureMessage: nullableNonblankString,
  promptVersion: { type: 'string', minLength: 1, pattern: '\\S' },
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
  'suggestedScore',
  'failureCode',
  'failureMessage',
  'promptVersion',
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

const detailResource = {
  type: 'object',
  additionalProperties: false,
  required: [...summaryFields, 'analysisData'],
  properties: {
    ...summaryProperties,
    analysisData: {
      anyOf: [analyzeOutputJsonSchema, { type: 'null' }],
    },
  },
} as const;

export const analyzeApplicationParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['applicationId'],
  properties: { applicationId: uuid },
} as const;

export const analyzeDetailParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['applicationId', 'analysisId'],
  properties: { applicationId: uuid, analysisId: uuid },
} as const;

export const analyzeExecuteRequestSchema = {
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

export const jobAnalysisDetailResponseSchema = detailResource;

export const analyzeHistoryResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: { type: 'array', items: summaryResource },
  },
} as const;
