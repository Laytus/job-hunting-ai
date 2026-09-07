import { z } from 'zod';
import type { LlmJsonSchemaResponseFormat } from '../llm/llm.types.js';

const generatedStringSchema = z.string().min(1).max(6_000).regex(/\S/);
const generatedListItemSchema = z.string().min(1).max(1_500).regex(/\S/);

export const coverLetterOutputSchema = z.strictObject({
  paragraphs: z.array(generatedStringSchema.max(2_000)).min(3).max(5),
});

export const applicationBriefOutputSchema = z.strictObject({
  executiveSummary: generatedStringSchema,
  roleOverview: generatedStringSchema,
  positioningStrategy: generatedStringSchema,
  pointsToEmphasize: z.array(generatedListItemSchema).min(1).max(8),
  preparationPriorities: z.array(generatedListItemSchema).min(1).max(8),
});

export const interviewBriefOutputSchema = z.strictObject({
  interviewObjective: generatedStringSchema,
  candidatePositioning: generatedStringSchema,
  strengthPriorities: z.array(generatedListItemSchema).min(1).max(10),
  gapPreparation: z.array(generatedListItemSchema).min(1).max(10),
  technicalPreparation: z.array(generatedListItemSchema).min(1).max(10),
  behavioralPreparation: z.array(generatedListItemSchema).min(1).max(10),
  practiceQuestions: z.array(generatedListItemSchema).min(1).max(10),
  questionsToAsk: z.array(generatedListItemSchema).min(1).max(10),
  finalChecklist: z.array(generatedListItemSchema).min(1).max(10),
});

export type CoverLetterOutput = z.infer<typeof coverLetterOutputSchema>;
export type ApplicationBriefOutput = z.infer<
  typeof applicationBriefOutputSchema
>;
export type InterviewBriefOutput = z.infer<typeof interviewBriefOutputSchema>;

const generatedStringJsonSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 6_000,
  pattern: '\\S',
} as const;

const generatedListJsonSchema = {
  type: 'array',
  minItems: 1,
  maxItems: 10,
  items: {
    type: 'string',
    minLength: 1,
    maxLength: 1_500,
    pattern: '\\S',
  },
} as const;

export const coverLetterOutputJsonSchema = {
  type: 'object',
  properties: {
    paragraphs: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 2_000,
        pattern: '\\S',
      },
    },
  },
  required: ['paragraphs'],
  additionalProperties: false,
} as const;

export const applicationBriefOutputJsonSchema = {
  type: 'object',
  properties: {
    executiveSummary: generatedStringJsonSchema,
    roleOverview: generatedStringJsonSchema,
    positioningStrategy: generatedStringJsonSchema,
    pointsToEmphasize: { ...generatedListJsonSchema, maxItems: 8 },
    preparationPriorities: { ...generatedListJsonSchema, maxItems: 8 },
  },
  required: [
    'executiveSummary',
    'roleOverview',
    'positioningStrategy',
    'pointsToEmphasize',
    'preparationPriorities',
  ],
  additionalProperties: false,
} as const;

export const interviewBriefOutputJsonSchema = {
  type: 'object',
  properties: {
    interviewObjective: generatedStringJsonSchema,
    candidatePositioning: generatedStringJsonSchema,
    strengthPriorities: generatedListJsonSchema,
    gapPreparation: generatedListJsonSchema,
    technicalPreparation: generatedListJsonSchema,
    behavioralPreparation: generatedListJsonSchema,
    practiceQuestions: generatedListJsonSchema,
    questionsToAsk: generatedListJsonSchema,
    finalChecklist: generatedListJsonSchema,
  },
  required: [
    'interviewObjective',
    'candidatePositioning',
    'strengthPriorities',
    'gapPreparation',
    'technicalPreparation',
    'behavioralPreparation',
    'practiceQuestions',
    'questionsToAsk',
    'finalChecklist',
  ],
  additionalProperties: false,
} as const;

export const coverLetterResponseFormat = {
  type: 'json_schema',
  name: 'cover_letter_output',
  schema: coverLetterOutputJsonSchema,
  strict: true,
} as const satisfies LlmJsonSchemaResponseFormat;

export const applicationBriefResponseFormat = {
  type: 'json_schema',
  name: 'application_brief_output',
  schema: applicationBriefOutputJsonSchema,
  strict: true,
} as const satisfies LlmJsonSchemaResponseFormat;

export const interviewBriefResponseFormat = {
  type: 'json_schema',
  name: 'interview_brief_output',
  schema: interviewBriefOutputJsonSchema,
  strict: true,
} as const satisfies LlmJsonSchemaResponseFormat;
