import type { AnalyzeOutput } from './analyze.schema.js';

export const ANALYZE_PROMPT_VERSION = 'analyze-v1';
export const ANALYZE_SCHEMA_NAME = 'analyze_output';
export const ANALYZE_OPERATION_NAME = 'ANALYZE_APPLICATION';

export const jobAnalysisStatuses = ['RUNNING', 'COMPLETED', 'FAILED'] as const;
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

export interface JobAnalysis {
  readonly id: string;
  readonly applicationId: string;
  readonly status: JobAnalysisStatus;
  readonly analysisData: AnalyzeOutput | null;
  readonly suggestedScore: number | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly promptVersion: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly failedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateRunningJobAnalysisCommand {
  readonly applicationId: string;
  readonly promptVersion: string;
  readonly startedAt: Date;
}

export interface CompleteJobAnalysisCommand {
  readonly analysisData: AnalyzeOutput;
  readonly suggestedScore: number | null;
  readonly completedAt: Date;
}

export interface FailJobAnalysisCommand {
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly failedAt: Date;
}

export interface AnalyzeExecutionResult {
  readonly analysisId: string;
  readonly applicationId: string;
  readonly status: 'COMPLETED';
  readonly output: AnalyzeOutput;
  readonly suggestedScore: number | null;
  readonly promptVersion: string;
}
