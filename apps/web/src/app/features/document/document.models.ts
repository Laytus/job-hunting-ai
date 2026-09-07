import type { CoverLetterVersionProfile } from '../generation/cover-letter-profile.models';

export const documentTypes = [
  'MARKDOWN_NOTE',
  'COVER_LETTER',
  'APPLICATION_BRIEF',
  'INTERVIEW_BRIEF',
] as const;

export type DocumentType = (typeof documentTypes)[number];

const documentTypeLabels: Record<DocumentType, string> = {
  MARKDOWN_NOTE: 'Markdown Note',
  COVER_LETTER: 'Cover Letter',
  APPLICATION_BRIEF: 'Application Brief',
  INTERVIEW_BRIEF: 'Interview Brief',
};

export function documentTypeLabel(type: DocumentType): string {
  return documentTypeLabels[type];
}

export interface DocumentSummary {
  id: string;
  type: DocumentType;
  title: string;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  contentMarkdown: string;
  createdAt: string;
  coverLetterProfile?: CoverLetterVersionProfile;
}

export interface Document {
  id: string;
  candidateId: string | null;
  applicationId: string | null;
  type: DocumentType;
  title: string;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
  currentVersion: DocumentVersion;
}

export type DocumentMetadata = Omit<Document, 'currentVersion'>;

export interface CreateDocumentRequest {
  candidateId: string | null;
  applicationId: string | null;
  type: DocumentType;
  title: string;
  contentMarkdown: string;
}

export interface UpdateDocumentMetadataRequest {
  type: DocumentType;
  title: string;
}

export interface CreateDocumentVersionRequest {
  contentMarkdown: string;
}
