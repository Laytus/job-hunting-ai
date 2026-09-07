export const researchStatuses = ['RUNNING', 'COMPLETED', 'FAILED'] as const;
export type ResearchStatus = (typeof researchStatuses)[number];

export const RESEARCH_PROMPT_VERSION = 'research-v2';
export const RESEARCH_MAX_SOURCES = 20;
export const RESEARCH_OPERATION_NAME = 'RESEARCH_APPLICATION';
export const RESEARCH_SCHEMA_NAME = 'research_output';

export const researchSourceTypes = [
  'OFFICIAL',
  'NEWS',
  'SALARY_DATABASE',
  'INTERVIEW_REPORT',
  'FORUM',
  'OTHER',
] as const;
export type ResearchSourceType = (typeof researchSourceTypes)[number];

export const researchSourceQualities = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type ResearchSourceQuality = (typeof researchSourceQualities)[number];

export const researchClaimTypes = [
  'COMPANY_DESCRIPTION',
  'BUSINESS_AREA',
  'PARIS_PRESENCE',
  'ROLE_INFORMATION',
  'SALARY_BASE',
  'TOTAL_COMPENSATION',
  'INTERVIEW_STAGE',
  'INTERVIEW_TOPIC',
  'TECHNOLOGY',
  'CULTURE',
  'OTHER',
] as const;
export type ResearchClaimType = (typeof researchClaimTypes)[number];

export const researchEvidenceTypes = ['FACT', 'REPORTED', 'INFERRED'] as const;
export type ResearchEvidenceType = (typeof researchEvidenceTypes)[number];

export const researchConfidences = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type ResearchConfidence = (typeof researchConfidences)[number];

export const researchClaimSourceRelationships = [
  'SUPPORTS',
  'CONTRADICTS',
] as const;
export type ResearchClaimSourceRelationship =
  (typeof researchClaimSourceRelationships)[number];

export const researchStructuredValuePeriods = [
  'HOUR',
  'MONTH',
  'YEAR',
  'OTHER',
] as const;
export type ResearchStructuredValuePeriod =
  (typeof researchStructuredValuePeriods)[number];

export const researchInterviewFrequencies = [
  'SINGLE_REPORT',
  'MULTIPLE_REPORTS',
  'COMMON',
  'UNKNOWN',
] as const;
export type ResearchInterviewFrequency =
  (typeof researchInterviewFrequencies)[number];

export const researchWarningCodes = [
  'NO_RELIABLE_COMPENSATION_DATA',
  'CONFLICTING_SALARY_DATA',
  'OUTDATED_INTERVIEW_REPORTS',
  'INSUFFICIENT_ROLE_SPECIFIC_DATA',
  'AMBIGUOUS_COMPANY_MATCH',
  'LOW_SOURCE_QUALITY',
  'OTHER',
] as const;
export type ResearchWarningCode = (typeof researchWarningCodes)[number];

export type ResearchJsonValue = Readonly<Record<string, unknown>>;

export interface Research {
  readonly id: string;
  readonly applicationId: string;
  readonly status: ResearchStatus;
  readonly summaryMarkdown: string | null;
  readonly warnings: readonly string[];
  readonly promptVersion: string | null;
  readonly researchDate: Date;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly failedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ResearchSource {
  readonly id: string;
  readonly researchId: string;
  readonly url: string;
  readonly normalizedUrl: string;
  readonly title: string | null;
  readonly publisher: string | null;
  readonly sourceType: ResearchSourceType;
  readonly sourceQuality: ResearchSourceQuality;
  readonly publishedAt: string | null;
  readonly retrievedAt: Date;
  readonly notes: string | null;
  readonly createdAt: Date;
}

export interface ResearchClaim {
  readonly id: string;
  readonly researchId: string;
  readonly type: ResearchClaimType;
  readonly valueText: string | null;
  readonly valueJson: ResearchJsonValue | null;
  readonly evidenceType: ResearchEvidenceType;
  readonly confidence: ResearchConfidence;
  readonly notes: string | null;
  readonly createdAt: Date;
}

export interface ResearchClaimSource {
  readonly researchId: string;
  readonly claimId: string;
  readonly sourceId: string;
  readonly relationship: ResearchClaimSourceRelationship;
  readonly evidenceText: string;
}

export interface ResearchAggregate extends Research {
  readonly sources: readonly ResearchSource[];
  readonly claims: readonly ResearchClaim[];
  readonly relationships: readonly ResearchClaimSource[];
}

export interface CreateRunningResearchCommand {
  readonly applicationId: string;
  readonly researchDate: Date;
  readonly startedAt: Date;
  readonly promptVersion?: string | null;
}

export interface FailResearchCommand {
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly failedAt: Date;
}

export interface ResearchSourceDraft {
  readonly key: string;
  readonly url: string;
  readonly normalizedUrl: string;
  readonly title: string | null;
  readonly publisher: string | null;
  readonly sourceType: ResearchSourceType;
  readonly sourceQuality: ResearchSourceQuality;
  readonly publishedAt: string | null;
  readonly retrievedAt: Date;
  readonly notes: string | null;
}

export interface ResearchClaimDraft {
  readonly key: string;
  readonly type: ResearchClaimType;
  readonly valueText: string | null;
  readonly valueJson: ResearchJsonValue | null;
  readonly evidenceType: ResearchEvidenceType;
  readonly confidence: ResearchConfidence;
  readonly notes: string | null;
}

export interface ResearchClaimSourceDraft {
  readonly claimKey: string;
  readonly sourceKey: string;
  readonly relationship: ResearchClaimSourceRelationship;
  readonly evidenceText: string;
}

export interface CompleteResearchGraphCommand {
  readonly summaryMarkdown: string | null;
  readonly warnings: readonly string[];
  readonly promptVersion: string | null;
  readonly completedAt: Date;
  readonly sources: readonly ResearchSourceDraft[];
  readonly claims: readonly ResearchClaimDraft[];
  readonly relationships: readonly ResearchClaimSourceDraft[];
}
