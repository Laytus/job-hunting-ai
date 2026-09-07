import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { catchError, of, throwError } from 'rxjs';
import type {
  ResearchDetail,
  ResearchHistoryResponse,
} from './research.models';

const applicationsUrl = '/api/v1/applications';

interface ApiErrorEnvelope {
  readonly error?: {
    readonly code?: unknown;
  };
}

function isResearchNotFound(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
    return false;
  }

  const body = error.error as ApiErrorEnvelope | null;
  return body?.error?.code === 'RESEARCH_NOT_FOUND';
}

@Injectable({ providedIn: 'root' })
export class ResearchService {
  private readonly httpClient = inject(HttpClient);

  runResearch(applicationId: string): Observable<ResearchDetail> {
    return this.httpClient.post<ResearchDetail>(
      `${applicationsUrl}/${applicationId}/research`,
      null,
    );
  }

  getResearchHistory(
    applicationId: string,
  ): Observable<ResearchHistoryResponse> {
    return this.httpClient.get<ResearchHistoryResponse>(
      `${applicationsUrl}/${applicationId}/researches`,
    );
  }

  getResearchDetail(
    applicationId: string,
    researchId: string,
  ): Observable<ResearchDetail> {
    return this.httpClient.get<ResearchDetail>(
      `${applicationsUrl}/${applicationId}/researches/${researchId}`,
    );
  }

  getLatestCompletedResearch(
    applicationId: string,
  ): Observable<ResearchDetail | null> {
    return this.httpClient
      .get<ResearchDetail>(
        `${applicationsUrl}/${applicationId}/researches/latest-completed`,
      )
      .pipe(
        catchError((error: unknown) =>
          isResearchNotFound(error) ? of(null) : throwError(() => error),
        ),
      );
  }
}
