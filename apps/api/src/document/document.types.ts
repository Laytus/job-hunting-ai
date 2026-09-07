export const documentTypes = [
  'MARKDOWN_NOTE',
  'COVER_LETTER',
  'APPLICATION_BRIEF',
  'INTERVIEW_BRIEF',
] as const;

export type DocumentType = (typeof documentTypes)[number];

export interface DocumentVersion {
  readonly id: string;
  readonly documentId: string;
  readonly contentMarkdown: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
}

export interface Document {
  readonly id: string;
  readonly candidateId: string | null;
  readonly applicationId: string | null;
  readonly type: DocumentType;
  readonly title: string;
  readonly currentVersionId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DocumentWithCurrentVersion extends Document {
  readonly currentVersion: DocumentVersion;
}

export interface DocumentSummary {
  readonly id: string;
  readonly type: DocumentType;
  readonly title: string;
  readonly currentVersionId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateDocumentInput {
  readonly candidateId: string | null;
  readonly applicationId: string | null;
  readonly type: DocumentType;
  readonly title: string;
  readonly contentMarkdown: string;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

export interface CreateDocumentCommand {
  readonly candidateId: string | null;
  readonly applicationId: string | null;
  readonly type: DocumentType;
  readonly title: string;
  readonly contentMarkdown: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
}

export interface UpdateDocumentMetadataInput {
  readonly type: DocumentType;
  readonly title: string;
}

export type UpdateDocumentMetadataCommand = UpdateDocumentMetadataInput;

export interface CreateDocumentVersionInput {
  readonly contentMarkdown: string;
  readonly metadata?: Readonly<Record<string, unknown>> | null;
}

export interface CreateDocumentVersionCommand {
  readonly contentMarkdown: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
}
