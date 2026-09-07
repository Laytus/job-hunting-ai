import type { AnalyzeOutput } from './analyze.schema.js';
import type { JobAnalysisStatus } from './analyze.types.js';

export interface JobAnalysisSummaryResponse {
  readonly id: string;
  readonly applicationId: string;
  readonly status: JobAnalysisStatus;
  readonly suggestedScore: number | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly promptVersion: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly failedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JobAnalysisDetailResponse
  extends JobAnalysisSummaryResponse {
  readonly analysisData: AnalyzeOutput | null;
}

export interface AnalyzeHistoryResponse {
  readonly items: readonly JobAnalysisSummaryResponse[];
}
