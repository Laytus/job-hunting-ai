import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { catchError, of, throwError } from 'rxjs';
import type {
  AnalyzeHistoryResponse,
  JobAnalysisDetail,
} from './analyze.models';

const applicationsUrl = '/api/v1/applications';

interface ApiErrorEnvelope {
  readonly error?: {
    readonly code?: unknown;
  };
}

function isAnalysisNotFound(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 404) {
    return false;
  }

  const body = error.error as ApiErrorEnvelope | null;
  return body?.error?.code === 'ANALYSIS_NOT_FOUND';
}

@Injectable({ providedIn: 'root' })
export class AnalyzeService {
  private readonly httpClient = inject(HttpClient);

  runAnalyze(applicationId: string): Observable<JobAnalysisDetail> {
    return this.httpClient.post<JobAnalysisDetail>(
      `${applicationsUrl}/${applicationId}/analyze`,
      null,
    );
  }

  getAnalyzeHistory(
    applicationId: string,
  ): Observable<AnalyzeHistoryResponse> {
    return this.httpClient.get<AnalyzeHistoryResponse>(
      `${applicationsUrl}/${applicationId}/analyses`,
    );
  }

  getAnalyzeById(
    applicationId: string,
    analysisId: string,
  ): Observable<JobAnalysisDetail> {
    return this.httpClient.get<JobAnalysisDetail>(
      `${applicationsUrl}/${applicationId}/analyses/${analysisId}`,
    );
  }

  getLatestCompletedAnalyze(
    applicationId: string,
  ): Observable<JobAnalysisDetail | null> {
    return this.httpClient
      .get<JobAnalysisDetail>(
        `${applicationsUrl}/${applicationId}/analyses/latest-completed`,
      )
      .pipe(
        catchError((error: unknown) =>
          isAnalysisNotFound(error) ? of(null) : throwError(() => error),
        ),
      );
  }
}
