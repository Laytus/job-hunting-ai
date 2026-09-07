export const jobAnalysisStatuses = [
  'RUNNING',
  'COMPLETED',
  'FAILED',
] as const;

export type JobAnalysisStatus = (typeof jobAnalysisStatuses)[number];

export const requirementImportances = [
  'REQUIRED',
  'PREFERRED',
  'IMPLICIT',
  'UNKNOWN',
] as const;

export type RequirementImportance = (typeof requirementImportances)[number];

export const matchStrengths = [
  'STRONG',
  'PARTIAL',
  'WEAK',
  'NONE',
  'UNKNOWN',
] as const;

export type MatchStrength = (typeof matchStrengths)[number];

export interface AnalyzeRequirement {
  readonly requirement: string;
  readonly importance: RequirementImportance;
  readonly matchStrength: MatchStrength;
  readonly evidence: readonly string[];
}

export interface AnalyzeCandidateEvidence {
  readonly claim: string;
  readonly evidence: readonly string[];
}

export interface AnalyzeHardConstraint {
  readonly constraint: string;
  readonly satisfied: boolean | null;
  readonly evidence: readonly string[];
}

export interface AnalyzeOutput {
  readonly roleSummary: string;
  readonly fitSummary: string;
  readonly requirements: readonly AnalyzeRequirement[];
  readonly candidateEvidence: readonly AnalyzeCandidateEvidence[];
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly keywords: readonly string[];
  readonly hardConstraints: readonly AnalyzeHardConstraint[];
  readonly warnings: readonly string[];
}

export interface JobAnalysisSummary {
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

export interface JobAnalysisDetail extends JobAnalysisSummary {
  readonly analysisData: AnalyzeOutput | null;
}

export interface AnalyzeHistoryResponse {
  readonly items: readonly JobAnalysisSummary[];
}
