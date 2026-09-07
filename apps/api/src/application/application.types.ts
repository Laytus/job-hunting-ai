export const applicationStatuses = [
  'FOUND',
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export const applicationPriorities = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;

export type ApplicationPriority = (typeof applicationPriorities)[number];

export const applicationSources = [
  'CAREER_PAGE',
  'LINKEDIN',
  'REFERRAL',
  'RECRUITER',
  'OTHER',
] as const;

export type ApplicationSource = (typeof applicationSources)[number];

export interface Application {
  readonly id: string;
  readonly companyName: string;
  readonly roleTitle: string;
  readonly location: string | null;
  readonly jobUrl: string | null;
  readonly source: ApplicationSource;
  readonly status: ApplicationStatus;
  readonly priority: ApplicationPriority;
  readonly dateFound: string | null;
  readonly dateApplied: string | null;
  readonly notesMarkdown: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApplicationWriteCommand {
  readonly companyName: string;
  readonly roleTitle: string;
  readonly location: string | null;
  readonly jobUrl: string | null;
  readonly source: ApplicationSource;
  readonly status: ApplicationStatus;
  readonly priority: ApplicationPriority;
  readonly dateFound: string | null;
  readonly dateApplied: string | null;
  readonly notesMarkdown: string | null;
}
