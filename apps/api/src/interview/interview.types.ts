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
  readonly id: string;
  readonly applicationId: string;
  readonly type: InterviewType;
  readonly status: InterviewStatus;
  readonly scheduledAt: Date | null;
  readonly completedAt: Date | null;
  readonly notesMarkdown: string | null;
  readonly feedbackMarkdown: string | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InterviewWriteCommand {
  readonly type: InterviewType;
  readonly status: InterviewStatus;
  readonly scheduledAt: Date | null;
  readonly completedAt: Date | null;
  readonly notesMarkdown: string | null;
  readonly feedbackMarkdown: string | null;
  readonly sortOrder: number;
}

export interface InterviewWriteInput {
  readonly type: InterviewType;
  readonly status: InterviewStatus;
  readonly scheduledAt: string | null;
  readonly completedAt: string | null;
  readonly notesMarkdown: string | null;
  readonly feedbackMarkdown: string | null;
  readonly sortOrder: number;
}
