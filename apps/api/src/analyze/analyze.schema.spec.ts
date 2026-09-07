import { describe, expect, it } from 'vitest';
import {
  analyzeOutputJsonSchema,
  analyzeOutputSchema,
  analyzeResponseFormat,
  type AnalyzeOutput,
} from './analyze.schema.js';
import {
  ANALYZE_SCHEMA_NAME,
  matchStrengths,
  requirementImportances,
} from './analyze.types.js';

const validOutput: AnalyzeOutput = {
  roleSummary: 'Build reliable distributed systems.',
  fitSummary: 'The candidate has relevant backend experience.',
  requirements: [
    {
      requirement: 'Production TypeScript experience',
      importance: 'REQUIRED',
      matchStrength: 'STRONG',
      evidence: ['Built and operated TypeScript services.'],
    },
  ],
  candidateEvidence: [
    {
      claim: 'Strong backend delivery experience',
      evidence: ['Led a service migration.'],
    },
  ],
  strengths: ['Distributed systems experience'],
  gaps: ['No explicit Kubernetes certification'],
  keywords: ['TypeScript', 'PostgreSQL'],
  hardConstraints: [
    {
      constraint: 'Must be located in Chile',
      satisfied: null,
      evidence: [],
    },
  ],
  warnings: ['Candidate location is not explicit.'],
};

describe('Analyze structured output contract', () => {
  it('freezes exact enum values across TypeScript, Zod, and JSON Schema', () => {
    expect(requirementImportances).toEqual([
      'REQUIRED',
      'PREFERRED',
      'IMPLICIT',
      'UNKNOWN',
    ]);
    expect(matchStrengths).toEqual([
      'STRONG',
      'PARTIAL',
      'WEAK',
      'NONE',
      'UNKNOWN',
    ]);
    expect(
      analyzeOutputJsonSchema.properties.requirements.items.properties.importance
        .enum,
    ).toEqual(requirementImportances);
    expect(
      analyzeOutputJsonSchema.properties.requirements.items.properties.matchStrength
        .enum,
    ).toEqual(matchStrengths);
  });

  it('accepts the complete frozen output shape', () => {
    expect(analyzeOutputSchema.parse(validOutput)).toEqual(validOutput);
  });

  it('rejects missing top-level fields and unknown fields', () => {
    const missingWarnings: Partial<AnalyzeOutput> = { ...validOutput };
    delete missingWarnings.warnings;

    expect(analyzeOutputSchema.safeParse(missingWarnings).success).toBe(false);
    expect(
      analyzeOutputSchema.safeParse({ ...validOutput, finalScore: 80 }).success,
    ).toBe(false);
  });

  it('rejects malformed nested objects and invalid enum values', () => {
    expect(
      analyzeOutputSchema.safeParse({
        ...validOutput,
        requirements: [
          {
            requirement: 'TypeScript',
            importance: 'MANDATORY',
            matchStrength: 'STRONG',
            evidence: 'Not an array',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it.each([
    { ...validOutput, roleSummary: '   ' },
    { ...validOutput, strengths: [''] },
    {
      ...validOutput,
      candidateEvidence: [{ claim: '\t', evidence: [] }],
    },
    {
      ...validOutput,
      hardConstraints: [
        { constraint: 'Remote availability', satisfied: null, evidence: [' '] },
      ],
    },
  ])('rejects blank required strings and array entries', (output) => {
    expect(analyzeOutputSchema.safeParse(output).success).toBe(false);
  });

  it('keeps JSON Schema strict and aligned with required top-level fields', () => {
    expect(analyzeOutputJsonSchema.required).toEqual([
      'roleSummary',
      'fitSummary',
      'requirements',
      'candidateEvidence',
      'strengths',
      'gaps',
      'keywords',
      'hardConstraints',
      'warnings',
    ]);
    expect(analyzeOutputJsonSchema.additionalProperties).toBe(false);
    expect(
      analyzeOutputJsonSchema.properties.requirements.items.additionalProperties,
    ).toBe(false);
    expect(
      analyzeOutputJsonSchema.properties.candidateEvidence.items
        .additionalProperties,
    ).toBe(false);
    expect(
      analyzeOutputJsonSchema.properties.hardConstraints.items
        .additionalProperties,
    ).toBe(false);
    expect(analyzeResponseFormat).toEqual({
      type: 'json_schema',
      name: ANALYZE_SCHEMA_NAME,
      schema: analyzeOutputJsonSchema,
      strict: true,
    });
  });

  it('excludes numeric scoring and Application priority from the LLM contract', () => {
    const serializedSchema = JSON.stringify(analyzeOutputJsonSchema);

    expect(serializedSchema).not.toContain('suggestedScore');
    expect(serializedSchema).not.toContain('finalScore');
    expect(serializedSchema).not.toContain('priority');
    expect(serializedSchema).not.toContain('applicationPriority');
  });
});
