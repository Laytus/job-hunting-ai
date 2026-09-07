import type { ApplicationSource } from '../application/application.types.js';
import type {
  CandidateSkillCategory,
  CandidateSkillLevel,
} from '../candidate/candidate.types.js';

export interface AnalyzeCandidateExperienceContext {
  readonly organization: string;
  readonly role: string;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly descriptionMarkdown: string | null;
}

export interface AnalyzeCandidateEducationContext {
  readonly institution: string;
  readonly degree: string;
  readonly fieldOfStudy: string | null;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly descriptionMarkdown: string | null;
}

export interface AnalyzeCandidateProjectContext {
  readonly name: string;
  readonly role: string | null;
  readonly descriptionMarkdown: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly technologies: readonly string[];
}

export interface AnalyzeCandidateSkillContext {
  readonly name: string;
  readonly category: CandidateSkillCategory;
  readonly level: CandidateSkillLevel | null;
  readonly notes: string | null;
}

export interface AnalyzeCandidateLanguageContext {
  readonly language: string;
  readonly level: string;
  readonly certification: string | null;
  readonly notes: string | null;
}

export interface AnalyzeCandidateContext {
  readonly fullName: string;
  readonly headline: string | null;
  readonly summaryMarkdown: string | null;
  readonly location: string | null;
  readonly targetRoles: readonly string[];
  readonly targetLocations: readonly string[];
  readonly careerGoalsMarkdown: string | null;
  readonly cvMarkdown: string | null;
  readonly additionalContext: string | null;
  readonly experiences: readonly AnalyzeCandidateExperienceContext[];
  readonly education: readonly AnalyzeCandidateEducationContext[];
  readonly projects: readonly AnalyzeCandidateProjectContext[];
  readonly skills: readonly AnalyzeCandidateSkillContext[];
  readonly languages: readonly AnalyzeCandidateLanguageContext[];
}

export interface AnalyzeApplicationContext {
  readonly companyName: string;
  readonly roleTitle: string;
  readonly location: string | null;
  readonly source: ApplicationSource;
  readonly jobUrl: string | null;
}

export interface AnalyzeJobDescriptionContext {
  readonly title: string | null;
  readonly companyName: string | null;
  readonly descriptionMarkdown: string;
  readonly requirementsMarkdown: string | null;
  readonly responsibilitiesMarkdown: string | null;
  readonly sourceUrl: string | null;
}

export interface AnalyzeContext {
  readonly candidate: AnalyzeCandidateContext;
  readonly application: AnalyzeApplicationContext;
  readonly jobDescription: AnalyzeJobDescriptionContext;
}
