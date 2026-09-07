import type {
  JobAnalysisDetailResponse,
  JobAnalysisSummaryResponse,
} from './analyze-api.types.js';
import type { JobAnalysis } from './analyze.types.js';

export function serializeJobAnalysisSummary(
  analysis: JobAnalysis,
): JobAnalysisSummaryResponse {
  return {
    id: analysis.id,
    applicationId: analysis.applicationId,
    status: analysis.status,
    suggestedScore: analysis.suggestedScore,
    failureCode: analysis.failureCode,
    failureMessage: analysis.failureMessage,
    promptVersion: analysis.promptVersion,
    startedAt: analysis.startedAt.toISOString(),
    completedAt: analysis.completedAt?.toISOString() ?? null,
    failedAt: analysis.failedAt?.toISOString() ?? null,
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
  };
}

export function serializeJobAnalysisDetail(
  analysis: JobAnalysis,
): JobAnalysisDetailResponse {
  return {
    ...serializeJobAnalysisSummary(analysis),
    analysisData: analysis.analysisData,
  };
}
