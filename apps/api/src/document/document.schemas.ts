const uuid = { type: 'string', format: 'uuid' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const nonEmptyString = {
  type: 'string',
  minLength: 1,
  pattern: '\\S',
} as const;
const nullableMetadata = {
  anyOf: [
    { type: 'object', additionalProperties: true },
    { type: 'null' },
  ],
} as const;
const documentType = {
  type: 'string',
  enum: [
    'MARKDOWN_NOTE',
    'COVER_LETTER',
    'APPLICATION_BRIEF',
    'INTERVIEW_BRIEF',
  ],
} as const;

export const documentVersionResourceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'documentId', 'contentMarkdown', 'metadata', 'createdAt'],
  properties: {
    id: uuid,
    documentId: uuid,
    contentMarkdown: nonEmptyString,
    metadata: nullableMetadata,
    createdAt: timestamp,
  },
} as const;

export const documentMetadataResourceSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'candidateId',
    'applicationId',
    'type',
    'title',
    'currentVersionId',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: uuid,
    candidateId: { anyOf: [uuid, { type: 'null' }] },
    applicationId: { anyOf: [uuid, { type: 'null' }] },
    type: documentType,
    title: nonEmptyString,
    currentVersionId: uuid,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
} as const;

const documentResource = {
  type: 'object',
  additionalProperties: false,
  required: [
    ...documentMetadataResourceSchema.required,
    'currentVersion',
  ],
  properties: {
    ...documentMetadataResourceSchema.properties,
    currentVersion: documentVersionResourceSchema,
  },
} as const;

const documentSummaryResource = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'type',
    'title',
    'currentVersionId',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: uuid,
    type: documentType,
    title: nonEmptyString,
    currentVersionId: uuid,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
} as const;

export const documentIdentifierParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: uuid },
} as const;

export const createDocumentRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'candidateId',
    'applicationId',
    'type',
    'title',
    'contentMarkdown',
  ],
  properties: {
    candidateId: { anyOf: [uuid, { type: 'null' }] },
    applicationId: { anyOf: [uuid, { type: 'null' }] },
    type: documentType,
    title: nonEmptyString,
    contentMarkdown: nonEmptyString,
    metadata: nullableMetadata,
  },
  oneOf: [
    {
      properties: {
        candidateId: uuid,
        applicationId: { type: 'null' },
      },
    },
    {
      properties: {
        candidateId: { type: 'null' },
        applicationId: uuid,
      },
    },
  ],
} as const;

export const updateDocumentMetadataRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title'],
  properties: { type: documentType, title: nonEmptyString },
} as const;

export const createDocumentVersionRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['contentMarkdown'],
  properties: {
    contentMarkdown: nonEmptyString,
    metadata: nullableMetadata,
  },
} as const;

export const documentResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['document'],
  properties: { document: documentResource },
} as const;

export const documentVersionListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['versions'],
  properties: {
    versions: { type: 'array', items: documentVersionResourceSchema },
  },
} as const;

export const applicationDocumentListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['documents'],
  properties: {
    documents: { type: 'array', items: documentSummaryResource },
  },
} as const;
