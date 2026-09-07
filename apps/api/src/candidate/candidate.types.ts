export const candidateSkillCategories = [
  'PROGRAMMING_LANGUAGE',
  'FRAMEWORK',
  'LIBRARY',
  'DATABASE',
  'CLOUD',
  'DEVOPS',
  'TOOL',
  'METHODOLOGY',
  'DOMAIN',
  'SOFT_SKILL',
  'OTHER',
] as const;

export type CandidateSkillCategory = (typeof candidateSkillCategories)[number];

export const candidateSkillLevels = [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
  'EXPERT',
] as const;

export type CandidateSkillLevel = (typeof candidateSkillLevels)[number];

export type CandidateChildCollection =
  | 'experiences'
  | 'education'
  | 'projects'
  | 'skills'
  | 'languages';

export interface CandidateProfile {
  readonly id: string;
  readonly fullName: string;
  readonly headline: string | null;
  readonly summaryMarkdown: string | null;
  readonly linkedinUrl: string | null;
  readonly githubUrl: string | null;
  readonly portfolioUrl: string | null;
  readonly location: string | null;
  readonly targetRoles: readonly string[];
  readonly targetLocations: readonly string[];
  readonly careerGoalsMarkdown: string | null;
  readonly cvMarkdown: string | null;
  readonly additionalContext: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CandidateExperience {
  readonly id: string;
  readonly organization: string;
  readonly role: string;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly descriptionMarkdown: string | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CandidateEducation {
  readonly id: string;
  readonly institution: string;
  readonly degree: string;
  readonly fieldOfStudy: string | null;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly descriptionMarkdown: string | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CandidateProject {
  readonly id: string;
  readonly name: string;
  readonly role: string | null;
  readonly descriptionMarkdown: string | null;
  readonly projectUrl: string | null;
  readonly repositoryUrl: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly technologies: readonly string[];
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CandidateSkill {
  readonly id: string;
  readonly name: string;
  readonly category: CandidateSkillCategory;
  readonly level: CandidateSkillLevel | null;
  readonly notes: string | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CandidateLanguage {
  readonly id: string;
  readonly language: string;
  readonly level: string;
  readonly certification: string | null;
  readonly notes: string | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CandidateAggregate extends CandidateProfile {
  readonly experiences: readonly CandidateExperience[];
  readonly education: readonly CandidateEducation[];
  readonly projects: readonly CandidateProject[];
  readonly skills: readonly CandidateSkill[];
  readonly languages: readonly CandidateLanguage[];
}

export interface CandidateExperienceReplacement {
  readonly id?: string;
  readonly organization: string;
  readonly role: string;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly descriptionMarkdown: string | null;
  readonly sortOrder: number;
}

export interface CandidateEducationReplacement {
  readonly id?: string;
  readonly institution: string;
  readonly degree: string;
  readonly fieldOfStudy: string | null;
  readonly location: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly descriptionMarkdown: string | null;
  readonly sortOrder: number;
}

export interface CandidateProjectReplacement {
  readonly id?: string;
  readonly name: string;
  readonly role: string | null;
  readonly descriptionMarkdown: string | null;
  readonly projectUrl: string | null;
  readonly repositoryUrl: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly technologies: readonly string[];
  readonly sortOrder: number;
}

export interface CandidateSkillReplacement {
  readonly id?: string;
  readonly name: string;
  readonly category: CandidateSkillCategory;
  readonly level: CandidateSkillLevel | null;
  readonly notes: string | null;
  readonly sortOrder: number;
}

export interface CandidateLanguageReplacement {
  readonly id?: string;
  readonly language: string;
  readonly level: string;
  readonly certification: string | null;
  readonly notes: string | null;
  readonly sortOrder: number;
}

export interface CandidateReplacementCommand {
  readonly fullName: string;
  readonly headline: string | null;
  readonly summaryMarkdown: string | null;
  readonly linkedinUrl: string | null;
  readonly githubUrl: string | null;
  readonly portfolioUrl: string | null;
  readonly location: string | null;
  readonly targetRoles: readonly string[];
  readonly targetLocations: readonly string[];
  readonly careerGoalsMarkdown: string | null;
  readonly cvMarkdown: string | null;
  readonly additionalContext: string | null;
  readonly experiences: readonly CandidateExperienceReplacement[];
  readonly education: readonly CandidateEducationReplacement[];
  readonly projects: readonly CandidateProjectReplacement[];
  readonly skills: readonly CandidateSkillReplacement[];
  readonly languages: readonly CandidateLanguageReplacement[];
}
