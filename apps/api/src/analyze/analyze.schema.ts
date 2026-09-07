import { z } from 'zod';
import type { LlmJsonSchemaResponseFormat } from '../llm/llm.types.js';
import {
  ANALYZE_SCHEMA_NAME,
  matchStrengths,
  requirementImportances,
} from './analyze.types.js';

const nonblankStringSchema = z.string().trim().min(1);
const nonblankStringArraySchema = z.array(nonblankStringSchema);

export const analyzeRequirementSchema = z.strictObject({
  requirement: nonblankStringSchema,
  importance: z.enum(requirementImportances),
  matchStrength: z.enum(matchStrengths),
  evidence: nonblankStringArraySchema,
});

export const analyzeCandidateEvidenceSchema = z.strictObject({
  claim: nonblankStringSchema,
  evidence: nonblankStringArraySchema,
});

export const analyzeHardConstraintSchema = z.strictObject({
  constraint: nonblankStringSchema,
  satisfied: z.boolean().nullable(),
  evidence: nonblankStringArraySchema,
});

export const analyzeOutputSchema = z.strictObject({
  roleSummary: nonblankStringSchema,
  fitSummary: nonblankStringSchema,
  requirements: z.array(analyzeRequirementSchema),
  candidateEvidence: z.array(analyzeCandidateEvidenceSchema),
  strengths: nonblankStringArraySchema,
  gaps: nonblankStringArraySchema,
  keywords: nonblankStringArraySchema,
  hardConstraints: z.array(analyzeHardConstraintSchema),
  warnings: nonblankStringArraySchema,
});

export type AnalyzeOutput = z.infer<typeof analyzeOutputSchema>;

const nonblankStringJsonSchema = {
  type: 'string',
  minLength: 1,
  pattern: '\\S',
} as const;

const nonblankStringArrayJsonSchema = {
  type: 'array',
  items: nonblankStringJsonSchema,
} as const;

export const analyzeOutputJsonSchema = {
  type: 'object',
  properties: {
    roleSummary: nonblankStringJsonSchema,
    fitSummary: nonblankStringJsonSchema,
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          requirement: nonblankStringJsonSchema,
          importance: { type: 'string', enum: requirementImportances },
          matchStrength: { type: 'string', enum: matchStrengths },
          evidence: nonblankStringArrayJsonSchema,
        },
        required: ['requirement', 'importance', 'matchStrength', 'evidence'],
        additionalProperties: false,
      },
    },
    candidateEvidence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: nonblankStringJsonSchema,
          evidence: nonblankStringArrayJsonSchema,
        },
        required: ['claim', 'evidence'],
        additionalProperties: false,
      },
    },
    strengths: nonblankStringArrayJsonSchema,
    gaps: nonblankStringArrayJsonSchema,
    keywords: nonblankStringArrayJsonSchema,
    hardConstraints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          constraint: nonblankStringJsonSchema,
          satisfied: { type: ['boolean', 'null'] },
          evidence: nonblankStringArrayJsonSchema,
        },
        required: ['constraint', 'satisfied', 'evidence'],
        additionalProperties: false,
      },
    },
    warnings: nonblankStringArrayJsonSchema,
  },
  required: [
    'roleSummary',
    'fitSummary',
    'requirements',
    'candidateEvidence',
    'strengths',
    'gaps',
    'keywords',
    'hardConstraints',
    'warnings',
  ],
  additionalProperties: false,
} as const;

export const analyzeResponseFormat = {
  type: 'json_schema',
  name: ANALYZE_SCHEMA_NAME,
  schema: analyzeOutputJsonSchema,
  strict: true,
} as const satisfies LlmJsonSchemaResponseFormat;
