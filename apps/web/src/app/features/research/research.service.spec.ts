import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type {
  ResearchDetail,
  ResearchHistoryItem,
  ResearchHistoryResponse,
} from './research.models';
import { ResearchService } from './research.service';

const applicationId = '10000000-0000-4000-8000-000000000000';
const researchId = '20000000-0000-4000-8000-000000000000';

const historyItem: ResearchHistoryItem = {
  id: researchId,
  applicationId,
  status: 'COMPLETED',
  promptVersion: 'research-v1',
  researchDate: '2026-08-26T10:00:00.000Z',
  failureCode: null,
  failureMessage: null,
  startedAt: '2026-08-26T10:00:00.000Z',
  completedAt: '2026-08-26T10:00:02.000Z',
  failedAt: null,
  createdAt: '2026-08-26T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:02.000Z',
};

const detail: ResearchDetail = {
  ...historyItem,
  summaryMarkdown: '## Company\n\nA reliable platform company.',
  warnings: [],
  sources: [],
  claims: [],
  relationships: [],
};

describe('ResearchService', () => {
  let service: ResearchService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ResearchService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('runs Research with POST and no client AI configuration', async () => {
    const result = firstValueFrom(service.runResearch(applicationId));
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/research`,
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    request.flush(detail);
    await expect(result).resolves.toEqual(detail);
  });

  it('loads Research history with GET', async () => {
    const result = firstValueFrom(service.getResearchHistory(applicationId));
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/researches`,
    );

    expect(request.request.method).toBe('GET');
    request.flush({ items: [historyItem] } satisfies ResearchHistoryResponse);
    await expect(result).resolves.toEqual({ items: [historyItem] });
  });

  it('loads one Research detail with nested GET', async () => {
    const result = firstValueFrom(
      service.getResearchDetail(applicationId, researchId),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/researches/${researchId}`,
    );

    expect(request.request.method).toBe('GET');
    request.flush(detail);
    await expect(result).resolves.toEqual(detail);
  });

  it('loads the latest completed Research detail with GET', async () => {
    const result = firstValueFrom(
      service.getLatestCompletedResearch(applicationId),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/researches/latest-completed`,
    );

    expect(request.request.method).toBe('GET');
    request.flush(detail);
    await expect(result).resolves.toEqual(detail);
  });

  it('maps RESEARCH_NOT_FOUND to an absent latest result', async () => {
    const result = firstValueFrom(
      service.getLatestCompletedResearch(applicationId),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/researches/latest-completed`,
    );

    request.flush(
      {
        error: {
          code: 'RESEARCH_NOT_FOUND',
          message: 'The Research was not found.',
        },
      },
      { status: 404, statusText: 'Not Found' },
    );
    await expect(result).resolves.toBeNull();
  });

  it('keeps unexpected latest-Research errors exceptional', async () => {
    const result = firstValueFrom(
      service.getLatestCompletedResearch(applicationId),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/researches/latest-completed`,
    );

    request.flush(
      { error: { code: 'INTERNAL_ERROR', message: 'Safe server message.' } },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await expect(result).rejects.toMatchObject({ status: 500 });
  });
});
