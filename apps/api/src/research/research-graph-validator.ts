import { ResearchConfidenceService, deriveResearchFreshness } from './research-confidence.js';
import { ResearchValidationError } from './research.errors.js';
import type {
  ResearchOutputClaim,
  ResearchOutputSource,
  ResearchStructuredValue,
} from './research.schema.js';
import {
  buildResearchProviderProvenanceSet,
  deriveResearchSourceIndependenceGroup,
  normalizeOptionalResearchText,
  normalizeResearchUrl,
} from './research-source-normalizer.js';
import {
  RESEARCH_MAX_SOURCES,
  researchWarningCodes,
  type ResearchWarningCode,
} from './research.types.js';
import type {
  ResearchConfidenceEvidence,
  ResearchValidationInput,
  ValidatedResearchClaim,
  ValidatedResearchClaimSource,
  ValidatedResearchGraph,
  ValidatedResearchSource,
} from './research-validation.types.js';

export { RESEARCH_MAX_SOURCES } from './research.types.js';

type NormalizedResearchSource = Omit<
  ValidatedResearchSource,
  'independenceGroup'
>;

interface DeduplicatedSources {
  readonly sources: readonly ValidatedResearchSource[];
  readonly sourceKeyByLogicalId: ReadonlyMap<string, string>;
}

type ValidatedClaimWithoutConfidence = Omit<
  ValidatedResearchClaim,
  'confidence'
>;

function invalidSource(
  reason:
    | 'INVALID_PUBLISHED_DATE'
    | 'INVALID_SOURCE_ID'
    | 'DUPLICATE_SOURCE_ID'
    | 'CONFLICTING_SOURCE_METADATA',
): never {
  throw new ResearchValidationError('INVALID_RESEARCH_SOURCE', reason);
}

function invalidClaim(
  reason:
    | 'DUPLICATE_CLAIM_ID'
    | 'INVALID_CLAIM_ID'
    | 'MISSING_CLAIM_VALUE'
    | 'INVALID_COMPENSATION_AMOUNT'
    | 'MISSING_COMPENSATION_VALUE'
    | 'INCOMPLETE_COMPENSATION_RANGE'
    | 'AMBIGUOUS_COMPENSATION_VALUE'
    | 'INVALID_COMPENSATION_CURRENCY'
    | 'INVALID_COMPENSATION_PERIOD'
    | 'INVALID_COMPENSATION_YEAR'
    | 'INVALID_INTERVIEW_STAGE_ORDER'
    | 'MISSING_CLAIM_EVIDENCE'
    | 'MISSING_SUPPORTING_EVIDENCE',
): never {
  throw new ResearchValidationError('INVALID_RESEARCH_CLAIM', reason);
}

function isValidPublishedDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function normalizeSource(
  source: ResearchOutputSource,
  researchDate: Date,
): NormalizedResearchSource {
  if (source.id.trim().length === 0) {
    invalidSource('INVALID_SOURCE_ID');
  }
  if (source.publishedAt !== null) {
    if (
      !isValidPublishedDate(source.publishedAt) ||
      source.publishedAt > researchDate.toISOString().slice(0, 10)
    ) {
      invalidSource('INVALID_PUBLISHED_DATE');
    }
  }

  return {
    key: source.id.trim(),
    url: source.url.trim(),
    normalizedUrl: normalizeResearchUrl(source.url),
    title: normalizeOptionalResearchText(source.title),
    publisher: normalizeOptionalResearchText(source.publisher),
    sourceType: source.sourceType,
    sourceQuality: source.sourceQuality,
    publishedAt: source.publishedAt,
  };
}

function mergeOptionalMetadata<T>(
  left: T | null,
  right: T | null,
): T | null {
  if (left === null) {
    return right;
  }
  if (right === null || left === right) {
    return left;
  }
  invalidSource('CONFLICTING_SOURCE_METADATA');
}

function mergeSources(
  canonical: NormalizedResearchSource,
  duplicate: NormalizedResearchSource,
): NormalizedResearchSource {
  if (
    canonical.sourceType !== duplicate.sourceType ||
    canonical.sourceQuality !== duplicate.sourceQuality
  ) {
    invalidSource('CONFLICTING_SOURCE_METADATA');
  }

  return {
    ...canonical,
    title: mergeOptionalMetadata(canonical.title, duplicate.title),
    publisher: mergeOptionalMetadata(canonical.publisher, duplicate.publisher),
    publishedAt: mergeOptionalMetadata(
      canonical.publishedAt,
      duplicate.publishedAt,
    ),
  };
}

function deduplicateSources(
  normalizedSources: readonly NormalizedResearchSource[],
): DeduplicatedSources {
  const sourceKeyByLogicalId = new Map<string, string>();
  const sourceIndexByUrl = new Map<string, number>();
  const canonicalSources: NormalizedResearchSource[] = [];

  for (const source of normalizedSources) {
    if (sourceKeyByLogicalId.has(source.key)) {
      invalidSource('DUPLICATE_SOURCE_ID');
    }

    const existingIndex = sourceIndexByUrl.get(source.normalizedUrl);
    if (existingIndex === undefined) {
      sourceIndexByUrl.set(source.normalizedUrl, canonicalSources.length);
      canonicalSources.push(source);
      sourceKeyByLogicalId.set(source.key, source.key);
      continue;
    }

    const existing = canonicalSources[existingIndex];
    if (existing === undefined) {
      invalidSource('CONFLICTING_SOURCE_METADATA');
    }
    canonicalSources[existingIndex] = mergeSources(existing, source);
    sourceKeyByLogicalId.set(source.key, existing.key);
  }

  return {
    sources: canonicalSources.map((source) => ({
      ...source,
      independenceGroup: deriveResearchSourceIndependenceGroup(
        source.publisher,
        source.normalizedUrl,
      ),
    })),
    sourceKeyByLogicalId,
  };
}

function normalizeStructuredValue(
  claim: ResearchOutputClaim,
  researchDate: Date,
): ResearchStructuredValue | null {
  if (claim.valueJson === null) {
    return null;
  }

  const value: ResearchStructuredValue = {
    ...claim.valueJson,
    currency: normalizeOptionalResearchText(claim.valueJson.currency),
    location: normalizeOptionalResearchText(claim.valueJson.location),
    role: normalizeOptionalResearchText(claim.valueJson.role),
    seniority: normalizeOptionalResearchText(claim.valueJson.seniority),
  };

  if (claim.type === 'SALARY_BASE' || claim.type === 'TOTAL_COMPENSATION') {
    const hasExactAmount = value.amount !== null;
    const hasMinimumAmount = value.amountMin !== null;
    const hasMaximumAmount = value.amountMax !== null;
    const hasCompleteRange = hasMinimumAmount && hasMaximumAmount;
    if (!hasExactAmount && !hasMinimumAmount && !hasMaximumAmount) {
      invalidClaim('MISSING_COMPENSATION_VALUE');
    }
    if (hasMinimumAmount !== hasMaximumAmount) {
      invalidClaim('INCOMPLETE_COMPENSATION_RANGE');
    }
    if (hasExactAmount && hasCompleteRange) {
      invalidClaim('AMBIGUOUS_COMPENSATION_VALUE');
    }
    if (
      (value.amount !== null &&
        (!Number.isFinite(value.amount) || value.amount <= 0)) ||
      (value.amountMin !== null &&
        (!Number.isFinite(value.amountMin) || value.amountMin <= 0)) ||
      (value.amountMax !== null &&
        (!Number.isFinite(value.amountMax) || value.amountMax <= 0)) ||
      (value.amountMin !== null &&
        value.amountMax !== null &&
        value.amountMin > value.amountMax)
    ) {
      invalidClaim('INVALID_COMPENSATION_AMOUNT');
    }
    if (claim.valueJson.currency === null) {
      invalidClaim('INVALID_COMPENSATION_CURRENCY');
    }
    const currency = claim.valueJson.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/u.test(currency)) {
      invalidClaim('INVALID_COMPENSATION_CURRENCY');
    }
    value.currency = currency;
    if (value.period === null) {
      invalidClaim('INVALID_COMPENSATION_PERIOD');
    }
    value.stageOrder = null;
    value.frequency = null;
    if (
      value.dataYear !== null &&
      (!Number.isInteger(value.dataYear) ||
        value.dataYear < 1900 ||
        value.dataYear > researchDate.getUTCFullYear())
    ) {
      invalidClaim('INVALID_COMPENSATION_YEAR');
    }
  }

  if (
    (claim.type === 'INTERVIEW_STAGE' || claim.type === 'INTERVIEW_TOPIC') &&
    value.stageOrder !== null &&
    (!Number.isInteger(value.stageOrder) || value.stageOrder < 1)
  ) {
    invalidClaim('INVALID_INTERVIEW_STAGE_ORDER');
  }

  return value;
}

function isCompensationClaim(type: ResearchOutputClaim['type']): boolean {
  return type === 'SALARY_BASE' || type === 'TOTAL_COMPENSATION';
}

function formatStructuredAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

function claimSummaryValue(claim: ValidatedResearchClaim): string {
  const value = claim.valueJson;
  if (isCompensationClaim(claim.type) && value !== null) {
    let amount = 'Structured amount available';
    if (value.amount !== null) {
      amount = formatStructuredAmount(value.amount);
    } else if (value.amountMin !== null && value.amountMax !== null) {
      amount = `${formatStructuredAmount(value.amountMin)}–${formatStructuredAmount(
        value.amountMax,
      )}`;
    }
    const context = [value.currency, value.period, value.role, value.location]
      .filter((item): item is string => item !== null)
      .join(' · ');
    return `${amount} (${context})`;
  }
  if (claim.valueText !== null) {
    return claim.valueText;
  }
  if (value?.stageOrder !== null && value?.stageOrder !== undefined) {
    return `Stage ${value.stageOrder}`;
  }
  return 'Structured evidence available';
}

function deriveSummary(claims: readonly ValidatedResearchClaim[]): string {
  if (claims.length === 0) {
    return 'No reliable external Research findings were available for this opportunity.';
  }

  return [
    '## Research findings',
    '',
    ...claims.map(
      (claim) => `- **${claim.type.replaceAll('_', ' ')}:** ${claimSummaryValue(claim)}`,
    ),
  ].join('\n');
}

function hasMeaningfulContradiction(
  claimKey: string,
  relationships: readonly ValidatedResearchClaimSource[],
  sourceByKey: ReadonlyMap<string, ValidatedResearchSource>,
): boolean {
  let hasGoodSupport = false;
  let hasGoodContradiction = false;

  for (const relationship of relationships) {
    if (relationship.claimKey !== claimKey) {
      continue;
    }
    const source = sourceByKey.get(relationship.sourceKey);
    if (source === undefined || source.sourceQuality === 'LOW') {
      continue;
    }
    if (relationship.relationship === 'SUPPORTS') {
      hasGoodSupport = true;
    } else {
      hasGoodContradiction = true;
    }
  }

  return hasGoodSupport && hasGoodContradiction;
}

function hasRoleSpecificContext(claim: ValidatedResearchClaim): boolean {
  if (
    claim.type !== 'SALARY_BASE' &&
    claim.type !== 'TOTAL_COMPENSATION' &&
    claim.type !== 'INTERVIEW_STAGE' &&
    claim.type !== 'INTERVIEW_TOPIC'
  ) {
    return false;
  }

  return claim.valueJson?.role !== null && claim.valueJson?.role !== undefined;
}

function deriveWarnings(
  modelWarnings: readonly ResearchWarningCode[],
  claims: readonly ValidatedResearchClaim[],
  relationships: readonly ValidatedResearchClaimSource[],
  sourceByKey: ReadonlyMap<string, ValidatedResearchSource>,
  researchDate: Date,
): readonly ResearchWarningCode[] {
  const warnings = new Set<ResearchWarningCode>(modelWarnings);
  const compensationClaims = claims.filter(
    ({ type }) => type === 'SALARY_BASE' || type === 'TOTAL_COMPENSATION',
  );
  if (compensationClaims.length === 0) {
    warnings.add('NO_RELIABLE_COMPENSATION_DATA');
  }
  if (
    compensationClaims.some(({ key }) =>
      hasMeaningfulContradiction(key, relationships, sourceByKey),
    )
  ) {
    warnings.add('CONFLICTING_SALARY_DATA');
  }

  const interviewClaims = claims.filter(
    ({ type }) => type === 'INTERVIEW_STAGE' || type === 'INTERVIEW_TOPIC',
  );
  if (interviewClaims.length > 0) {
    const datedInterviewSupport = relationships.flatMap((relationship) => {
      const claim = interviewClaims.find(
        ({ key }) => key === relationship.claimKey,
      );
      const source = sourceByKey.get(relationship.sourceKey);
      if (
        claim === undefined ||
        source === undefined ||
        relationship.relationship !== 'SUPPORTS' ||
        source.publishedAt === null
      ) {
        return [];
      }
      return [deriveResearchFreshness(claim.type, source.publishedAt, researchDate)];
    });
    if (
      datedInterviewSupport.length > 0 &&
      datedInterviewSupport.every((freshness) => freshness === 'STALE')
    ) {
      warnings.add('OUTDATED_INTERVIEW_REPORTS');
    }
  }

  if (
    !claims.some(
      ({ type }) => type === 'ROLE_INFORMATION' || type === 'TECHNOLOGY',
    ) &&
    !claims.some(hasRoleSpecificContext)
  ) {
    warnings.add('INSUFFICIENT_ROLE_SPECIFIC_DATA');
  }

  const materiallyLowQualityClaim = claims.some((claim) => {
    const supportingSources = relationships.flatMap((relationship) => {
      if (
        relationship.claimKey !== claim.key ||
        relationship.relationship !== 'SUPPORTS'
      ) {
        return [];
      }
      const source = sourceByKey.get(relationship.sourceKey);
      return source === undefined ? [] : [source];
    });

    return (
      supportingSources.length > 0 &&
      supportingSources.every(({ sourceQuality }) => sourceQuality === 'LOW')
    );
  });
  if (materiallyLowQualityClaim) {
    warnings.add('LOW_SOURCE_QUALITY');
  }

  return researchWarningCodes.filter((warning) => warnings.has(warning));
}

export class ResearchGraphValidator {
  constructor(
    private readonly confidenceService = new ResearchConfidenceService(),
  ) {}

  validate(input: ResearchValidationInput): ValidatedResearchGraph {
    if (input.output.sources.length > RESEARCH_MAX_SOURCES) {
      throw new ResearchValidationError(
        'RESEARCH_SOURCE_LIMIT_EXCEEDED',
        'TOO_MANY_SOURCES',
      );
    }
    if (!Number.isFinite(input.researchDate.getTime())) {
      throw new ResearchValidationError(
        'RESEARCH_CONFIDENCE_FAILED',
        'INVALID_RESEARCH_DATE',
      );
    }

    const normalizedSources = input.output.sources.map((source) =>
      normalizeSource(source, input.researchDate),
    );
    const providerUrls = buildResearchProviderProvenanceSet(
      input.providerWebSources,
    );
    for (const source of normalizedSources) {
      if (!providerUrls.has(source.normalizedUrl)) {
        throw new ResearchValidationError(
          'UNVERIFIED_RESEARCH_SOURCE',
          'SOURCE_NOT_REPORTED_BY_PROVIDER',
        );
      }
    }

    const { sources: deduplicatedSources, sourceKeyByLogicalId } =
      deduplicateSources(normalizedSources);
    const deduplicatedSourceByKey = new Map(
      deduplicatedSources.map((source) => [source.key, source]),
    );
    const claimKeys = new Set<string>();
    const relationships: ValidatedResearchClaimSource[] = [];
    const claimsWithoutConfidence: ValidatedClaimWithoutConfidence[] = [];

    for (const claim of input.output.claims) {
      const key = claim.id.trim();
      if (key.length === 0) {
        invalidClaim('INVALID_CLAIM_ID');
      }
      if (claimKeys.has(key)) {
        invalidClaim('DUPLICATE_CLAIM_ID');
      }
      claimKeys.add(key);

      if (isCompensationClaim(claim.type) && claim.valueJson === null) {
        invalidClaim('MISSING_COMPENSATION_VALUE');
      }
      const valueText = isCompensationClaim(claim.type)
        ? null
        : normalizeOptionalResearchText(claim.valueText);
      const valueJson = normalizeStructuredValue(claim, input.researchDate);
      if (valueText === null && valueJson === null) {
        invalidClaim('MISSING_CLAIM_VALUE');
      }
      if (claim.sourceLinks.length === 0) {
        invalidClaim('MISSING_CLAIM_EVIDENCE');
      }

      const linkedSourceKeys = new Set<string>();
      let hasSupportingEvidence = false;
      for (const link of claim.sourceLinks) {
        const sourceKey = sourceKeyByLogicalId.get(link.sourceId.trim());
        if (sourceKey === undefined) {
          throw new ResearchValidationError(
            'INVALID_CLAIM_SOURCE_RELATIONSHIP',
            'UNKNOWN_SOURCE_REFERENCE',
          );
        }
        if (linkedSourceKeys.has(sourceKey)) {
          throw new ResearchValidationError(
            'INVALID_CLAIM_SOURCE_RELATIONSHIP',
            'DUPLICATE_CLAIM_SOURCE_LINK',
          );
        }
        linkedSourceKeys.add(sourceKey);
        if (link.relationship === 'SUPPORTS') {
          hasSupportingEvidence = true;
        }
        relationships.push({
          claimKey: key,
          sourceKey,
          relationship: link.relationship,
          evidenceText: link.evidenceText.trim(),
        });
      }
      if (!hasSupportingEvidence) {
        invalidClaim('MISSING_SUPPORTING_EVIDENCE');
      }

      claimsWithoutConfidence.push({
        key,
        type: claim.type,
        valueText,
        valueJson,
        evidenceType: claim.evidenceType,
      });
    }

    const referencedSourceKeys = new Set(
      relationships.map(({ sourceKey }) => sourceKey),
    );
    const sources = deduplicatedSources.filter(({ key }) =>
      referencedSourceKeys.has(key),
    );
    const sourceByKey = new Map(sources.map((source) => [source.key, source]));

    const claims: ValidatedResearchClaim[] = claimsWithoutConfidence.map(
      (claim) => {
        const evidence: ResearchConfidenceEvidence[] = relationships.flatMap(
          (relationship) => {
            if (relationship.claimKey !== claim.key) {
              return [];
            }
            const source = deduplicatedSourceByKey.get(relationship.sourceKey);
            if (source === undefined) {
              throw new ResearchValidationError(
                'RESEARCH_CONFIDENCE_FAILED',
                'IMPOSSIBLE_CONFIDENCE_STATE',
              );
            }
            return [{ relationship: relationship.relationship, source }];
          },
        );

        return {
          ...claim,
          confidence: this.confidenceService.calculate({
            claim,
            evidence,
            researchDate: input.researchDate,
          }),
        };
      },
    );

    return {
      summaryMarkdown: deriveSummary(claims),
      warnings: deriveWarnings(
        input.output.warnings,
        claims,
        relationships,
        sourceByKey,
        input.researchDate,
      ),
      sources,
      claims,
      relationships,
    };
  }
}
