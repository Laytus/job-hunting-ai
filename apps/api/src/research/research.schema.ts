import { z } from 'zod';
import type { LlmJsonSchemaResponseFormat } from '../llm/llm.types.js';
import {
  RESEARCH_SCHEMA_NAME,
  researchClaimSourceRelationships,
  researchClaimTypes,
  researchEvidenceTypes,
  researchInterviewFrequencies,
  researchSourceQualities,
  researchSourceTypes,
  researchStructuredValuePeriods,
  researchWarningCodes,
} from './research.types.js';

const nonblankStringSchema = z.string().trim().min(1);
const nullableStringSchema = z.string().nullable();
const publishedDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .nullable();

export const researchStructuredValueSchema = z.strictObject({
  amount: z.number().nullable(),
  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),
  currency: nullableStringSchema,
  period: z.enum(researchStructuredValuePeriods).nullable(),
  location: nullableStringSchema,
  role: nullableStringSchema,
  seniority: nullableStringSchema,
  dataYear: z.number().int().nullable(),
  stageOrder: z.number().int().nullable(),
  frequency: z.enum(researchInterviewFrequencies).nullable(),
});

export const researchOutputSourceSchema = z.strictObject({
  id: nonblankStringSchema,
  url: nonblankStringSchema,
  title: nullableStringSchema,
  publisher: nullableStringSchema,
  sourceType: z.enum(researchSourceTypes),
  sourceQuality: z.enum(researchSourceQualities),
  publishedAt: publishedDateSchema,
});

export const researchOutputSourceLinkSchema = z.strictObject({
  sourceId: nonblankStringSchema,
  relationship: z.enum(researchClaimSourceRelationships),
  evidenceText: nonblankStringSchema,
});

export const researchOutputClaimSchema = z.strictObject({
  id: nonblankStringSchema,
  type: z.enum(researchClaimTypes),
  valueText: z.string().nullable(),
  valueJson: researchStructuredValueSchema.nullable(),
  evidenceType: z.enum(researchEvidenceTypes),
  sourceLinks: z.array(researchOutputSourceLinkSchema),
});

export const researchOutputSchema = z.strictObject({
  summaryMarkdown: z.string(),
  sources: z.array(researchOutputSourceSchema),
  claims: z.array(researchOutputClaimSchema),
  warnings: z.array(z.enum(researchWarningCodes)),
});

export type ResearchStructuredValue = z.infer<
  typeof researchStructuredValueSchema
>;
export type ResearchOutputSource = z.infer<typeof researchOutputSourceSchema>;
export type ResearchOutputSourceLink = z.infer<
  typeof researchOutputSourceLinkSchema
>;
export type ResearchOutputClaim = z.infer<typeof researchOutputClaimSchema>;
export type ResearchOutput = z.infer<typeof researchOutputSchema>;

const nonblankStringJsonSchema = {
  type: 'string',
  minLength: 1,
  pattern: '\\S',
} as const;

const nullableStringJsonSchema = {
  type: ['string', 'null'],
} as const;

const researchStructuredValueJsonSchema = {
  type: ['object', 'null'],
  properties: {
    amount: { type: ['number', 'null'] },
    amountMin: { type: ['number', 'null'] },
    amountMax: { type: ['number', 'null'] },
    currency: nullableStringJsonSchema,
    period: {
      type: ['string', 'null'],
      enum: [...researchStructuredValuePeriods, null],
    },
    location: nullableStringJsonSchema,
    role: nullableStringJsonSchema,
    seniority: nullableStringJsonSchema,
    dataYear: { type: ['integer', 'null'] },
    stageOrder: { type: ['integer', 'null'] },
    frequency: {
      type: ['string', 'null'],
      enum: [...researchInterviewFrequencies, null],
    },
  },
  required: [
    'amount',
    'amountMin',
    'amountMax',
    'currency',
    'period',
    'location',
    'role',
    'seniority',
    'dataYear',
    'stageOrder',
    'frequency',
  ],
  additionalProperties: false,
} as const;

export const researchOutputJsonSchema = {
  type: 'object',
  properties: {
    summaryMarkdown: { type: 'string' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: nonblankStringJsonSchema,
          url: nonblankStringJsonSchema,
          title: nullableStringJsonSchema,
          publisher: nullableStringJsonSchema,
          sourceType: { type: 'string', enum: researchSourceTypes },
          sourceQuality: { type: 'string', enum: researchSourceQualities },
          publishedAt: {
            type: ['string', 'null'],
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
        },
        required: [
          'id',
          'url',
          'title',
          'publisher',
          'sourceType',
          'sourceQuality',
          'publishedAt',
        ],
        additionalProperties: false,
      },
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: nonblankStringJsonSchema,
          type: { type: 'string', enum: researchClaimTypes },
          valueText: nullableStringJsonSchema,
          valueJson: researchStructuredValueJsonSchema,
          evidenceType: { type: 'string', enum: researchEvidenceTypes },
          sourceLinks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sourceId: nonblankStringJsonSchema,
                relationship: {
                  type: 'string',
                  enum: researchClaimSourceRelationships,
                },
                evidenceText: nonblankStringJsonSchema,
              },
              required: ['sourceId', 'relationship', 'evidenceText'],
              additionalProperties: false,
            },
          },
        },
        required: [
          'id',
          'type',
          'valueText',
          'valueJson',
          'evidenceType',
          'sourceLinks',
        ],
        additionalProperties: false,
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string', enum: researchWarningCodes },
    },
  },
  required: ['summaryMarkdown', 'sources', 'claims', 'warnings'],
  additionalProperties: false,
} as const;

export const researchResponseFormat = {
  type: 'json_schema',
  name: RESEARCH_SCHEMA_NAME,
  schema: researchOutputJsonSchema,
  strict: true,
} as const satisfies LlmJsonSchemaResponseFormat;
