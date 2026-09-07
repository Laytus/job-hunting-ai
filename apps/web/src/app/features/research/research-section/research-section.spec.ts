import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import type {
  ResearchDetail,
  ResearchHistoryResponse,
} from '../research.models';
import { ResearchService } from '../research.service';
import { ResearchSection } from './research-section';

const applicationId = '10000000-0000-4000-8000-000000000000';
const researchId = '20000000-0000-4000-8000-000000000000';

const completed: ResearchDetail = {
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
  summaryMarkdown: 'Latest completed Research summary.',
  warnings: [],
  sources: [],
  claims: [],
  relationships: [],
};

const failed: ResearchDetail = {
  ...completed,
  id: '30000000-0000-4000-8000-000000000000',
  status: 'FAILED',
  summaryMarkdown: null,
  failureCode: 'LLM_PROVIDER_FAILED',
  failureMessage: 'The historical Research failed safely.',
  completedAt: null,
  failedAt: '2026-08-26T11:00:02.000Z',
};

const running: ResearchDetail = {
  ...completed,
  id: '40000000-0000-4000-8000-000000000000',
  status: 'RUNNING',
  summaryMarkdown: null,
  completedAt: null,
};

class FakeResearchService {
  historyResult: Observable<ResearchHistoryResponse> = of({ items: [] });
  latestResult: Observable<ResearchDetail | null> = of(null);
  runResult: Observable<ResearchDetail> = of(completed);
  detailResults = new Map<string, Observable<ResearchDetail>>();
  readonly historyCalls: string[] = [];
  readonly latestCalls: string[] = [];
  readonly runCalls: string[] = [];
  readonly detailCalls: { applicationId: string; researchId: string }[] = [];

  getResearchHistory(id: string): Observable<ResearchHistoryResponse> {
    this.historyCalls.push(id);
    return this.historyResult;
  }

  getLatestCompletedResearch(id: string): Observable<ResearchDetail | null> {
    this.latestCalls.push(id);
    return this.latestResult;
  }

  runResearch(id: string): Observable<ResearchDetail> {
    this.runCalls.push(id);
    return this.runResult;
  }

  getResearchDetail(
    requestedApplicationId: string,
    requestedResearchId: string,
  ): Observable<ResearchDetail> {
    this.detailCalls.push({
      applicationId: requestedApplicationId,
      researchId: requestedResearchId,
    });
    return this.detailResults.get(requestedResearchId) ?? of(failed);
  }
}

function apiError(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'Request failed',
    error: { error: { code, message: 'Private backend detail.' } },
  });
}

async function createSection(
  service: FakeResearchService,
): Promise<ComponentFixture<ResearchSection>> {
  await TestBed.configureTestingModule({
    imports: [ResearchSection],
    providers: [{ provide: ResearchService, useValue: service }],
  }).compileComponents();
  const fixture = TestBed.createComponent(ResearchSection);
  fixture.componentRef.setInput('applicationId', applicationId);
  fixture.detectChanges();
  return fixture;
}

function buttonContaining(
  fixture: ComponentFixture<ResearchSection>,
  label: string,
): HTMLButtonElement {
  const button = Array.from(
    fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
  ).find((candidate) => candidate.textContent?.includes(label));
  if (button === undefined) throw new Error(`Expected button containing ${label}.`);
  return button;
}

describe('ResearchSection', () => {
  it('loads history first and requests latest only when a completed run exists', async () => {
    const service = new FakeResearchService();
    service.latestResult = new Subject<ResearchDetail>();
    const historyResult = new Subject<ResearchHistoryResponse>();
    service.historyResult = historyResult;
    const fixture = await createSection(service);

    expect(service.historyCalls).toEqual([applicationId]);
    expect(service.latestCalls).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Loading Research results…');
    expect(fixture.nativeElement.textContent).toContain('Loading…');

    historyResult.next({ items: [completed] });
    historyResult.complete();
    fixture.detectChanges();

    expect(service.latestCalls).toEqual([applicationId]);
    expect(fixture.nativeElement.textContent).toContain('Loading Research results…');
  });

  it('treats an absent latest result as a normal empty state with Run Research', async () => {
    const service = new FakeResearchService();
    const fixture = await createSection(service);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('No research has been run for this application yet.');
    expect(buttonContaining(fixture, 'Run Research')).toBeTruthy();
    expect(text).not.toContain('Could not load the latest Research result.');
    expect(service.latestCalls).toEqual([]);
  });

  it('does not request latest when history contains no completed Research', async () => {
    const service = new FakeResearchService();
    service.historyResult = of({ items: [running, failed] });
    const fixture = await createSection(service);

    expect(service.latestCalls).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain(
      'No completed Research yet.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'The historical Research failed safely.',
    );
  });

  it('isolates a non-404 latest error while keeping loaded history usable', async () => {
    const service = new FakeResearchService();
    service.latestResult = throwError(() => apiError(503, 'USAGE_CHECK_FAILED'));
    service.historyResult = of({ items: [failed, completed] });
    const fixture = await createSection(service);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Could not load the latest Research result.');
    expect(text).toContain('The historical Research failed safely.');
    expect(fixture.nativeElement.querySelector('.history-item')).not.toBeNull();
  });

  it('isolates a history error while keeping the latest Research visible', async () => {
    const service = new FakeResearchService();
    service.latestResult = of(completed);
    service.historyResult = throwError(() => new Error('private history detail'));
    const fixture = await createSection(service);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Latest completed Research summary.');
    expect(text).toContain('Could not load Research history.');
    expect(text).not.toContain('private history detail');
  });

  it('runs Research from the empty state and refreshes history without a latest refetch', async () => {
    const service = new FakeResearchService();
    service.historyResult = of({ items: [] });
    const fixture = await createSection(service);

    service.historyResult = of({ items: [completed] });
    buttonContaining(fixture, 'Run Research').click();
    fixture.detectChanges();

    expect(service.runCalls).toEqual([applicationId]);
    expect(service.historyCalls).toEqual([applicationId, applicationId]);
    expect(service.latestCalls).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain(
      'Latest completed Research summary.',
    );
    expect(buttonContaining(fixture, 'Rerun Research')).toBeTruthy();
  });

  it('keeps the prior result visible, prevents double submit, and uses the POST result directly', async () => {
    const service = new FakeResearchService();
    service.latestResult = of(completed);
    service.historyResult = of({ items: [completed] });
    const runResult = new Subject<ResearchDetail>();
    service.runResult = runResult;
    const fixture = await createSection(service);
    const button = buttonContaining(fixture, 'Rerun Research');

    button.click();
    button.click();
    fixture.detectChanges();

    expect(service.runCalls).toEqual([applicationId]);
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Researching application…');
    expect(fixture.nativeElement.textContent).toContain(
      'Latest completed Research summary.',
    );

    const newResearch = {
      ...completed,
      id: '50000000-0000-4000-8000-000000000000',
      summaryMarkdown: 'New canonical POST result.',
    } satisfies ResearchDetail;
    service.historyResult = of({ items: [newResearch, completed] });
    runResult.next(newResearch);
    runResult.complete();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('New canonical POST result.');
    expect(service.historyCalls).toEqual([applicationId, applicationId]);
    expect(service.latestCalls).toEqual([applicationId]);
  });

  it.each([
    [409, 'RESEARCH_ALREADY_RUNNING', 'Research is already running for this application.'],
    [429, 'USAGE_NOT_ALLOWED', 'AI usage limit reached. Research could not be started.'],
    [502, 'INVALID_RESEARCH_SOURCE', 'Research could not be completed from the available AI/web result.'],
    [503, 'USAGE_CHECK_FAILED', 'Research is temporarily unavailable. Please try again later.'],
    [500, 'RESEARCH_PERSISTENCE_FAILED', 'Research could not be saved. Please try again later.'],
  ])(
    'maps HTTP %i / %s safely and preserves the prior result',
    async (status, code, expectedMessage) => {
      const service = new FakeResearchService();
      service.latestResult = of(completed);
      service.historyResult = of({ items: [completed] });
      service.runResult = throwError(() => apiError(status, code));
      const fixture = await createSection(service);

      buttonContaining(fixture, 'Rerun Research').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain(expectedMessage);
      expect(fixture.nativeElement.textContent).toContain(
        'Latest completed Research summary.',
      );
      expect(fixture.nativeElement.textContent).not.toContain(
        'Private backend detail.',
      );
      expect(service.historyCalls).toEqual([applicationId]);
    },
  );

  it('preserves API history order and lazily loads FAILED and RUNNING details', async () => {
    const service = new FakeResearchService();
    service.latestResult = of(completed);
    service.historyResult = of({ items: [running, failed, completed] });
    service.detailResults.set(failed.id, of(failed));
    service.detailResults.set(running.id, of(running));
    const fixture = await createSection(service);
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
      { applicationId, researchId: failed.id },
    ]);
    expect(fixture.nativeElement.textContent).toContain('Historical research');
    expect(fixture.nativeElement.textContent).toContain(
      'The historical Research failed safely.',
    );

    historyButtons[0]?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Research is running.');
  });

  it('ignores an older historical response that resolves after a newer selection', async () => {
    const service = new FakeResearchService();
    service.latestResult = of(completed);
    service.historyResult = of({ items: [failed, running, completed] });
    const failedResult = new Subject<ResearchDetail>();
    const runningResult = new Subject<ResearchDetail>();
    service.detailResults.set(failed.id, failedResult);
    service.detailResults.set(running.id, runningResult);
    const fixture = await createSection(service);
    const section = fixture.nativeElement.querySelector(
      '.research-section',
    ) as HTMLElement;
    section.scrollIntoView = vi.fn();
    const historyButtons = fixture.nativeElement.querySelectorAll(
      '.history-item',
    ) as NodeListOf<HTMLButtonElement>;

    historyButtons[0]?.click();
    historyButtons[1]?.click();
    runningResult.next(running);
    runningResult.complete();
    fixture.detectChanges();
    failedResult.next(failed);
    failedResult.complete();
    fixture.detectChanges();

    expect(service.detailCalls.map((call) => call.researchId)).toEqual([
      failed.id,
      running.id,
    ]);
    const resultText = (
      fixture.nativeElement.querySelector('.research-result') as HTMLElement
    ).textContent;
    expect(resultText).toContain('Research is running.');
    expect(resultText).not.toContain(
      'The historical Research failed safely.',
    );
  });

  it('returns to the loaded latest result and scrolls only on history navigation', async () => {
    const service = new FakeResearchService();
    service.latestResult = of(completed);
    service.historyResult = of({ items: [failed, completed] });
    service.detailResults.set(failed.id, of(failed));
    const fixture = await createSection(service);
    const section = fixture.nativeElement.querySelector(
      '.research-section',
    ) as HTMLElement;
    const scrollIntoView = vi.fn();
    section.scrollIntoView = scrollIntoView;

    buttonContaining(fixture, 'Failed').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    buttonContaining(fixture, 'Return to latest').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain(
      'Latest completed Research summary.',
    );
    expect(scrollIntoView).toHaveBeenCalledTimes(2);

    buttonContaining(fixture, 'Rerun Research').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
