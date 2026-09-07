import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type {
  AnalyzeHistoryResponse,
  JobAnalysisDetail,
  JobAnalysisSummary,
} from './analyze.models';
import { AnalyzeService } from './analyze.service';

const applicationId = '10000000-0000-4000-8000-000000000000';
const analysisId = '20000000-0000-4000-8000-000000000000';

const summary: JobAnalysisSummary = {
  id: analysisId,
  applicationId,
  status: 'COMPLETED',
  suggestedScore: 82,
  failureCode: null,
  failureMessage: null,
  promptVersion: 'analyze-v1',
  startedAt: '2026-08-26T10:00:00.000Z',
  completedAt: '2026-08-26T10:00:02.000Z',
  failedAt: null,
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:02.000Z',
};

const detail: JobAnalysisDetail = {
  ...summary,
  analysisData: {
    roleSummary: 'Build reliable platform services.',
    fitSummary: 'The candidate has strong relevant experience.',
    requirements: [],
    candidateEvidence: [],
    strengths: [],
    gaps: [],
    keywords: [],
    hardConstraints: [],
    warnings: [],
  },
};

describe('AnalyzeService', () => {
  let service: AnalyzeService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnalyzeService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('runs Analyze with POST and no client configuration', async () => {
    const result = firstValueFrom(service.runAnalyze(applicationId));
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/analyze`,
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush(detail);
    await expect(result).resolves.toEqual(detail);
  });

  it('loads Analyze history with GET', async () => {
    const result = firstValueFrom(service.getAnalyzeHistory(applicationId));
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/analyses`,
    );

    expect(request.request.method).toBe('GET');
    request.flush({ items: [summary] } satisfies AnalyzeHistoryResponse);
    await expect(result).resolves.toEqual({ items: [summary] });
  });

  it('loads one Analyze detail with nested GET', async () => {
    const result = firstValueFrom(
      service.getAnalyzeById(applicationId, analysisId),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/analyses/${analysisId}`,
    );

    expect(request.request.method).toBe('GET');
    request.flush(detail);
    await expect(result).resolves.toEqual(detail);
  });

  it('loads the latest completed Analyze result with GET', async () => {
    const result = firstValueFrom(
      service.getLatestCompletedAnalyze(applicationId),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/analyses/latest-completed`,
    );

    expect(request.request.method).toBe('GET');
    request.flush(detail);
    await expect(result).resolves.toEqual(detail);
  });

  it('maps ANALYSIS_NOT_FOUND to an absent latest result', async () => {
    const result = firstValueFrom(
      service.getLatestCompletedAnalyze(applicationId),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/analyses/latest-completed`,
    );

    request.flush(
      {
        error: {
          code: 'ANALYSIS_NOT_FOUND',
          message: 'The Job Analysis was not found.',
        },
      },
      { status: 404, statusText: 'Not Found' },
    );
    await expect(result).resolves.toBeNull();
  });

  it('keeps unexpected latest-Analyze errors exceptional', async () => {
    const result = firstValueFrom(
      service.getLatestCompletedAnalyze(applicationId),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/analyses/latest-completed`,
    );

    request.flush(
      { error: { code: 'INTERNAL_ERROR', message: 'Safe server message.' } },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await expect(result).rejects.toMatchObject({ status: 500 });
  });

  it('propagates the safe API error response to the UI boundary', async () => {
    const result = firstValueFrom(service.runAnalyze(applicationId));
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/analyze`,
    );

    request.flush(
      {
        error: {
          code: 'ANALYSIS_ALREADY_RUNNING',
          message: 'An Analyze run is already in progress.',
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await expect(result).rejects.toMatchObject({ status: 409 });
  });
});
