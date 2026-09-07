import type {
  Document,
  DocumentSummary,
  DocumentVersion,
  DocumentWithCurrentVersion,
} from './document.types.js';

export function serializeDocumentVersion(version: DocumentVersion) {
  return {
    id: version.id,
    documentId: version.documentId,
    contentMarkdown: version.contentMarkdown,
    metadata: version.metadata,
    createdAt: version.createdAt.toISOString(),
  };
}

export function serializeDocumentMetadata(document: Document) {
  return {
    id: document.id,
    candidateId: document.candidateId,
    applicationId: document.applicationId,
    type: document.type,
    title: document.title,
    currentVersionId: document.currentVersionId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function serializeDocument(document: DocumentWithCurrentVersion) {
  return {
    ...serializeDocumentMetadata(document),
    currentVersion: serializeDocumentVersion(document.currentVersion),
  };
}

export function serializeDocumentSummary(document: DocumentSummary) {
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    currentVersionId: document.currentVersionId,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
