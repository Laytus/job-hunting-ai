import {
  documentMetadataResourceSchema,
  documentVersionResourceSchema,
} from '../document/document.schemas.js';
import {
  coverLetterMarketSuggestionSources,
  coverLetterMarkets,
  coverLetterSectorSuggestionSources,
  coverLetterSectors,
  generationDocumentTypes,
  generationLanguages,
  generationWarnings,
} from './generation.types.js';

const uuid = { type: 'string', format: 'uuid' } as const;
const outputLanguage = {
  type: 'string',
  enum: generationLanguages,
} as const;
const coverLetterMarket = {
  type: 'string',
  enum: coverLetterMarkets,
} as const;
const coverLetterSector = {
  type: 'string',
  enum: coverLetterSectors,
} as const;

export const generationApplicationParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['applicationId'],
  properties: { applicationId: uuid },
} as const;

export const generationDocumentParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['applicationId', 'documentId'],
  properties: { applicationId: uuid, documentId: uuid },
} as const;

export const generateDocumentRequestSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['documentType', 'outputLanguage', 'market', 'sector'],
      properties: {
        documentType: { const: 'COVER_LETTER' },
        outputLanguage,
        market: coverLetterMarket,
        sector: coverLetterSector,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['documentType'],
      properties: {
        documentType: {
          type: 'string',
          enum: generationDocumentTypes.filter(
            (type) => type !== 'COVER_LETTER',
          ),
        },
      },
    },
  ],
} as const;

export const regenerateDocumentRequestSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['outputLanguage', 'market', 'sector'],
      properties: {
        outputLanguage,
        market: coverLetterMarket,
        sector: coverLetterSector,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { outputLanguage: { const: 'en' } },
    },
    { type: 'null' },
  ],
} as const;

export const coverLetterProfileSuggestionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestion'],
  properties: {
    suggestion: {
      type: 'object',
      additionalProperties: false,
      required: ['market', 'sector'],
      properties: {
        market: {
          type: 'object',
          additionalProperties: false,
          required: ['value', 'source'],
          properties: {
            value: {
              anyOf: [coverLetterMarket, { type: 'null' }],
            },
            source: {
              type: 'string',
              enum: coverLetterMarketSuggestionSources,
            },
          },
        },
        sector: {
          type: 'object',
          additionalProperties: false,
          required: ['value', 'source'],
          properties: {
            value: coverLetterSector,
            source: {
              type: 'string',
              enum: coverLetterSectorSuggestionSources,
            },
          },
        },
      },
    },
  },
} as const;

export const generationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['document', 'currentVersion', 'warnings'],
  properties: {
    document: documentMetadataResourceSchema,
    currentVersion: documentVersionResourceSchema,
    warnings: {
      type: 'array',
      items: { type: 'string', enum: generationWarnings },
      uniqueItems: true,
    },
  },
} as const;
