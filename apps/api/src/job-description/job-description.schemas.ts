const nonEmptyString = {
  type: 'string',
  minLength: 1,
  pattern: '\\S',
} as const;

const nullableNonEmptyString = {
  anyOf: [nonEmptyString, { type: 'null' }],
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

const nullableStructuredData = {
  anyOf: [
    { type: 'object', additionalProperties: true },
    { type: 'null' },
  ],
} as const;

const uuid = { type: 'string', format: 'uuid' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;

const writableProperties = {
  title: nullableNonEmptyString,
  companyName: nullableNonEmptyString,
  descriptionMarkdown: nonEmptyString,
  requirementsMarkdown: nullableNonEmptyString,
  responsibilitiesMarkdown: nullableNonEmptyString,
  structuredData: nullableStructuredData,
  sourceUrl: nullableHttpUrl,
} as const;

const resource = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'applicationId',
    'title',
    'companyName',
    'descriptionMarkdown',
    'requirementsMarkdown',
    'responsibilitiesMarkdown',
    'structuredData',
    'sourceUrl',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: uuid,
    applicationId: uuid,
    ...writableProperties,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
} as const;

export const jobDescriptionIdentifierParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: uuid },
} as const;

export const jobDescriptionWriteRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['descriptionMarkdown'],
  properties: writableProperties,
} as const;

export const jobDescriptionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['jobDescription'],
  properties: { jobDescription: resource },
} as const;

export const optionalJobDescriptionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['jobDescription'],
  properties: {
    jobDescription: {
      anyOf: [resource, { type: 'null' }],
    },
  },
} as const;
