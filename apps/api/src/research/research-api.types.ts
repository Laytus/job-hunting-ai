import type {
  ResearchClaimSourceRelationship,
  ResearchClaimType,
  ResearchConfidence,
  ResearchEvidenceType,
  ResearchJsonValue,
  ResearchSourceQuality,
  ResearchSourceType,
  ResearchStatus,
} from './research.types.js';

export interface ResearchSummaryResponse {
  readonly id: string;
  readonly applicationId: string;
  readonly status: ResearchStatus;
  readonly promptVersion: string | null;
  readonly researchDate: string;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly failedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ResearchSourceResponse {
  readonly id: string;
  readonly url: string;
  readonly title: string | null;
  readonly publisher: string | null;
  readonly sourceType: ResearchSourceType;
  readonly sourceQuality: ResearchSourceQuality;
  readonly publishedAt: string | null;
  readonly retrievedAt: string;
  readonly notes: string | null;
  readonly createdAt: string;
}

export interface ResearchClaimResponse {
  readonly id: string;
  readonly type: ResearchClaimType;
  readonly valueText: string | null;
  readonly valueJson: ResearchJsonValue | null;
  readonly confidence: ResearchConfidence;
  readonly evidenceType: ResearchEvidenceType;
  readonly notes: string | null;
  readonly createdAt: string;
}

export interface ResearchRelationshipResponse {
  readonly claimId: string;
  readonly sourceId: string;
  readonly relationship: ResearchClaimSourceRelationship;
  readonly evidenceText: string;
}

export interface ResearchDetailResponse extends ResearchSummaryResponse {
  readonly summaryMarkdown: string | null;
  readonly warnings: readonly string[];
  readonly sources: readonly ResearchSourceResponse[];
  readonly claims: readonly ResearchClaimResponse[];
  readonly relationships: readonly ResearchRelationshipResponse[];
}

export interface ResearchHistoryResponse {
  readonly items: readonly ResearchSummaryResponse[];
}
