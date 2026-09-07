import { describe, expect, it } from 'vitest';
import {
  researchOutputJsonSchema,
  researchOutputSchema,
  researchResponseFormat,
  type ResearchOutput,
} from './research.schema.js';
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

const emptyStructuredValue = {
  amount: null,
  amountMin: null,
  amountMax: null,
  currency: null,
  period: null,
  location: null,
  role: null,
  seniority: null,
  dataYear: null,
  stageOrder: null,
  frequency: null,
} as const;

const validOutput: ResearchOutput = {
  summaryMarkdown:
    'The company has an official Paris presence. Compensation reports conflict.',
  sources: [
    {
      id: 'source-1',
      url: 'https://example.com/official',
      title: 'Official company page',
      publisher: 'Analytical Engines Ltd',
      sourceType: 'OFFICIAL',
      sourceQuality: 'HIGH',
      publishedAt: '2026-07-15',
    },
    {
      id: 'source-2',
      url: 'https://example.com/salary-report',
      title: 'Salary report',
      publisher: null,
      sourceType: 'SALARY_DATABASE',
      sourceQuality: 'MEDIUM',
      publishedAt: null,
    },
    {
      id: 'source-3',
      url: 'https://example.com/interview-report',
      title: null,
      publisher: null,
      sourceType: 'INTERVIEW_REPORT',
      sourceQuality: 'LOW',
      publishedAt: '2025-01-10',
    },
  ],
  claims: [
    {
      id: 'claim-1',
      type: 'PARIS_PRESENCE',
      valueText: 'The company lists an office in Paris.',
      valueJson: null,
      evidenceType: 'FACT',
      sourceLinks: [
        {
          sourceId: 'source-1',
          relationship: 'SUPPORTS',
          evidenceText: 'The official locations page lists Paris.',
        },
      ],
    },
    {
      id: 'claim-2',
      type: 'SALARY_BASE',
      valueText: null,
      valueJson: {
        ...emptyStructuredValue,
        amount: 95_000,
        amountMin: null,
        amountMax: null,
        currency: 'EUR',
        period: 'YEAR',
        location: 'Paris',
        role: 'Staff Backend Engineer',
        seniority: 'Staff',
        dataYear: 2026,
      },
      evidenceType: 'REPORTED',
      sourceLinks: [
        {
          sourceId: 'source-2',
          relationship: 'SUPPORTS',
          evidenceText: 'The database reports a €95,000 annual base salary.',
        },
        {
          sourceId: 'source-3',
          relationship: 'CONTRADICTS',
          evidenceText: 'One report describes a lower annual base salary.',
        },
      ],
    },
    {
      id: 'claim-3',
      type: 'INTERVIEW_STAGE',
      valueText: 'A system-design interview is reported.',
      valueJson: {
        ...emptyStructuredValue,
        stageOrder: 3,
        frequency: 'MULTIPLE_REPORTS',
      },
      evidenceType: 'INFERRED',
      sourceLinks: [
        {
          sourceId: 'source-3',
          relationship: 'SUPPORTS',
          evidenceText: 'Multiple candidate reports mention system design.',
        },
      ],
    },
  ],
  warnings: ['CONFLICTING_SALARY_DATA', 'OUTDATED_INTERVIEW_REPORTS'],
};

describe('Research structured output contract', () => {
  it('accepts a rich evidence graph with text and structured claims', () => {
    expect(researchOutputSchema.parse(validOutput)).toEqual(validOutput);
  });

  it('accepts sparse and range-shaped structured outputs', () => {
    expect(
      researchOutputSchema.parse({
        summaryMarkdown: 'No reliable evidence was available.',
        sources: [],
        claims: [],
        warnings: ['NO_RELIABLE_COMPENSATION_DATA'],
      }),
    ).toBeTruthy();
    expect(
      researchOutputSchema.safeParse({
        ...validOutput,
        claims: [
          {
            ...validOutput.claims[1],
            valueJson: {
              ...emptyStructuredValue,
              amountMin: 90_000,
              amountMax: 110_000,
              currency: 'EUR',
              period: 'YEAR',
            },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('freezes enum parity between TypeScript constants and JSON Schema', () => {
    const sourceProperties =
      researchOutputJsonSchema.properties.sources.items.properties;
    const claimProperties =
      researchOutputJsonSchema.properties.claims.items.properties;
    const linkProperties = claimProperties.sourceLinks.items.properties;
    const structuredProperties = claimProperties.valueJson.properties;

    expect(sourceProperties.sourceType.enum).toEqual(researchSourceTypes);
    expect(sourceProperties.sourceQuality.enum).toEqual(
      researchSourceQualities,
    );
    expect(claimProperties.type.enum).toEqual(researchClaimTypes);
    expect(claimProperties.evidenceType.enum).toEqual(researchEvidenceTypes);
    expect(linkProperties.relationship.enum).toEqual(
      researchClaimSourceRelationships,
    );
    expect(structuredProperties.period.enum).toEqual([
      ...researchStructuredValuePeriods,
      null,
    ]);
    expect(structuredProperties.frequency.enum).toEqual([
      ...researchInterviewFrequencies,
      null,
    ]);
    expect(researchOutputJsonSchema.properties.warnings.items.enum).toEqual(
      researchWarningCodes,
    );
  });

  it.each([
    ['source type', { sources: [{ ...validOutput.sources[0], sourceType: 'BLOG' }] }],
    [
      'source quality',
      { sources: [{ ...validOutput.sources[0], sourceQuality: 'TRUSTED' }] },
    ],
    ['claim type', { claims: [{ ...validOutput.claims[0], type: 'SCORE' }] }],
    [
      'evidence type',
      { claims: [{ ...validOutput.claims[0], evidenceType: 'CERTAIN' }] },
    ],
    [
      'relationship',
      {
        claims: [
          {
            ...validOutput.claims[0],
            sourceLinks: [
              {
                ...validOutput.claims[0]!.sourceLinks[0],
                relationship: 'MENTIONS',
              },
            ],
          },
        ],
      },
    ],
    ['warning', { warnings: ['UNVERIFIED'] }],
  ] as const)('rejects an unknown %s enum value', (_label, override) => {
    expect(
      researchOutputSchema.safeParse({ ...validOutput, ...override }).success,
    ).toBe(false);
  });

  it.each([
    ['blank source ID', { sources: [{ ...validOutput.sources[0], id: '  ' }] }],
    ['blank URL', { sources: [{ ...validOutput.sources[0], url: '\t' }] }],
    [
      'blank claim ID',
      { claims: [{ ...validOutput.claims[0], id: '' }] },
    ],
    [
      'blank source-link ID',
      {
        claims: [
          {
            ...validOutput.claims[0],
            sourceLinks: [
              { ...validOutput.claims[0]!.sourceLinks[0], sourceId: ' ' },
            ],
          },
        ],
      },
    ],
    [
      'blank evidence text',
      {
        claims: [
          {
            ...validOutput.claims[0],
            sourceLinks: [
              { ...validOutput.claims[0]!.sourceLinks[0], evidenceText: '\n' },
            ],
          },
        ],
      },
    ],
  ] as const)('rejects %s', (_label, override) => {
    expect(
      researchOutputSchema.safeParse({ ...validOutput, ...override }).success,
    ).toBe(false);
  });

  it('rejects malformed dates, missing fields, nested extras, and claim confidence', () => {
    const missingWarnings: Partial<ResearchOutput> = { ...validOutput };
    delete missingWarnings.warnings;

    expect(researchOutputSchema.safeParse(missingWarnings).success).toBe(false);
    expect(
      researchOutputSchema.safeParse({
        ...validOutput,
        sources: [{ ...validOutput.sources[0], publishedAt: '2026/07/15' }],
      }).success,
    ).toBe(false);
    expect(
      researchOutputSchema.safeParse({
        ...validOutput,
        sources: [{ ...validOutput.sources[0], normalizedUrl: 'extra' }],
      }).success,
    ).toBe(false);
    expect(
      researchOutputSchema.safeParse({
        ...validOutput,
        claims: [{ ...validOutput.claims[0], confidence: 'HIGH' }],
      }).success,
    ).toBe(false);
    expect(
      researchOutputSchema.safeParse({
        ...validOutput,
        claims: [
          {
            ...validOutput.claims[0],
            valueJson: { amount: 95_000, currency: 'EUR' },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('keeps cross-field and graph invariants deferred to Phase 9.4', () => {
    expect(
      researchOutputSchema.safeParse({
        ...validOutput,
        claims: [
          {
            ...validOutput.claims[0],
            valueText: null,
            valueJson: null,
            sourceLinks: [
              {
                sourceId: 'missing-source',
                relationship: 'SUPPORTS',
                evidenceText: 'Structurally valid deferred reference.',
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('keeps the JSON Schema strict and response format reusable', () => {
    expect(researchOutputJsonSchema.required).toEqual([
      'summaryMarkdown',
      'sources',
      'claims',
      'warnings',
    ]);
    expect(researchOutputJsonSchema.additionalProperties).toBe(false);
    expect(
      researchOutputJsonSchema.properties.sources.items.additionalProperties,
    ).toBe(false);
    expect(
      researchOutputJsonSchema.properties.claims.items.additionalProperties,
    ).toBe(false);
    expect(
      researchOutputJsonSchema.properties.claims.items.properties.sourceLinks
        .items.additionalProperties,
    ).toBe(false);
    expect(
      researchOutputJsonSchema.properties.claims.items.properties.valueJson
        .additionalProperties,
    ).toBe(false);
    expect(
      researchOutputJsonSchema.properties.sources.items.required,
    ).toEqual(
      Object.keys(
        researchOutputJsonSchema.properties.sources.items.properties,
      ),
    );
    expect(researchOutputJsonSchema.properties.claims.items.required).toEqual(
      Object.keys(researchOutputJsonSchema.properties.claims.items.properties),
    );
    expect(
      researchOutputJsonSchema.properties.claims.items.properties.sourceLinks
        .items.required,
    ).toEqual(
      Object.keys(
        researchOutputJsonSchema.properties.claims.items.properties.sourceLinks
          .items.properties,
      ),
    );
    expect(
      researchOutputJsonSchema.properties.claims.items.properties.valueJson
        .required,
    ).toEqual(
      Object.keys(
        researchOutputJsonSchema.properties.claims.items.properties.valueJson
          .properties,
      ),
    );
    expect(researchResponseFormat).toEqual({
      type: 'json_schema',
      name: RESEARCH_SCHEMA_NAME,
      schema: researchOutputJsonSchema,
      strict: true,
    });
  });

  it('excludes model-controlled confidence, fit, priority, and provider metadata', () => {
    const serializedSchema = JSON.stringify(researchOutputJsonSchema);

    expect(serializedSchema).not.toContain('confidence');
    expect(serializedSchema).not.toContain('fitSummary');
    expect(serializedSchema).not.toContain('suggestedScore');
    expect(serializedSchema).not.toContain('priority');
    expect(serializedSchema).not.toContain('provider');
    expect(serializedSchema).not.toContain('usage');
    expect(serializedSchema).not.toContain('retrievedAt');
  });
});
