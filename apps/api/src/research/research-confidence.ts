import { ResearchValidationError } from './research.errors.js';
import type {
  ResearchClaimType,
  ResearchConfidence,
} from './research.types.js';
import type {
  ResearchConfidenceInput,
  ResearchFreshness,
} from './research-validation.types.js';

const stableClaimTypes = new Set<ResearchClaimType>([
  'COMPANY_DESCRIPTION',
  'BUSINESS_AREA',
  'PARIS_PRESENCE',
]);

const twoAndFourYearClaimTypes = new Set<ResearchClaimType>([
  'SALARY_BASE',
  'TOTAL_COMPENSATION',
  'INTERVIEW_STAGE',
  'INTERVIEW_TOPIC',
  'CULTURE',
]);

const threeAndFiveYearClaimTypes = new Set<ResearchClaimType>([
  'TECHNOLOGY',
  'ROLE_INFORMATION',
]);

function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractUtcYears(date: Date, years: number): string {
  const year = date.getUTCFullYear() - years;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return formatUtcDate(
    new Date(Date.UTC(year, month, Math.min(day, lastDayOfMonth))),
  );
}

export function deriveResearchFreshness(
  claimType: ResearchClaimType,
  publishedAt: string | null,
  researchDate: Date,
): ResearchFreshness {
  if (!isValidDate(researchDate)) {
    throw new ResearchValidationError(
      'RESEARCH_CONFIDENCE_FAILED',
      'INVALID_RESEARCH_DATE',
    );
  }

  if (publishedAt === null || stableClaimTypes.has(claimType)) {
    return 'UNKNOWN';
  }

  let freshYears: number;
  let agingYears: number;
  if (twoAndFourYearClaimTypes.has(claimType)) {
    freshYears = 2;
    agingYears = 4;
  } else if (threeAndFiveYearClaimTypes.has(claimType)) {
    freshYears = 3;
    agingYears = 5;
  } else {
    return 'UNKNOWN';
  }

  if (publishedAt >= subtractUtcYears(researchDate, freshYears)) {
    return 'FRESH';
  }
  if (publishedAt >= subtractUtcYears(researchDate, agingYears)) {
    return 'AGING';
  }
  return 'STALE';
}

function capConfidence(
  confidence: ResearchConfidence,
  maximum: 'LOW' | 'MEDIUM',
): ResearchConfidence {
  if (maximum === 'LOW') {
    return 'LOW';
  }
  return confidence === 'HIGH' ? 'MEDIUM' : confidence;
}

type CompensationSpecificity =
  | 'BROAD'
  | 'PARTIAL'
  | 'ROLE_AND_LOCATION'
  | 'ROLE_LOCATION_AND_SENIORITY';

function isCompensationClaim(claimType: ResearchClaimType): boolean {
  return claimType === 'SALARY_BASE' || claimType === 'TOTAL_COMPENSATION';
}

function deriveCompensationSpecificity(
  input: ResearchConfidenceInput,
): CompensationSpecificity {
  const hasRole = input.claim.valueJson?.role != null;
  const hasLocation = input.claim.valueJson?.location != null;
  const hasSeniority = input.claim.valueJson?.seniority != null;

  if (!hasRole && !hasLocation && !hasSeniority) {
    return 'BROAD';
  }
  if (!hasRole || !hasLocation) {
    return 'PARTIAL';
  }
  return hasSeniority
    ? 'ROLE_LOCATION_AND_SENIORITY'
    : 'ROLE_AND_LOCATION';
}

function applySpecificityCap(
  confidence: ResearchConfidence,
  input: ResearchConfidenceInput,
): ResearchConfidence {
  if (!isCompensationClaim(input.claim.type)) {
    return confidence;
  }

  const specificity = deriveCompensationSpecificity(input);
  return specificity === 'BROAD' || specificity === 'PARTIAL'
    ? capConfidence(confidence, 'MEDIUM')
    : confidence;
}

export class ResearchConfidenceService {
  calculate(input: ResearchConfidenceInput): ResearchConfidence {
    if (!isValidDate(input.researchDate) || input.evidence.length === 0) {
      throw new ResearchValidationError(
        'RESEARCH_CONFIDENCE_FAILED',
        'IMPOSSIBLE_CONFIDENCE_STATE',
      );
    }

    const supporting = input.evidence.filter(
      ({ relationship }) => relationship === 'SUPPORTS',
    );
    const contradicting = input.evidence.filter(
      ({ relationship }) => relationship === 'CONTRADICTS',
    );

    if (supporting.length === 0) {
      return 'LOW';
    }

    const goodSupporting = supporting.filter(
      ({ source }) => source.sourceQuality !== 'LOW',
    );
    const goodContradicting = contradicting.filter(
      ({ source }) => source.sourceQuality !== 'LOW',
    );

    if (goodSupporting.length > 0 && goodContradicting.length > 0) {
      return 'LOW';
    }

    let confidence: ResearchConfidence;
    const hasDirectOfficialFact =
      input.claim.evidenceType === 'FACT' &&
      goodSupporting.some(
        ({ source }) =>
          source.sourceType === 'OFFICIAL' && source.sourceQuality === 'HIGH',
      );
    const independentGoodGroups = new Set(
      goodSupporting.map(({ source }) => source.independenceGroup),
    );

    if (goodSupporting.length === 0) {
      confidence = 'LOW';
    } else if (hasDirectOfficialFact || independentGoodGroups.size >= 2) {
      confidence = 'HIGH';
    } else {
      confidence = 'MEDIUM';
    }

    if (contradicting.length > 0) {
      confidence = capConfidence(confidence, 'MEDIUM');
    }

    if (!stableClaimTypes.has(input.claim.type)) {
      const freshness = supporting.map(({ source }) =>
        deriveResearchFreshness(
          input.claim.type,
          source.publishedAt,
          input.researchDate,
        ),
      );
      const allStale = freshness.every((value) => value === 'STALE');
      const hasFreshGoodSupport = goodSupporting.some(
        ({ source }) =>
          deriveResearchFreshness(
            input.claim.type,
            source.publishedAt,
            input.researchDate,
          ) === 'FRESH',
      );

      if (allStale) {
        confidence = capConfidence(confidence, 'LOW');
      } else if (!hasFreshGoodSupport && input.claim.type !== 'OTHER') {
        confidence = capConfidence(confidence, 'MEDIUM');
      }
    }

    if (
      input.claim.evidenceType === 'INFERRED' ||
      input.claim.type === 'CULTURE'
    ) {
      confidence = capConfidence(confidence, 'MEDIUM');
    }

    return applySpecificityCap(confidence, input);
  }
}
