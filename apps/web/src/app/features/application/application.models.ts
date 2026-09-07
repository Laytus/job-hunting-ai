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
  id: string;
  companyName: string;
  roleTitle: string;
  location: string | null;
  jobUrl: string | null;
  source: ApplicationSource;
  status: ApplicationStatus;
  priority: ApplicationPriority;
  dateFound: string | null;
  dateApplied: string | null;
  notesMarkdown: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationCreateRequest {
  companyName: string;
  roleTitle: string;
  location: string | null;
  jobUrl: string | null;
  source: ApplicationSource;
  status: ApplicationStatus;
  priority: ApplicationPriority;
  dateFound: string | null;
  dateApplied: string | null;
  notesMarkdown: string | null;
}

export type ApplicationUpdateRequest = ApplicationCreateRequest;

export interface ApplicationResponse {
  application: Application;
}

export interface ApplicationListResponse {
  applications: Application[];
}

export interface JobDescription {
  id: string;
  applicationId: string;
  title: string | null;
  companyName: string | null;
  descriptionMarkdown: string;
  requirementsMarkdown: string | null;
  responsibilitiesMarkdown: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobDescriptionUpdateRequest {
  title: string | null;
  companyName: string | null;
  descriptionMarkdown: string;
  requirementsMarkdown: string | null;
  responsibilitiesMarkdown: string | null;
  sourceUrl: string | null;
}

export interface JobDescriptionResponse {
  jobDescription: JobDescription | null;
}

export interface PersistedJobDescriptionResponse {
  jobDescription: JobDescription;
}

export const interviewTypes = [
  'RECRUITER',
  'HR',
  'TECHNICAL',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'FINAL',
  'OTHER',
] as const;

export type InterviewType = (typeof interviewTypes)[number];

export const interviewStatuses = [
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'RESCHEDULED',
] as const;

export type InterviewStatus = (typeof interviewStatuses)[number];

export interface Interview {
  id: string;
  applicationId: string;
  type: InterviewType;
  status: InterviewStatus;
  scheduledAt: string | null;
  completedAt: string | null;
  notesMarkdown: string | null;
  feedbackMarkdown: string | null;
  sortOrder: number;
}

export interface InterviewWriteRequest {
  type: InterviewType;
  status: InterviewStatus;
  scheduledAt: string | null;
  completedAt: string | null;
  notesMarkdown: string | null;
  feedbackMarkdown: string | null;
  sortOrder: number;
}

export interface InterviewResponse {
  interview: Interview;
}

export interface InterviewListResponse {
  interviews: Interview[];
}

export const applicationEventTypes = [
  'APPLICATION_CREATED',
  'APPLICATION_UPDATED',
  'APPLICATION_STATUS_CHANGED',
  'JOB_DESCRIPTION_CREATED',
  'JOB_DESCRIPTION_UPDATED',
  'INTERVIEW_CREATED',
  'INTERVIEW_UPDATED',
] as const;

export type ApplicationEventType = (typeof applicationEventTypes)[number];

export interface ApplicationEvent {
  id: string;
  type: ApplicationEventType;
  title: string;
  description: string;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
  createdAt: string;
}

export interface ApplicationEventListResponse {
  events: ApplicationEvent[];
}
