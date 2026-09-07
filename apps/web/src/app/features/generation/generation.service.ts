import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';
import { mapDocumentVersion } from '../document/document.service';
import type {
  CoverLetterProfileSuggestion,
  CoverLetterProfileSuggestionResponse,
  GenerateDocumentRequest,
  GenerationApiResponse,
  GenerationResponse,
  RegenerateDocumentRequest,
} from './generation.models';

const applicationsUrl = '/api/v1/applications';

function mapGenerationResponse(
  response: GenerationApiResponse,
): GenerationResponse {
  const currentVersion = mapDocumentVersion(response.currentVersion);
  return {
    document: {
      ...response.document,
      currentVersion,
    },
    currentVersion,
    warnings: [...response.warnings],
  };
}

@Injectable({ providedIn: 'root' })
export class GenerationService {
  private readonly httpClient = inject(HttpClient);

  suggestCoverLetterProfile(
    applicationId: string,
  ): Observable<CoverLetterProfileSuggestion> {
    return this.httpClient
      .get<CoverLetterProfileSuggestionResponse>(
        `${applicationsUrl}/${applicationId}/generation/cover-letter-profile`,
      )
      .pipe(map((response) => response.suggestion));
  }

  generateDocument(
    applicationId: string,
    request: GenerateDocumentRequest,
  ): Observable<GenerationResponse> {
    return this.httpClient
      .post<GenerationApiResponse>(
        `${applicationsUrl}/${applicationId}/generation`,
        request,
      )
      .pipe(map(mapGenerationResponse));
  }

  regenerateDocument(
    applicationId: string,
    documentId: string,
    request: RegenerateDocumentRequest,
  ): Observable<GenerationResponse> {
    return this.httpClient
      .post<GenerationApiResponse>(
        `${applicationsUrl}/${applicationId}/documents/${documentId}/regenerate`,
        request,
      )
      .pipe(map(mapGenerationResponse));
  }
}
