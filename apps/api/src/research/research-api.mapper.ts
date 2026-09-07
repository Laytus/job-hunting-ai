import type {
  ResearchDetailResponse,
  ResearchSummaryResponse,
} from './research-api.types.js';
import type { Research, ResearchAggregate } from './research.types.js';

export function serializeResearchSummary(
  research: Research,
): ResearchSummaryResponse {
  return {
    id: research.id,
    applicationId: research.applicationId,
    status: research.status,
    promptVersion: research.promptVersion,
    researchDate: research.researchDate.toISOString(),
    failureCode: research.failureCode,
    failureMessage: research.failureMessage,
    startedAt: research.startedAt.toISOString(),
    completedAt: research.completedAt?.toISOString() ?? null,
    failedAt: research.failedAt?.toISOString() ?? null,
    createdAt: research.createdAt.toISOString(),
    updatedAt: research.updatedAt.toISOString(),
  };
}

export function serializeResearchDetail(
  research: ResearchAggregate,
): ResearchDetailResponse {
  return {
    ...serializeResearchSummary(research),
    summaryMarkdown: research.summaryMarkdown,
    warnings: research.warnings,
    sources: research.sources.map((source) => ({
      id: source.id,
      url: source.url,
      title: source.title,
      publisher: source.publisher,
      sourceType: source.sourceType,
      sourceQuality: source.sourceQuality,
      publishedAt: source.publishedAt,
      retrievedAt: source.retrievedAt.toISOString(),
      notes: source.notes,
      createdAt: source.createdAt.toISOString(),
    })),
    claims: research.claims.map((claim) => ({
      id: claim.id,
      type: claim.type,
      valueText: claim.valueText,
      valueJson: claim.valueJson,
      confidence: claim.confidence,
      evidenceType: claim.evidenceType,
      notes: claim.notes,
      createdAt: claim.createdAt.toISOString(),
    })),
    relationships: research.relationships.map((relationship) => ({
      claimId: relationship.claimId,
      sourceId: relationship.sourceId,
      relationship: relationship.relationship,
      evidenceText: relationship.evidenceText,
    })),
  };
}
