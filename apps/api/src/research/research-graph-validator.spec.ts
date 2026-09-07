import { describe, expect, it, vi } from 'vitest';
import type { LlmWebSource } from '../llm/llm.types.js';
import { ResearchValidationError } from './research.errors.js';
import {
  RESEARCH_MAX_SOURCES,
  ResearchGraphValidator,
} from './research-graph-validator.js';
import type {
  ResearchOutput,
  ResearchOutputClaim,
  ResearchOutputSource,
  ResearchStructuredValue,
} from './research.schema.js';
import type { ResearchWarningCode } from './research.types.js';

const researchDate = new Date('2026-08-26T12:00:00.000Z');
const validator = new ResearchGraphValidator();

function structuredValue(
  overrides: Partial<ResearchStructuredValue> = {},
): ResearchStructuredValue {
  return {
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
    ...overrides,
  };
}

function source(
  id: string,
  overrides: Partial<ResearchOutputSource> = {},
): ResearchOutputSource {
  return {
    id,
    url: `https://${id}.example/report`,
    title: `${id} report`,
    publisher: `${id} publisher`,
    sourceType: 'NEWS',
    sourceQuality: 'HIGH',
    publishedAt: '2026-01-01',
    ...overrides,
  };
}

function claim(
  id: string,
  sourceId: string,
  overrides: Partial<ResearchOutputClaim> = {},
): ResearchOutputClaim {
  return {
    id,
    type: 'ROLE_INFORMATION',
    valueText: `${id} value`,
    valueJson: null,
    evidenceType: 'FACT',
    sourceLinks: [
      {
        sourceId,
        relationship: 'SUPPORTS',
        evidenceText: `${id} evidence`,
      },
    ],
    ...overrides,
  };
}

function output(
  overrides: Partial<ResearchOutput> = {},
): ResearchOutput {
  return {
    summaryMarkdown: 'Original summary',
    sources: [source('source-1')],
    claims: [claim('claim-1', 'source-1')],
    warnings: [],
    ...overrides,
  };
}

function providerSources(value: ResearchOutput): LlmWebSource[] {
  return value.sources.map(({ url }) => ({ url }));
}

function validate(
  value: ResearchOutput,
  providerWebSources: readonly LlmWebSource[] = providerSources(value),
) {
  return validator.validate({
    output: value,
    providerWebSources,
    researchDate,
  });
}

function expectValidationError(
  execute: () => unknown,
  code: ResearchValidationError['code'],
  reason: ResearchValidationError['reason'],
): void {
  expect(execute).toThrowError(
    expect.objectContaining<Partial<ResearchValidationError>>({ code, reason }),
  );
}

describe('ResearchGraphValidator provider provenance', () => {
  it.each([
    [
      'exact',
      'https://example.com/report',
      'https://example.com/report',
    ],
    [
      'case equivalent',
      'HTTPS://EXAMPLE.COM/report',
      'https://example.com/report',
    ],
    [
      'fragment equivalent',
      'https://example.com/report#structured',
      'https://example.com/report#provider',
    ],
    [
      'tracking equivalent',
      'https://example.com/report?role=staff&utm_source=model',
      'https://example.com/report?role=staff&fbclid=provider',
    ],
  ])('accepts an %s normalized URL match', (_label, structuredUrl, providerUrl) => {
    const value = output({
      sources: [source('source-1', { url: structuredUrl })],
    });

    expect(validate(value, [{ url: providerUrl }]).sources).toHaveLength(1);
  });

  it('uses provider set semantics and ignores provider-only URLs', () => {
    const value = output();
    const graph = validate(value, [
      { url: value.sources[0]!.url },
      { url: value.sources[0]!.url },
      { url: 'https://provider-only.example/report' },
    ]);

    expect(graph.sources).toHaveLength(1);
    expect(graph.sources[0]?.normalizedUrl).toBe(
      'https://source-1.example/report',
    );
  });

  it('provenance-checks but does not persist structured orphan sources', () => {
    const value = output({
      sources: [source('linked'), source('orphan')],
      claims: [claim('claim-1', 'linked')],
    });

    const graph = validate(value);

    expect(graph.sources.map(({ key }) => key)).toEqual(['linked']);
    expect(graph.relationships).toHaveLength(1);
  });

  it('does not let an unverified structured orphan bypass provenance', () => {
    const value = output({
      sources: [source('linked'), source('orphan')],
      claims: [claim('claim-1', 'linked')],
    });

    expectValidationError(
      () => validate(value, [{ url: value.sources[0]!.url }]),
      'UNVERIFIED_RESEARCH_SOURCE',
      'SOURCE_NOT_REPORTED_BY_PROVIDER',
    );
  });

  it('ignores malformed and blank provider-only metadata when a valid match exists', () => {
    const value = output();
    const graph = validate(value, [
      { url: value.sources[0]!.url },
      { url: 'not-a-valid-url' },
      { url: '   ' },
    ]);

    expect(graph.sources).toHaveLength(1);
    expect(graph.sources[0]?.normalizedUrl).toBe(
      'https://source-1.example/report',
    );
  });

  it('remains fail-closed when provider metadata has no valid matching URL', () => {
    expectValidationError(
      () => validate(output(), [{ url: 'not-a-valid-url' }, { url: '' }]),
      'UNVERIFIED_RESEARCH_SOURCE',
      'SOURCE_NOT_REPORTED_BY_PROVIDER',
    );
  });

  it('keeps structured source URL validation strict when provider metadata is valid', () => {
    const value = output({
      sources: [source('source-1', { url: 'not-a-valid-url' })],
    });

    expectValidationError(
      () => validate(value, [{ url: 'https://valid.example/report' }]),
      'INVALID_RESEARCH_SOURCE',
      'INVALID_URL',
    );
  });

  it('does not use fuzzy or semantic URL matching', () => {
    const value = output({
      sources: [
        source('source-1', { url: 'https://example.com/report?role=staff' }),
      ],
    });

    expectValidationError(
      () => validate(value, [{ url: 'https://example.com/report?role=senior' }]),
      'UNVERIFIED_RESEARCH_SOURCE',
      'SOURCE_NOT_REPORTED_BY_PROVIDER',
    );
  });

  it('rejects structured sources when provider metadata is empty or missing a URL', () => {
    const value = output();

    expectValidationError(
      () => validate(value, []),
      'UNVERIFIED_RESEARCH_SOURCE',
      'SOURCE_NOT_REPORTED_BY_PROVIDER',
    );
    expectValidationError(
      () => validate(value, [{ url: 'https://other.example/report' }]),
      'UNVERIFIED_RESEARCH_SOURCE',
      'SOURCE_NOT_REPORTED_BY_PROVIDER',
    );
  });
});

describe('ResearchGraphValidator source handling', () => {
  it('enforces the hard source ceiling without truncation', () => {
    const sources = Array.from({ length: RESEARCH_MAX_SOURCES + 1 }, (_, index) =>
      source(`source-${String(index + 1)}`),
    );
    const value = output({ sources, claims: [] });

    expectValidationError(
      () => validate(value),
      'RESEARCH_SOURCE_LIMIT_EXCEEDED',
      'TOO_MANY_SOURCES',
    );
  });

  it('rejects duplicate logical source IDs', () => {
    const value = output({
      sources: [
        source('duplicate', { url: 'https://one.example/report' }),
        source('duplicate', { url: 'https://two.example/report' }),
      ],
      claims: [claim('claim-1', 'duplicate')],
    });

    expectValidationError(
      () => validate(value),
      'INVALID_RESEARCH_SOURCE',
      'DUPLICATE_SOURCE_ID',
    );
  });

  it('collapses normalized-equivalent sources, safely fills missing metadata, and remaps links', () => {
    const sources = [
      source('source-a', {
        url: 'https://example.com/report/?utm_source=first',
        title: null,
        publisher: 'Example Publisher',
      }),
      source('source-b', {
        url: 'https://EXAMPLE.com/report#second',
        title: 'Canonical report',
        publisher: 'Example Publisher',
      }),
    ];
    const value = output({
      sources,
      claims: [claim('claim-1', 'source-b')],
    });

    const graph = validate(value, [{ url: 'https://example.com/report' }]);

    expect(graph.sources).toEqual([
      expect.objectContaining({
        key: 'source-a',
        normalizedUrl: 'https://example.com/report',
        title: 'Canonical report',
        publisher: 'Example Publisher',
      }),
    ]);
    expect(graph.relationships).toEqual([
      expect.objectContaining({
        claimKey: 'claim-1',
        sourceKey: 'source-a',
      }),
    ]);
  });

  it.each([
    ['title', { title: 'Conflicting title' }],
    ['publisher', { publisher: 'Conflicting publisher' }],
    ['publishedAt', { publishedAt: '2025-01-01' }],
    ['sourceType', { sourceType: 'FORUM' as const }],
    ['sourceQuality', { sourceQuality: 'LOW' as const }],
  ])('rejects conflicting %s for one normalized source', (_label, override) => {
    const value = output({
      sources: [
        source('source-a', { url: 'https://example.com/report' }),
        source('source-b', {
          url: 'https://example.com/report/',
          ...override,
        }),
      ],
      claims: [claim('claim-1', 'source-a')],
    });

    expectValidationError(
      () => validate(value, [{ url: 'https://example.com/report' }]),
      'INVALID_RESEARCH_SOURCE',
      'CONFLICTING_SOURCE_METADATA',
    );
  });

  it('rejects a structurally formatted but impossible publication date', () => {
    const value = output({
      sources: [source('source-1', { publishedAt: '2026-02-30' })],
    });

    expectValidationError(
      () => validate(value),
      'INVALID_RESEARCH_SOURCE',
      'INVALID_PUBLISHED_DATE',
    );
  });

  it('accepts a source published on the same UTC calendar date as Research', () => {
    const value = output({
      sources: [source('source-1', { publishedAt: '2026-08-26' })],
    });

    expect(validate(value).sources[0]?.publishedAt).toBe('2026-08-26');
  });

  it('rejects a future publication date before confidence calculation', () => {
    const confidenceService = {
      calculate: vi.fn(() => 'HIGH' as const),
    };
    const futureDateValidator = new ResearchGraphValidator(confidenceService);
    const value = output({
      sources: [source('source-1', { publishedAt: '2026-08-27' })],
    });

    expectValidationError(
      () =>
        futureDateValidator.validate({
          output: value,
          providerWebSources: providerSources(value),
          researchDate: new Date('2026-08-26T02:00:00.000Z'),
        }),
      'INVALID_RESEARCH_SOURCE',
      'INVALID_PUBLISHED_DATE',
    );
    expect(confidenceService.calculate).not.toHaveBeenCalled();
  });
});

describe('ResearchGraphValidator graph validation', () => {
  it('rejects blank logical source and claim IDs at the business boundary', () => {
    const blankSource = output({
      sources: [source('source-1', { id: '   ' })],
      claims: [],
    });
    const blankClaim = output({
      claims: [claim('claim-1', 'source-1', { id: '\t' })],
    });

    expectValidationError(
      () => validate(blankSource),
      'INVALID_RESEARCH_SOURCE',
      'INVALID_SOURCE_ID',
    );
    expectValidationError(
      () => validate(blankClaim),
      'INVALID_RESEARCH_CLAIM',
      'INVALID_CLAIM_ID',
    );
  });

  it('rejects duplicate claim IDs', () => {
    const value = output({
      claims: [claim('duplicate', 'source-1'), claim('duplicate', 'source-1')],
    });

    expectValidationError(
      () => validate(value),
      'INVALID_RESEARCH_CLAIM',
      'DUPLICATE_CLAIM_ID',
    );
  });

  it('rejects unknown source references', () => {
    const value = output({ claims: [claim('claim-1', 'missing-source')] });

    expectValidationError(
      () => validate(value),
      'INVALID_CLAIM_SOURCE_RELATIONSHIP',
      'UNKNOWN_SOURCE_REFERENCE',
    );
  });

  it('rejects duplicate claim/source links before persistence', () => {
    const value = output({
      claims: [
        claim('claim-1', 'source-1', {
          sourceLinks: [
            {
              sourceId: 'source-1',
              relationship: 'SUPPORTS',
              evidenceText: 'support',
            },
            {
              sourceId: 'source-1',
              relationship: 'CONTRADICTS',
              evidenceText: 'contradiction',
            },
          ],
        }),
      ],
    });

    expectValidationError(
      () => validate(value),
      'INVALID_CLAIM_SOURCE_RELATIONSHIP',
      'DUPLICATE_CLAIM_SOURCE_LINK',
    );
  });

  it('rejects links that become duplicates after normalized source deduplication', () => {
    const value = output({
      sources: [
        source('source-a', {
          url: 'https://example.com/report',
          title: 'Same report',
          publisher: 'Same publisher',
        }),
        source('source-b', {
          url: 'https://example.com/report/',
          title: 'Same report',
          publisher: 'Same publisher',
        }),
      ],
      claims: [
        claim('claim-1', 'source-a', {
          sourceLinks: [
            {
              sourceId: 'source-a',
              relationship: 'SUPPORTS',
              evidenceText: 'first',
            },
            {
              sourceId: 'source-b',
              relationship: 'SUPPORTS',
              evidenceText: 'second',
            },
          ],
        }),
      ],
    });

    expectValidationError(
      () => validate(value, [{ url: 'https://example.com/report' }]),
      'INVALID_CLAIM_SOURCE_RELATIONSHIP',
      'DUPLICATE_CLAIM_SOURCE_LINK',
    );
  });

  it('rejects evidence-free claims and missing substantive values', () => {
    expectValidationError(
      () =>
        validate(
          output({ claims: [claim('claim-1', 'source-1', { sourceLinks: [] })] }),
        ),
      'INVALID_RESEARCH_CLAIM',
      'MISSING_CLAIM_EVIDENCE',
    );
    expectValidationError(
      () =>
        validate(
          output({
            claims: [
              claim('claim-1', 'source-1', {
                valueText: null,
                valueJson: null,
              }),
            ],
          }),
        ),
      'INVALID_RESEARCH_CLAIM',
      'MISSING_CLAIM_VALUE',
    );
    expectValidationError(
      () =>
        validate(
          output({
            claims: [
              claim('claim-1', 'source-1', {
                valueText: '   ',
                valueJson: null,
              }),
            ],
          }),
        ),
      'INVALID_RESEARCH_CLAIM',
      'MISSING_CLAIM_VALUE',
    );
  });

  it('rejects a claim supported only by contradiction evidence', () => {
    const value = output({
      claims: [
        claim('claim-1', 'source-1', {
          sourceLinks: [
            {
              sourceId: 'source-1',
              relationship: 'CONTRADICTS',
              evidenceText: 'This source materially contradicts the claim.',
            },
          ],
        }),
      ],
    });

    expectValidationError(
      () => validate(value),
      'INVALID_RESEARCH_CLAIM',
      'MISSING_SUPPORTING_EVIDENCE',
    );
  });

  it('preserves both SUPPORTS and CONTRADICTS relationships and concise evidence', () => {
    const value = output({
      sources: [source('support'), source('contradiction')],
      claims: [
        claim('claim-1', 'support', {
          sourceLinks: [
            {
              sourceId: 'support',
              relationship: 'SUPPORTS',
              evidenceText: '  supporting evidence  ',
            },
            {
              sourceId: 'contradiction',
              relationship: 'CONTRADICTS',
              evidenceText: '  contradicting evidence  ',
            },
          ],
        }),
      ],
    });

    expect(validate(value).relationships).toEqual([
      {
        claimKey: 'claim-1',
        sourceKey: 'support',
        relationship: 'SUPPORTS',
        evidenceText: 'supporting evidence',
      },
      {
        claimKey: 'claim-1',
        sourceKey: 'contradiction',
        relationship: 'CONTRADICTS',
        evidenceText: 'contradicting evidence',
      },
    ]);
  });
});

describe('ResearchGraphValidator compensation and interview coherence', () => {
  it('normalizes currency while preserving amount, period, context, and distinct base/total claims', () => {
    const value = output({
      claims: [
        claim('base', 'source-1', {
          type: 'SALARY_BASE',
          valueText: null,
          valueJson: structuredValue({
            amount: 90_000,
            amountMin: null,
            amountMax: null,
            currency: ' eur ',
            period: 'YEAR',
            location: ' Paris ',
            role: ' Backend Engineer ',
            seniority: ' Senior ',
            dataYear: 2026,
          }),
          evidenceType: 'REPORTED',
        }),
        claim('total', 'source-1', {
          type: 'TOTAL_COMPENSATION',
          valueText: null,
          valueJson: structuredValue({
            amount: 110_000,
            amountMin: null,
            amountMax: null,
            currency: 'GBP',
            period: 'MONTH',
            dataYear: 2025,
          }),
          evidenceType: 'REPORTED',
        }),
      ],
    });

    const graph = validate(value);

    expect(graph.claims.map(({ type }) => type)).toEqual([
      'SALARY_BASE',
      'TOTAL_COMPENSATION',
    ]);
    expect(graph.claims[0]?.valueJson).toEqual(
      expect.objectContaining({
        amount: 90_000,
        amountMin: null,
        amountMax: null,
        currency: 'EUR',
        period: 'YEAR',
        location: 'Paris',
        role: 'Backend Engineer',
        seniority: 'Senior',
        dataYear: 2026,
      }),
    );
    expect(graph.claims[1]?.valueJson).toEqual(
      expect.objectContaining({
        amount: 110_000,
        currency: 'GBP',
        period: 'MONTH',
      }),
    );
  });

  it.each([0, -1])('rejects compensation amount %s', (amount) => {
    const value = output({
      claims: [
        claim('salary', 'source-1', {
          type: 'SALARY_BASE',
          valueText: null,
          valueJson: structuredValue({
            amount,
            currency: 'EUR',
            period: 'YEAR',
          }),
        }),
      ],
    });

    expectValidationError(
      () => validate(value),
      'INVALID_RESEARCH_CLAIM',
      'INVALID_COMPENSATION_AMOUNT',
    );
  });

  it.each(['EU', 'EURO', '12A', '   '])(
    'rejects malformed compensation currency %j',
    (currency) => {
      const value = output({
        claims: [
          claim('salary', 'source-1', {
            type: 'TOTAL_COMPENSATION',
            valueText: null,
            valueJson: structuredValue({
              amount: 100,
              currency,
              period: 'YEAR',
            }),
          }),
        ],
      });

      expectValidationError(
        () => validate(value),
        'INVALID_RESEARCH_CLAIM',
        'INVALID_COMPENSATION_CURRENCY',
      );
    },
  );

  it.each([1899, 2027])('rejects compensation data year %s', (dataYear) => {
    const value = output({
      claims: [
        claim('salary', 'source-1', {
          type: 'SALARY_BASE',
          valueText: null,
          valueJson: structuredValue({
            amount: 100,
            currency: 'EUR',
            period: 'YEAR',
            dataYear,
          }),
        }),
      ],
    });

    expectValidationError(
      () => validate(value),
      'INVALID_RESEARCH_CLAIM',
      'INVALID_COMPENSATION_YEAR',
    );
  });

  it('accepts an exact amount or complete ordered range and clears compensation prose', () => {
    const exact = claim('exact', 'source-1', {
      type: 'SALARY_BASE',
      valueText: 'A contradictory model-authored amount.',
      valueJson: structuredValue({
        amount: 100_000,
        currency: 'EUR',
        period: 'YEAR',
      }),
    });
    const range = claim('range', 'source-1', {
      type: 'TOTAL_COMPENSATION',
      valueText: null,
      valueJson: structuredValue({
        amountMin: 120_000,
        amountMax: 150_000,
        currency: 'EUR',
        period: 'YEAR',
      }),
    });

    const graph = validate(output({ claims: [exact, range] }));

    expect(graph.claims[0]?.valueText).toBeNull();
    expect(graph.claims[1]?.valueJson).toEqual(
      expect.objectContaining({
        amount: null,
        amountMin: 120_000,
        amountMax: 150_000,
      }),
    );
    expect(graph.summaryMarkdown).toContain('120000–150000 (EUR · YEAR)');
    expect(graph.summaryMarkdown).not.toContain('contradictory model-authored');
  });

  it.each([
    [
      structuredValue({ currency: 'EUR', period: 'YEAR' }),
      'MISSING_COMPENSATION_VALUE',
    ],
    [
      structuredValue({ amountMin: 90_000, currency: 'EUR', period: 'YEAR' }),
      'INCOMPLETE_COMPENSATION_RANGE',
    ],
    [
      structuredValue({
        amount: 100_000,
        amountMin: 90_000,
        amountMax: 110_000,
        currency: 'EUR',
        period: 'YEAR',
      }),
      'AMBIGUOUS_COMPENSATION_VALUE',
    ],
  ] as const)(
    'rejects an incomplete or ambiguous compensation shape',
    (valueJson, reason) => {
      const value = output({
        claims: [
          claim('salary', 'source-1', {
            type: 'SALARY_BASE',
            valueText: null,
            valueJson,
          }),
        ],
      });

      expectValidationError(
        () => validate(value),
        'INVALID_RESEARCH_CLAIM',
        reason,
      );
    },
  );

  it('rejects an inverted compensation range and drops irrelevant interview fields', () => {
    const invertedRange = output({
      claims: [
        claim('salary', 'source-1', {
          type: 'SALARY_BASE',
          valueJson: structuredValue({
            amountMin: 110_000,
            amountMax: 90_000,
            currency: 'EUR',
            period: 'YEAR',
          }),
        }),
      ],
    });
    const pollutedExact = output({
      claims: [
        claim('salary', 'source-1', {
          type: 'SALARY_BASE',
          valueJson: structuredValue({
            amount: 100_000,
            currency: 'EUR',
            period: 'YEAR',
            stageOrder: 1,
          }),
        }),
      ],
    });

    expectValidationError(
      () => validate(invertedRange),
      'INVALID_RESEARCH_CLAIM',
      'INVALID_COMPENSATION_AMOUNT',
    );
    expect(validate(pollutedExact).claims[0]?.valueJson).toEqual(
      expect.objectContaining({ stageOrder: null, frequency: null }),
    );
  });

  it.each([0, -1])('rejects interview stage order %s', (stageOrder) => {
    const value = output({
      claims: [
        claim('interview', 'source-1', {
          type: 'INTERVIEW_STAGE',
          valueText: null,
          valueJson: structuredValue({ stageOrder }),
          evidenceType: 'REPORTED',
        }),
      ],
    });

    expectValidationError(
      () => validate(value),
      'INVALID_RESEARCH_CLAIM',
      'INVALID_INTERVIEW_STAGE_ORDER',
    );
  });

  it.each([
    'SINGLE_REPORT',
    'MULTIPLE_REPORTS',
    'COMMON',
    'UNKNOWN',
  ] as const)('preserves qualitative interview frequency %s', (frequency) => {
    const value = output({
      claims: [
        claim('interview', 'source-1', {
          type: 'INTERVIEW_TOPIC',
          valueText: null,
          valueJson: structuredValue({ stageOrder: 1, frequency }),
          evidenceType: 'REPORTED',
        }),
      ],
    });

    expect(validate(value).claims[0]?.valueJson).toEqual(
      expect.objectContaining({ stageOrder: 1, frequency }),
    );
  });
});

describe('ResearchGraphValidator warnings and output', () => {
  it('derives a claim-grounded summary and returns stable deduplicated warning order', () => {
    const warnings: ResearchWarningCode[] = [
      'OTHER',
      'AMBIGUOUS_COMPANY_MATCH',
      'OTHER',
    ];
    const graph = validate(
      output({
        summaryMarkdown: '  Preserve this summary exactly.  ',
        claims: [claim('company', 'source-1', { type: 'BUSINESS_AREA' })],
        warnings,
      }),
    );

    expect(graph.summaryMarkdown).toContain('**BUSINESS AREA:** company value');
    expect(graph.summaryMarkdown).not.toContain('Preserve this summary exactly');
    expect(graph.warnings).toEqual([
      'NO_RELIABLE_COMPENSATION_DATA',
      'INSUFFICIENT_ROLE_SPECIFIC_DATA',
      'AMBIGUOUS_COMPANY_MATCH',
      'OTHER',
    ]);
  });

  it('derives meaningful salary conflict but does not reconcile amounts', () => {
    const value = output({
      sources: [source('support'), source('contradiction')],
      claims: [
        claim('salary', 'support', {
          type: 'SALARY_BASE',
          valueText: null,
          valueJson: structuredValue({
            amount: 90_000,
            currency: 'EUR',
            period: 'YEAR',
          }),
          evidenceType: 'REPORTED',
          sourceLinks: [
            {
              sourceId: 'support',
              relationship: 'SUPPORTS',
              evidenceText: '€90k',
            },
            {
              sourceId: 'contradiction',
              relationship: 'CONTRADICTS',
              evidenceText: '€70k',
            },
          ],
        }),
      ],
    });

    const graph = validate(value);

    expect(graph.warnings).toContain('CONFLICTING_SALARY_DATA');
    expect(graph.claims[0]?.valueJson?.amount).toBe(90_000);
    expect(graph.claims[0]?.confidence).toBe('LOW');
  });

  it('derives outdated interview reports only when all dated support is stale', () => {
    const staleValue = output({
      sources: [source('old', { publishedAt: '2020-01-01' })],
      claims: [
        claim('interview', 'old', {
          type: 'INTERVIEW_STAGE',
          evidenceType: 'REPORTED',
        }),
      ],
    });
    const freshValue = output({
      sources: [
        source('old', { publishedAt: '2020-01-01' }),
        source('fresh', { publishedAt: '2026-01-01' }),
      ],
      claims: [
        claim('interview', 'old', {
          type: 'INTERVIEW_STAGE',
          evidenceType: 'REPORTED',
          sourceLinks: [
            {
              sourceId: 'old',
              relationship: 'SUPPORTS',
              evidenceText: 'old',
            },
            {
              sourceId: 'fresh',
              relationship: 'SUPPORTS',
              evidenceText: 'fresh',
            },
          ],
        }),
      ],
    });

    expect(validate(staleValue).warnings).toContain(
      'OUTDATED_INTERVIEW_REPORTS',
    );
    expect(validate(freshValue).warnings).not.toContain(
      'OUTDATED_INTERVIEW_REPORTS',
    );
  });

  it('uses the documented narrow role-specific and LOW-quality dependency rules', () => {
    const insufficient = output({
      sources: [source('forum', { sourceQuality: 'LOW' })],
      claims: [claim('company', 'forum', { type: 'COMPANY_DESCRIPTION' })],
    });
    const roleSpecific = output({
      claims: [
        claim('salary', 'source-1', {
          type: 'SALARY_BASE',
          valueText: null,
          valueJson: structuredValue({
            amount: 100,
            currency: 'EUR',
            period: 'YEAR',
            role: 'Backend Engineer',
          }),
        }),
      ],
    });

    expect(validate(insufficient).warnings).toEqual(
      expect.arrayContaining([
        'INSUFFICIENT_ROLE_SPECIFIC_DATA',
        'LOW_SOURCE_QUALITY',
      ]),
    );
    expect(validate(roleSpecific).warnings).not.toContain(
      'INSUFFICIENT_ROLE_SPECIFIC_DATA',
    );
  });

  it('accepts a completed sparse graph with a bounded deterministic summary', () => {
    const graph = validate(
      output({
        summaryMarkdown: 'Unsupported company and interview assertions.',
        sources: [],
        claims: [],
      }),
      [],
    );

    expect(graph).toMatchObject({
      summaryMarkdown:
        'No reliable external Research findings were available for this opportunity.',
      sources: [],
      claims: [],
      relationships: [],
    });
    expect(graph.warnings).toEqual([
      'NO_RELIABLE_COMPENSATION_DATA',
      'INSUFFICIENT_ROLE_SPECIFIC_DATA',
    ]);
  });

  it('does not derive OTHER and does not flag incidental LOW-quality support', () => {
    const value = output({
      sources: [source('good'), source('low', { sourceQuality: 'LOW' })],
      claims: [
        claim('role', 'good', {
          sourceLinks: [
            {
              sourceId: 'good',
              relationship: 'SUPPORTS',
              evidenceText: 'good',
            },
            {
              sourceId: 'low',
              relationship: 'SUPPORTS',
              evidenceText: 'incidental',
            },
          ],
        }),
      ],
    });

    expect(validate(value).warnings).not.toEqual(
      expect.arrayContaining(['LOW_SOURCE_QUALITY', 'OTHER']),
    );
  });

  it('does not mutate structured output, provider metadata, or the research date', () => {
    const value = output({
      sources: [
        source('source-1', {
          url: ' HTTPS://SOURCE-1.EXAMPLE/report/?utm_source=test#fragment ',
          publisher: '  Publisher  ',
        }),
      ],
      claims: [claim('claim-1', 'source-1', { valueText: '  value  ' })],
    });
    const providers = [{ url: 'https://source-1.example/report' }];
    const outputSnapshot = structuredClone(value);
    const providerSnapshot = structuredClone(providers);
    const researchTime = researchDate.getTime();

    validate(value, providers);

    expect(value).toEqual(outputSnapshot);
    expect(providers).toEqual(providerSnapshot);
    expect(researchDate.getTime()).toBe(researchTime);
  });

  it('returns a persistence-ready graph without DB IDs or execution timestamps', () => {
    const graph = validate(output());
    const serialized = JSON.stringify(graph);

    expect(graph.sources[0]).toEqual(
      expect.objectContaining({
        key: 'source-1',
        url: 'https://source-1.example/report',
        normalizedUrl: 'https://source-1.example/report',
      }),
    );
    expect(graph.claims[0]).toEqual(
      expect.objectContaining({
        key: 'claim-1',
        confidence: 'MEDIUM',
      }),
    );
    expect(serialized).not.toContain('retrievedAt');
    expect(serialized).not.toContain('completedAt');
    expect(serialized).not.toContain('researchId');
    expect(serialized).not.toContain('claimId');
    expect(serialized).not.toContain('sourceId');
  });
});
