import { describe, expect, it } from 'vitest';
import {
  ResearchConfidenceService,
  deriveResearchFreshness,
} from './research-confidence.js';
import { ResearchValidationError } from './research.errors.js';
import type {
  ResearchConfidenceClaim,
  ResearchConfidenceEvidence,
  ValidatedResearchSource,
} from './research-validation.types.js';
import type { ResearchStructuredValue } from './research.schema.js';

const researchDate = new Date('2026-08-26T12:00:00.000Z');

function source(
  key: string,
  overrides: Partial<ValidatedResearchSource> = {},
): ValidatedResearchSource {
  return {
    key,
    url: `https://${key}.example/report`,
    normalizedUrl: `https://${key}.example/report`,
    title: null,
    publisher: `${key} publisher`,
    sourceType: 'NEWS',
    sourceQuality: 'HIGH',
    publishedAt: '2026-01-01',
    independenceGroup: `${key} publisher`,
    ...overrides,
  };
}

function supports(
  ...sources: readonly ValidatedResearchSource[]
): ResearchConfidenceEvidence[] {
  return sources.map((item) => ({ relationship: 'SUPPORTS', source: item }));
}

function confidenceClaim(
  type: ResearchConfidenceClaim['type'],
  evidenceType: ResearchConfidenceClaim['evidenceType'],
  valueJson: ResearchStructuredValue | null = null,
): ResearchConfidenceClaim {
  return { type, valueJson, evidenceType };
}

function compensationValue(
  overrides: Partial<ResearchStructuredValue> = {},
): ResearchStructuredValue {
  return {
    amount: 100_000,
    amountMin: null,
    amountMax: null,
    currency: 'EUR',
    period: 'YEAR',
    location: null,
    role: null,
    seniority: null,
    dataYear: 2026,
    stageOrder: null,
    frequency: null,
    ...overrides,
  };
}

describe('deriveResearchFreshness', () => {
  it.each([
    ['SALARY_BASE', '2024-08-26', 'FRESH'],
    ['INTERVIEW_STAGE', '2024-08-25', 'AGING'],
    ['CULTURE', '2022-08-26', 'AGING'],
    ['TOTAL_COMPENSATION', '2022-08-25', 'STALE'],
    ['TECHNOLOGY', '2023-08-26', 'FRESH'],
    ['ROLE_INFORMATION', '2023-08-25', 'AGING'],
    ['TECHNOLOGY', '2021-08-26', 'AGING'],
    ['ROLE_INFORMATION', '2021-08-25', 'STALE'],
  ] as const)('classifies %s published %s as %s', (type, date, expected) => {
    expect(deriveResearchFreshness(type, date, researchDate)).toBe(expected);
  });

  it('returns UNKNOWN for missing dates, stable company facts, and OTHER', () => {
    expect(
      deriveResearchFreshness('SALARY_BASE', null, researchDate),
    ).toBe('UNKNOWN');
    expect(
      deriveResearchFreshness(
        'COMPANY_DESCRIPTION',
        '2000-01-01',
        researchDate,
      ),
    ).toBe('UNKNOWN');
    expect(
      deriveResearchFreshness('BUSINESS_AREA', '2000-01-01', researchDate),
    ).toBe('UNKNOWN');
    expect(
      deriveResearchFreshness('PARIS_PRESENCE', '2000-01-01', researchDate),
    ).toBe('UNKNOWN');
    expect(deriveResearchFreshness('OTHER', '2026-01-01', researchDate)).toBe(
      'UNKNOWN',
    );
  });
});

describe('ResearchConfidenceService', () => {
  const service = new ResearchConfidenceService();

  it('returns HIGH for a direct HIGH-quality OFFICIAL FACT without contradiction', () => {
    expect(
      service.calculate({
        claim: confidenceClaim('COMPANY_DESCRIPTION', 'FACT'),
        evidence: supports(
          source('official', {
            sourceType: 'OFFICIAL',
            publishedAt: '2000-01-01',
          }),
        ),
        researchDate,
      }),
    ).toBe('HIGH');
  });

  it('returns MEDIUM for one good non-official source', () => {
    expect(
      service.calculate({
        claim: confidenceClaim('ROLE_INFORMATION', 'FACT'),
        evidence: supports(source('news')),
        researchDate,
      }),
    ).toBe('MEDIUM');
  });

  it('returns HIGH for two independent fresh good sources, including REPORTED evidence', () => {
    expect(
      service.calculate({
        claim: confidenceClaim('INTERVIEW_STAGE', 'REPORTED'),
        evidence: supports(source('one'), source('two')),
        researchDate,
      }),
    ).toBe('HIGH');
  });

  it('does not treat two pages from the same publisher as independent corroboration', () => {
    expect(
      service.calculate({
        claim: confidenceClaim('ROLE_INFORMATION', 'FACT'),
        evidence: supports(
          source('one', { independenceGroup: 'same publisher' }),
          source('two', { independenceGroup: 'same publisher' }),
        ),
        researchDate,
      }),
    ).toBe('MEDIUM');
  });

  it.each([
    ['generic', compensationValue()],
    ['role-only', compensationValue({ role: 'Backend Engineer' })],
    ['location-only', compensationValue({ location: 'Paris' })],
    ['seniority-only', compensationValue({ seniority: 'Senior' })],
  ] as const)(
    'caps %s compensation evidence at MEDIUM despite independent strong support',
    (_specificity, valueJson) => {
      expect(
        service.calculate({
          claim: confidenceClaim('SALARY_BASE', 'REPORTED', valueJson),
          evidence: supports(source('one'), source('two')),
          researchDate,
        }),
      ).toBe('MEDIUM');
    },
  );

  it('keeps role-and-location-specific compensation eligible for HIGH', () => {
    expect(
      service.calculate({
        claim: confidenceClaim(
          'TOTAL_COMPENSATION',
          'REPORTED',
          compensationValue({
            role: 'Backend Engineer',
            location: 'Paris',
          }),
        ),
        evidence: supports(source('one'), source('two')),
        researchDate,
      }),
    ).toBe('HIGH');
  });

  it('keeps specific INFERRED compensation capped at MEDIUM', () => {
    expect(
      service.calculate({
        claim: confidenceClaim(
          'SALARY_BASE',
          'INFERRED',
          compensationValue({
            role: 'Backend Engineer',
            location: 'Paris',
            seniority: 'Senior',
          }),
        ),
        evidence: supports(source('one'), source('two')),
        researchDate,
      }),
    ).toBe('MEDIUM');
  });

  it('returns LOW when support is only LOW quality', () => {
    expect(
      service.calculate({
        claim: confidenceClaim('ROLE_INFORMATION', 'REPORTED'),
        evidence: supports(source('forum', { sourceQuality: 'LOW' })),
        researchDate,
      }),
    ).toBe('LOW');
  });

  it('caps INFERRED and CULTURE claims at MEDIUM', () => {
    expect(
      service.calculate({
        claim: confidenceClaim('COMPANY_DESCRIPTION', 'INFERRED'),
        evidence: supports(
          source('official', { sourceType: 'OFFICIAL' }),
        ),
        researchDate,
      }),
    ).toBe('MEDIUM');
    expect(
      service.calculate({
        claim: confidenceClaim('CULTURE', 'REPORTED'),
        evidence: supports(source('one'), source('two')),
        researchDate,
      }),
    ).toBe('MEDIUM');
  });

  it('caps an otherwise-HIGH claim at MEDIUM for a LOW-quality contradiction', () => {
    expect(
      service.calculate({
        claim: confidenceClaim('COMPANY_DESCRIPTION', 'FACT'),
        evidence: [
          ...supports(source('official', { sourceType: 'OFFICIAL' })),
          {
            relationship: 'CONTRADICTS',
            source: source('forum', { sourceQuality: 'LOW' }),
          },
        ],
        researchDate,
      }),
    ).toBe('MEDIUM');
  });

  it('returns LOW for unresolved good support versus good contradiction', () => {
    expect(
      service.calculate({
        claim: confidenceClaim('ROLE_INFORMATION', 'FACT'),
        evidence: [
          ...supports(source('one')),
          { relationship: 'CONTRADICTS', source: source('two') },
        ],
        researchDate,
      }),
    ).toBe('LOW');
  });

  it('applies stale, unknown-date, and aging-only dynamic evidence caps', () => {
    expect(
      service.calculate({
        claim: confidenceClaim('TECHNOLOGY', 'FACT'),
        evidence: supports(
          source('one', { publishedAt: '2020-01-01' }),
          source('two', { publishedAt: '2020-01-01' }),
        ),
        researchDate,
      }),
    ).toBe('LOW');
    expect(
      service.calculate({
        claim: confidenceClaim('TECHNOLOGY', 'FACT'),
        evidence: supports(
          source('one', { publishedAt: null }),
          source('two', { publishedAt: null }),
        ),
        researchDate,
      }),
    ).toBe('MEDIUM');
    expect(
      service.calculate({
        claim: confidenceClaim('TECHNOLOGY', 'FACT'),
        evidence: supports(
          source('one', { publishedAt: '2022-01-01' }),
          source('two', { publishedAt: '2022-01-01' }),
        ),
        researchDate,
      }),
    ).toBe('MEDIUM');
  });

  it('does not mechanically freshness-cap stable company facts', () => {
    expect(
      service.calculate({
        claim: confidenceClaim('PARIS_PRESENCE', 'FACT'),
        evidence: supports(
          source('official', {
            sourceType: 'OFFICIAL',
            publishedAt: '2000-01-01',
          }),
        ),
        researchDate,
      }),
    ).toBe('HIGH');
  });

  it('fails deterministically for an impossible evidence-free state', () => {
    expect(() =>
      service.calculate({
        claim: confidenceClaim('ROLE_INFORMATION', 'FACT'),
        evidence: [],
        researchDate,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ResearchValidationError>>({
        code: 'RESEARCH_CONFIDENCE_FAILED',
        reason: 'IMPOSSIBLE_CONFIDENCE_STATE',
      }),
    );
  });
});
