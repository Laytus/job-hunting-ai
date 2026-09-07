import type {
  ApplicationPriority,
  ApplicationSource,
  ApplicationStatus,
} from '../application/application.types.js';
import type {
  CandidateSkillCategory,
  CandidateSkillLevel,
} from '../candidate/candidate.types.js';
import type {
  MatchStrength,
  RequirementImportance,
} from '../analyze/analyze.types.js';
import type {
  ResearchClaimSourceRelationship,
  ResearchClaimType,
  ResearchConfidence,
  ResearchEvidenceType,
  ResearchJsonValue,
  ResearchSourceQuality,
  ResearchSourceType,
} from '../research/research.types.js';
import type {
  CoverLetterSpecification,
  GenerationContextVersion,
  GenerationLanguage,
  GenerationWarning,
} from './generation.types.js';

export interface GenerationCandidateExperienceContext {
  readonly organization: string;
  readonly role: string;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly descriptionMarkdown: string | null;
}

export interface GenerationCandidateEducationContext {
  readonly institution: string;
  readonly degree: string;
  readonly fieldOfStudy: string | null;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly descriptionMarkdown: string | null;
}

export interface GenerationCandidateProjectContext {
  readonly name: string;
  readonly role: string | null;
  readonly descriptionMarkdown: string | null;
  readonly projectUrl: string | null;
  readonly repositoryUrl: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly technologies: readonly string[];
}

export interface GenerationCandidateSkillContext {
  readonly name: string;
  readonly category: CandidateSkillCategory;
  readonly level: CandidateSkillLevel | null;
  readonly notes: string | null;
}

export interface GenerationCandidateLanguageContext {
  readonly language: string;
  readonly level: string;
  readonly certification: string | null;
  readonly notes: string | null;
}

export interface GenerationCandidateContext {
  readonly fullName: string;
  readonly headline: string | null;
  readonly summaryMarkdown: string | null;
  readonly location: string | null;
  readonly linkedinUrl: string | null;
  readonly githubUrl: string | null;
  readonly portfolioUrl: string | null;
  readonly targetRoles: readonly string[];
  readonly targetLocations: readonly string[];
  readonly careerGoalsMarkdown: string | null;
  readonly additionalContext: string | null;
  readonly experiences: readonly GenerationCandidateExperienceContext[];
  readonly education: readonly GenerationCandidateEducationContext[];
  readonly projects: readonly GenerationCandidateProjectContext[];
  readonly skills: readonly GenerationCandidateSkillContext[];
  readonly languages: readonly GenerationCandidateLanguageContext[];
}

export interface GenerationJobDescriptionContext {
  readonly title: string | null;
  readonly companyName: string | null;
  readonly descriptionMarkdown: string;
  readonly requirementsMarkdown: string | null;
  readonly responsibilitiesMarkdown: string | null;
  readonly sourceUrl: string | null;
}

export interface GenerationAnalysisRequirementContext {
  readonly requirement: string;
  readonly importance: RequirementImportance;
  readonly matchStrength: MatchStrength;
  readonly evidence: readonly string[];
}

export interface GenerationAnalysisContext {
  readonly roleSummary: string;
  readonly fitSummary: string;
  readonly requirements: readonly GenerationAnalysisRequirementContext[];
  readonly candidateEvidence: readonly {
    readonly claim: string;
    readonly evidence: readonly string[];
  }[];
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly keywords: readonly string[];
  readonly hardConstraints: readonly {
    readonly constraint: string;
    readonly satisfied: boolean | null;
    readonly evidence: readonly string[];
  }[];
}

export interface GenerationResearchSourceContext {
  readonly title: string | null;
  readonly publisher: string | null;
  readonly sourceType: ResearchSourceType;
  readonly sourceQuality: ResearchSourceQuality;
  readonly publishedAt: string | null;
}

export interface GenerationResearchEvidenceContext {
  readonly relationship: ResearchClaimSourceRelationship;
  readonly evidenceText: string;
  readonly source: GenerationResearchSourceContext;
}

export interface GenerationResearchClaimContext<
  TType extends ResearchClaimType = ResearchClaimType,
> {
  readonly type: TType;
  readonly valueText: string | null;
  readonly valueJson: ResearchJsonValue | null;
  readonly evidenceType: ResearchEvidenceType;
  readonly confidence: ResearchConfidence;
  readonly evidence: readonly GenerationResearchEvidenceContext[];
}

export type CoverLetterResearchClaimType =
  | 'COMPANY_DESCRIPTION'
  | 'BUSINESS_AREA'
  | 'PARIS_PRESENCE'
  | 'ROLE_INFORMATION'
  | 'TECHNOLOGY';

export interface CoverLetterResearchClaimContext {
  readonly type: CoverLetterResearchClaimType;
  readonly valueText: string | null;
  readonly valueJson: ResearchJsonValue | null;
  readonly evidence: readonly {
    readonly evidenceText: string;
    readonly sourceTitle: string | null;
    readonly publisher: string | null;
    readonly publishedAt: string | null;
  }[];
}

export type InterviewBriefResearchClaimType =
  | 'COMPANY_DESCRIPTION'
  | 'BUSINESS_AREA'
  | 'ROLE_INFORMATION'
  | 'TECHNOLOGY'
  | 'INTERVIEW_STAGE'
  | 'INTERVIEW_TOPIC'
  | 'CULTURE';

export interface GenerationContextProvenance {
  readonly jobDescriptionId: string;
  readonly jobAnalysisId: string | null;
  readonly researchId: string | null;
  readonly candidateContextUpdatedAt: string;
  readonly researchClaimIds: readonly string[];
}

interface GenerationContextBase {
  readonly contextVersion: GenerationContextVersion;
  readonly language: GenerationLanguage;
  readonly candidate: GenerationCandidateContext;
  readonly jobDescription: GenerationJobDescriptionContext;
  readonly analysis: GenerationAnalysisContext | null;
  readonly warnings: readonly GenerationWarning[];
  readonly provenance: GenerationContextProvenance;
}

interface CoverLetterGenerationContextBase extends GenerationContextBase {
  readonly documentType: 'COVER_LETTER';
  readonly application: {
    readonly companyName: string;
    readonly roleTitle: string;
    readonly location: string | null;
  };
  readonly research: readonly CoverLetterResearchClaimContext[] | null;
}

export interface CoverLetterGenerationContext
  extends CoverLetterGenerationContextBase {
  readonly contextVersion: 'generation-context-v2';
  readonly specification: CoverLetterSpecification;
}

export interface ApplicationBriefGenerationContext
  extends GenerationContextBase {
  readonly contextVersion: 'generation-context-v1';
  readonly documentType: 'APPLICATION_BRIEF';
  readonly language: 'en';
  readonly application: {
    readonly companyName: string;
    readonly roleTitle: string;
    readonly location: string | null;
    readonly source: ApplicationSource;
    readonly jobUrl: string | null;
    readonly status: ApplicationStatus;
    readonly priority: ApplicationPriority;
    readonly dateFound: string | null;
    readonly dateApplied: string | null;
  };
  readonly research: readonly GenerationResearchClaimContext[] | null;
}

export interface InterviewBriefGenerationContext
  extends GenerationContextBase {
  readonly contextVersion: 'generation-context-v1';
  readonly documentType: 'INTERVIEW_BRIEF';
  readonly language: 'en';
  readonly application: {
    readonly companyName: string;
    readonly roleTitle: string;
    readonly location: string | null;
  };
  readonly research:
    | readonly GenerationResearchClaimContext<InterviewBriefResearchClaimType>[]
    | null;
}

export type GenerationContext =
  | CoverLetterGenerationContext
  | ApplicationBriefGenerationContext
  | InterviewBriefGenerationContext;
