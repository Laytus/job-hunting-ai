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

interface TimestampedCandidateResource {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateExperience extends TimestampedCandidateResource {
  organization: string;
  role: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  descriptionMarkdown: string | null;
  sortOrder: number;
}

export interface CandidateEducation extends TimestampedCandidateResource {
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  location: string | null;
  startDate: string;
  endDate: string | null;
  descriptionMarkdown: string | null;
  sortOrder: number;
}

export interface CandidateProject extends TimestampedCandidateResource {
  name: string;
  role: string | null;
  descriptionMarkdown: string | null;
  projectUrl: string | null;
  repositoryUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  technologies: string[];
  sortOrder: number;
}

export interface CandidateSkill extends TimestampedCandidateResource {
  name: string;
  category: CandidateSkillCategory;
  level: CandidateSkillLevel | null;
  notes: string | null;
  sortOrder: number;
}

export interface CandidateLanguage extends TimestampedCandidateResource {
  language: string;
  level: string;
  certification: string | null;
  notes: string | null;
  sortOrder: number;
}

export interface CandidateProfile extends TimestampedCandidateResource {
  fullName: string;
  headline: string | null;
  summaryMarkdown: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  location: string | null;
  targetRoles: string[];
  targetLocations: string[];
  careerGoalsMarkdown: string | null;
  cvMarkdown: string | null;
  additionalContext: string | null;
  experiences: CandidateExperience[];
  education: CandidateEducation[];
  projects: CandidateProject[];
  skills: CandidateSkill[];
  languages: CandidateLanguage[];
  candidateContextUpdatedAt: string;
}

export interface CandidateResponse {
  candidate: CandidateProfile | null;
}

export type CandidateExperienceInput = Omit<
  CandidateExperience,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: string };

export type CandidateEducationInput = Omit<
  CandidateEducation,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: string };

export type CandidateProjectInput = Omit<
  CandidateProject,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: string };

export type CandidateSkillInput = Omit<
  CandidateSkill,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: string };

export type CandidateLanguageInput = Omit<
  CandidateLanguage,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: string };

export interface CandidateReplacement {
  fullName: string;
  headline: string | null;
  summaryMarkdown: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  location: string | null;
  targetRoles: string[];
  targetLocations: string[];
  careerGoalsMarkdown: string | null;
  cvMarkdown: string | null;
  additionalContext: string | null;
  experiences: CandidateExperienceInput[];
  education: CandidateEducationInput[];
  projects: CandidateProjectInput[];
  skills: CandidateSkillInput[];
  languages: CandidateLanguageInput[];
}
