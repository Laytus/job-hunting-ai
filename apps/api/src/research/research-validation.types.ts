import type { LlmWebSource } from '../llm/llm.types.js';
import type {
  ResearchOutput,
  ResearchStructuredValue,
} from './research.schema.js';
import type {
  ResearchClaimSourceRelationship,
  ResearchClaimType,
  ResearchConfidence,
  ResearchEvidenceType,
  ResearchSourceQuality,
  ResearchSourceType,
  ResearchWarningCode,
} from './research.types.js';

export const researchFreshnesses = [
  'FRESH',
  'AGING',
  'STALE',
  'UNKNOWN',
] as const;
export type ResearchFreshness = (typeof researchFreshnesses)[number];

export interface ResearchValidationInput {
  readonly output: ResearchOutput;
  readonly providerWebSources: readonly LlmWebSource[];
  readonly researchDate: Date;
}

export interface ValidatedResearchSource {
  readonly key: string;
  readonly url: string;
  readonly normalizedUrl: string;
  readonly title: string | null;
  readonly publisher: string | null;
  readonly sourceType: ResearchSourceType;
  readonly sourceQuality: ResearchSourceQuality;
  readonly publishedAt: string | null;
  readonly independenceGroup: string;
}

export interface ValidatedResearchClaim {
  readonly key: string;
  readonly type: ResearchClaimType;
  readonly valueText: string | null;
  readonly valueJson: ResearchStructuredValue | null;
  readonly evidenceType: ResearchEvidenceType;
  readonly confidence: ResearchConfidence;
}

export interface ValidatedResearchClaimSource {
  readonly claimKey: string;
  readonly sourceKey: string;
  readonly relationship: ResearchClaimSourceRelationship;
  readonly evidenceText: string;
}

export interface ValidatedResearchGraph {
  readonly summaryMarkdown: string;
  readonly warnings: readonly ResearchWarningCode[];
  readonly sources: readonly ValidatedResearchSource[];
  readonly claims: readonly ValidatedResearchClaim[];
  readonly relationships: readonly ValidatedResearchClaimSource[];
}

export interface ResearchConfidenceClaim {
  readonly type: ResearchClaimType;
  readonly valueJson: ResearchStructuredValue | null;
  readonly evidenceType: ResearchEvidenceType;
}

export interface ResearchConfidenceEvidence {
  readonly relationship: ResearchClaimSourceRelationship;
  readonly source: ValidatedResearchSource;
}

export interface ResearchConfidenceInput {
  readonly claim: ResearchConfidenceClaim;
  readonly evidence: readonly ResearchConfidenceEvidence[];
  readonly researchDate: Date;
}
