import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { coverLetterVersionProfileFromMetadata } from '../generation/cover-letter-profile.models';
import {
  CreateDocumentRequest,
  CreateDocumentVersionRequest,
  Document,
  DocumentSummary,
  DocumentVersion,
  UpdateDocumentMetadataRequest,
} from './document.models';

const documentsUrl = '/api/v1/documents';
const applicationsUrl = '/api/v1/applications';

export interface DocumentVersionApiResource extends DocumentVersion {
  metadata?: unknown;
}

interface DocumentApiResource extends Omit<Document, 'currentVersion'> {
  currentVersion: DocumentVersionApiResource;
}

interface DocumentResponse {
  document: DocumentApiResource;
}

interface DocumentVersionListResponse {
  versions: DocumentVersionApiResource[];
}

interface ApplicationDocumentListResponse {
  documents: DocumentSummary[];
}

function mapDocumentSummary(document: DocumentSummary): DocumentSummary {
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    currentVersionId: document.currentVersionId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export function mapDocumentVersion(
  version: DocumentVersionApiResource,
): DocumentVersion {
  const coverLetterProfile = coverLetterVersionProfileFromMetadata(
    version.metadata,
  );
  return {
    id: version.id,
    documentId: version.documentId,
    contentMarkdown: version.contentMarkdown,
    createdAt: version.createdAt,
    ...(coverLetterProfile === null ? {} : { coverLetterProfile }),
  };
}

function mapDocument(document: DocumentApiResource): Document {
  return {
    id: document.id,
    candidateId: document.candidateId,
    applicationId: document.applicationId,
    type: document.type,
    title: document.title,
    currentVersionId: document.currentVersionId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    currentVersion: mapDocumentVersion(document.currentVersion),
  };
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly httpClient = inject(HttpClient);

  getApplicationDocuments(applicationId: string): Observable<DocumentSummary[]> {
    return this.httpClient
      .get<ApplicationDocumentListResponse>(
        `${applicationsUrl}/${applicationId}/documents`,
      )
      .pipe(
        map((response) => response.documents.map(mapDocumentSummary)),
      );
  }

  getDocument(id: string): Observable<Document> {
    return this.httpClient
      .get<DocumentResponse>(`${documentsUrl}/${id}`)
      .pipe(map((response) => mapDocument(response.document)));
  }

  getDocumentVersions(id: string): Observable<DocumentVersion[]> {
    return this.httpClient
      .get<DocumentVersionListResponse>(`${documentsUrl}/${id}/versions`)
      .pipe(
        map((response) => response.versions.map(mapDocumentVersion)),
      );
  }

  createDocument(request: CreateDocumentRequest): Observable<Document> {
    return this.httpClient
      .post<DocumentResponse>(documentsUrl, request)
      .pipe(map((response) => mapDocument(response.document)));
  }

  updateDocumentMetadata(
    id: string,
    request: UpdateDocumentMetadataRequest,
  ): Observable<Document> {
    return this.httpClient
      .put<DocumentResponse>(`${documentsUrl}/${id}`, request)
      .pipe(map((response) => mapDocument(response.document)));
  }

  createDocumentVersion(
    id: string,
    request: CreateDocumentVersionRequest,
  ): Observable<Document> {
    return this.httpClient
      .post<DocumentResponse>(`${documentsUrl}/${id}/versions`, request)
      .pipe(map((response) => mapDocument(response.document)));
  }
}
