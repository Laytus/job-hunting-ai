import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import type {
  AnalyzeHistoryResponse,
  JobAnalysisDetail,
  JobAnalysisSummary,
} from '../analyze.models';
import { AnalyzeService } from '../analyze.service';
import { ApplicationAnalysis } from './application-analysis';

const applicationId = '10000000-0000-4000-8000-000000000000';
const analysisId = '20000000-0000-4000-8000-000000000000';

const output = {
  roleSummary: 'Own reliable platform services.',
  fitSummary: 'Strong backend experience with one domain gap.',
  requirements: [
    {
      requirement: 'Production TypeScript',
      importance: 'REQUIRED' as const,
      matchStrength: 'STRONG' as const,
      evidence: ['Built typed production services.'],
    },
  ],
  candidateEvidence: [
    {
      claim: 'Has service ownership experience.',
      evidence: ['Led a platform migration.'],
    },
  ],
  strengths: ['Strong TypeScript background.'],
  gaps: ['No explicit Kubernetes evidence.'],
  keywords: ['TypeScript', 'Platform'],
  hardConstraints: [
    {
      constraint: 'Security clearance',
      satisfied: null,
      evidence: [],
    },
  ],
  warnings: ['Seniority expectations are ambiguous.'],
};

const completed: JobAnalysisDetail = {
  id: analysisId,
  applicationId,
  status: 'COMPLETED',
  analysisData: output,
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

const failed: JobAnalysisDetail = {
  ...completed,
  id: '30000000-0000-4000-8000-000000000000',
  status: 'FAILED',
  analysisData: null,
  suggestedScore: null,
  failureCode: 'LLM_PROVIDER_FAILED',
  failureMessage: 'The analysis could not be completed.',
  completedAt: null,
  failedAt: '2026-08-26T11:00:02.000Z',
  createdAt: '2026-08-26T11:00:00.000Z',
  updatedAt: '2026-08-26T11:00:02.000Z',
};

const running: JobAnalysisSummary = {
  ...completed,
  id: '40000000-0000-4000-8000-000000000000',
  status: 'RUNNING',
  suggestedScore: null,
  failureCode: null,
  failureMessage: null,
  completedAt: null,
  startedAt: '2026-08-26T12:00:00.000Z',
  createdAt: '2026-08-26T12:00:00.000Z',
  updatedAt: '2026-08-26T12:00:00.000Z',
};

class FakeAnalyzeService {
  historyResult: Observable<AnalyzeHistoryResponse> = of({ items: [] });
  latestResult: Observable<JobAnalysisDetail | null> = of(null);
  runResult: Observable<JobAnalysisDetail> = of(completed);
  detailResult: Observable<JobAnalysisDetail> = of(failed);
  readonly historyCalls: string[] = [];
  readonly latestCalls: string[] = [];
  readonly runCalls: string[] = [];
  readonly detailCalls: { applicationId: string; analysisId: string }[] = [];

  getAnalyzeHistory(id: string): Observable<AnalyzeHistoryResponse> {
    this.historyCalls.push(id);
    return this.historyResult;
  }

  getLatestCompletedAnalyze(id: string): Observable<JobAnalysisDetail | null> {
    this.latestCalls.push(id);
    return this.latestResult;
  }

  runAnalyze(id: string): Observable<JobAnalysisDetail> {
    this.runCalls.push(id);
    return this.runResult;
  }

  getAnalyzeById(
    requestedApplicationId: string,
    requestedAnalysisId: string,
  ): Observable<JobAnalysisDetail> {
    this.detailCalls.push({
      applicationId: requestedApplicationId,
      analysisId: requestedAnalysisId,
    });
    return this.detailResult;
  }
}

function apiError(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'Request failed',
    error: { error: { code, message: 'Safe backend message.' } },
  });
}

async function createAnalysis(
  service: FakeAnalyzeService,
): Promise<ComponentFixture<ApplicationAnalysis>> {
  await TestBed.configureTestingModule({
    imports: [ApplicationAnalysis],
    providers: [
      provideRouter([]),
      { provide: AnalyzeService, useValue: service },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ApplicationAnalysis);
  fixture.componentRef.setInput('applicationId', applicationId);
  fixture.detectChanges();
  return fixture;
}

function buttonContaining(
  fixture: ComponentFixture<ApplicationAnalysis>,
  label: string,
): HTMLButtonElement {
  const button = Array.from(
    fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
  ).find((candidate) => candidate.textContent?.includes(label));
  if (button === undefined) throw new Error(`Expected button containing ${label}.`);
  return button;
}

describe('ApplicationAnalysis', () => {
  it('loads history first and requests latest only when a completed run exists', async () => {
    const service = new FakeAnalyzeService();
    const historyResult = new Subject<AnalyzeHistoryResponse>();
    service.historyResult = historyResult;
    service.latestResult = new Subject<JobAnalysisDetail>();
    const fixture = await createAnalysis(service);

    expect(fixture.nativeElement.textContent).toContain(
      'Loading Analyze results…',
    );
    expect(service.historyCalls).toEqual([applicationId]);
    expect(service.latestCalls).toEqual([]);

    historyResult.next({ items: [completed] });
    historyResult.complete();
    fixture.detectChanges();

    expect(service.latestCalls).toEqual([applicationId]);
    expect(fixture.nativeElement.textContent).toContain(
      'Loading Analyze results…',
    );
  });

  it('treats an absent latest result plus empty history as the normal empty state', async () => {
    const service = new FakeAnalyzeService();
    const fixture = await createAnalysis(service);

    expect(fixture.nativeElement.textContent).toContain('No analysis yet.');
    expect(fixture.nativeElement.textContent).toContain(
      'Run Analyze to evaluate this application',
    );
    expect(buttonContaining(fixture, 'Run Analyze')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain(
      'Could not load Analyze data.',
    );
    expect(service.latestCalls).toEqual([]);
  });

  it('does not request latest when history contains no completed analysis', async () => {
    const service = new FakeAnalyzeService();
    service.historyResult = of({ items: [running, failed] });
    const fixture = await createAnalysis(service);

    expect(service.latestCalls).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain(
      'No completed analysis yet.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      failed.failureMessage,
    );
  });

  it('renders the latest completed result and all result sections', async () => {
    const service = new FakeAnalyzeService();
    service.latestResult = of(completed);
    service.historyResult = of({ items: [completed] });
    const fixture = await createAnalysis(service);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Suggested fit score');
    expect(text).toContain('82');
    expect(text).toContain(output.roleSummary);
    expect(text).toContain(output.fitSummary);
    expect(text).toContain('Production TypeScript');
    expect(text).toContain('Strong TypeScript background.');
    expect(text).toContain('No explicit Kubernetes evidence.');
    expect(text).toContain('Security clearance');
    expect(text).toContain('Has service ownership experience.');
    expect(text).toContain('Platform');
    expect(text).toContain('Seniority expectations are ambiguous.');
  });

  it('keeps the prior result visible, blocks duplicate clicks, and refreshes history after success', async () => {
    const service = new FakeAnalyzeService();
    service.latestResult = of(completed);
    service.historyResult = of({ items: [completed] });
    const runResult = new Subject<JobAnalysisDetail>();
    service.runResult = runResult;
    const fixture = await createAnalysis(service);
    const button = buttonContaining(fixture, 'Run Analyze again');

    button.click();
    button.click();
    fixture.detectChanges();

    expect(service.runCalls).toEqual([applicationId]);
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Analyzing application…');
    expect(fixture.nativeElement.textContent).toContain(output.fitSummary);

    const newAnalysis = {
      ...completed,
      id: '50000000-0000-4000-8000-000000000000',
      suggestedScore: 91,
    } satisfies JobAnalysisDetail;
    service.historyResult = of({ items: [newAnalysis, completed] });
    runResult.next(newAnalysis);
    runResult.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('91');
    expect(service.historyCalls).toEqual([applicationId, applicationId]);
    expect(service.latestCalls).toEqual([applicationId]);
  });

  it.each([
    [
      409,
      'ANALYSIS_ALREADY_RUNNING',
      'An analysis is already in progress for this application.',
    ],
    [
      409,
      'CANDIDATE_PROFILE_UNAVAILABLE',
      'Complete the Candidate Profile before running Analyze.',
    ],
    [
      409,
      'JOB_DESCRIPTION_UNAVAILABLE',
      'Add a Job Description before running Analyze.',
    ],
    [
      409,
      'INVALID_SOURCE_CONTEXT',
      'Review the Candidate Profile and Job Description before running Analyze.',
    ],
    [
      429,
      'USAGE_NOT_ALLOWED',
      'configured AI usage limit has been reached',
    ],
    [502, 'LLM_PROVIDER_FAILED', 'Analyze could not complete successfully.'],
    [503, 'USAGE_CHECK_FAILED', 'Analyze is temporarily unavailable.'],
    [500, 'SCORING_FAILED', 'Analyze could not be completed.'],
  ])(
    'presents HTTP %i / %s safely while preserving the latest result',
    async (status, code, message) => {
      const service = new FakeAnalyzeService();
      service.latestResult = of(completed);
      service.historyResult = of({ items: [completed] });
      service.runResult = throwError(() => apiError(status, code));
      const fixture = await createAnalysis(service);

      buttonContaining(fixture, 'Run Analyze again').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(message);
      expect(fixture.nativeElement.textContent).toContain(output.fitSummary);
      expect(fixture.nativeElement.textContent).not.toContain(
        'Safe backend message.',
      );
      expect(service.runCalls).toHaveLength(1);
      expect(service.historyCalls).toHaveLength(2);
    },
  );

  it('provides actionable links for missing Analyze sources', async () => {
    const service = new FakeAnalyzeService();
    service.runResult = throwError(() =>
      apiError(409, 'INVALID_SOURCE_CONTEXT'),
    );
    const fixture = await createAnalysis(service);

    buttonContaining(fixture, 'Run Analyze').click();
    fixture.detectChanges();
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.notice--error a') as NodeListOf<HTMLAnchorElement>,
    );

    expect(links.map((link) => link.textContent?.trim())).toEqual([
      'Open Candidate Profile',
      'Go to Job Description',
    ]);
  });

  it('preserves API history order and lazily loads a selected failed detail', async () => {
    const service = new FakeAnalyzeService();
    service.latestResult = of(completed);
    service.historyResult = of({ items: [running, failed, completed] });
    service.detailResult = of(failed);
    const fixture = await createAnalysis(service);
    const section = fixture.nativeElement.querySelector(
      '.analysis-section',
    ) as HTMLElement;
    const scrollIntoView = vi.fn();
    section.scrollIntoView = scrollIntoView;
    const historyButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.history-item') as NodeListOf<HTMLButtonElement>,
    );

    expect(historyButtons.map((button) => button.textContent?.trim())).toEqual([
      expect.stringContaining('Running'),
      expect.stringContaining('Failed'),
      expect.stringContaining('Completed'),
    ]);
    expect(service.detailCalls).toEqual([]);

    historyButtons[1]?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(service.detailCalls).toEqual([
      { applicationId, analysisId: failed.id },
    ]);
    expect(fixture.nativeElement.textContent).toContain('Historical analysis');
    expect(fixture.nativeElement.textContent).toContain(
      failed.failureMessage,
    );
    expect(fixture.nativeElement.querySelector('.score-card')).toBeNull();
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      block: 'start',
    });

    buttonContaining(fixture, 'Return to latest').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain(
      'Latest completed analysis',
    );
    expect(fixture.nativeElement.textContent).toContain(output.fitSummary);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('does not scroll when Run Analyze completes', async () => {
    const service = new FakeAnalyzeService();
    service.latestResult = of(completed);
    service.historyResult = of({ items: [completed] });
    const fixture = await createAnalysis(service);
    const section = fixture.nativeElement.querySelector(
      '.analysis-section',
    ) as HTMLElement;
    const scrollIntoView = vi.fn();
    section.scrollIntoView = scrollIntoView;

    buttonContaining(fixture, 'Run Analyze again').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('shows a local load error and retries without affecting other workspace features', async () => {
    const service = new FakeAnalyzeService();
    service.historyResult = throwError(() => new Error('private API detail'));
    const fixture = await createAnalysis(service);

    expect(fixture.nativeElement.textContent).toContain(
      'Could not load Analyze data.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('private API detail');

    service.historyResult = of({ items: [] });
    buttonContaining(fixture, 'Try again').click();
    fixture.detectChanges();

    expect(service.historyCalls).toEqual([applicationId, applicationId]);
    expect(fixture.nativeElement.textContent).toContain('No analysis yet.');
  });
});
