export type ResearchStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export type ResearchSourceType =
  | 'OFFICIAL'
  | 'NEWS'
  | 'SALARY_DATABASE'
  | 'INTERVIEW_REPORT'
  | 'FORUM'
  | 'OTHER';

export type ResearchSourceQuality = 'HIGH' | 'MEDIUM' | 'LOW';

export type ResearchClaimType =
  | 'COMPANY_DESCRIPTION'
  | 'BUSINESS_AREA'
  | 'PARIS_PRESENCE'
  | 'ROLE_INFORMATION'
  | 'SALARY_BASE'
  | 'TOTAL_COMPENSATION'
  | 'INTERVIEW_STAGE'
  | 'INTERVIEW_TOPIC'
  | 'TECHNOLOGY'
  | 'CULTURE'
  | 'OTHER';

export type ResearchEvidenceType = 'FACT' | 'REPORTED' | 'INFERRED';
export type ResearchConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type ResearchRelationshipType = 'SUPPORTS' | 'CONTRADICTS';
export type ResearchStructuredValuePeriod =
  | 'HOUR'
  | 'MONTH'
  | 'YEAR'
  | 'OTHER';
export type ResearchInterviewFrequency =
  | 'SINGLE_REPORT'
  | 'MULTIPLE_REPORTS'
  | 'COMMON'
  | 'UNKNOWN';

export type ResearchWarningCode =
  | 'NO_RELIABLE_COMPENSATION_DATA'
  | 'CONFLICTING_SALARY_DATA'
  | 'OUTDATED_INTERVIEW_REPORTS'
  | 'INSUFFICIENT_ROLE_SPECIFIC_DATA'
  | 'AMBIGUOUS_COMPANY_MATCH'
  | 'LOW_SOURCE_QUALITY'
  | 'OTHER';

export interface ResearchStructuredValue {
  readonly amount: number | null;
  readonly amountMin?: number | null;
  readonly amountMax?: number | null;
  readonly currency: string | null;
  readonly period: ResearchStructuredValuePeriod | null;
  readonly location: string | null;
  readonly role: string | null;
  readonly seniority: string | null;
  readonly dataYear: number | null;
  readonly stageOrder: number | null;
  readonly frequency: ResearchInterviewFrequency | null;
}

export interface ResearchHistoryItem {
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

export interface ResearchSource {
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

export interface ResearchClaim {
  readonly id: string;
  readonly type: ResearchClaimType;
  readonly valueText: string | null;
  readonly valueJson: ResearchStructuredValue | null;
  readonly confidence: ResearchConfidence;
  readonly evidenceType: ResearchEvidenceType;
  readonly notes: string | null;
  readonly createdAt: string;
}

export interface ResearchRelationship {
  readonly claimId: string;
  readonly sourceId: string;
  readonly relationship: ResearchRelationshipType;
  readonly evidenceText: string;
}

export interface ResearchDetail extends ResearchHistoryItem {
  readonly summaryMarkdown: string | null;
  readonly warnings: readonly string[];
  readonly sources: readonly ResearchSource[];
  readonly claims: readonly ResearchClaim[];
  readonly relationships: readonly ResearchRelationship[];
}

export interface ResearchHistoryResponse {
  readonly items: readonly ResearchHistoryItem[];
}
