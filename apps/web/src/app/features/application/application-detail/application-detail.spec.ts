import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import type {
  AnalyzeHistoryResponse,
  JobAnalysisDetail,
} from '../../analyze/analyze.models';
import { AnalyzeService } from '../../analyze/analyze.service';
import type {
  ResearchDetail,
  ResearchHistoryResponse,
} from '../../research/research.models';
import { ResearchService } from '../../research/research.service';
import {
  Application,
  ApplicationCreateRequest,
  ApplicationEvent,
  ApplicationUpdateRequest,
  Interview,
  InterviewWriteRequest,
  JobDescription,
  JobDescriptionUpdateRequest,
} from '../application.models';
import { ApplicationService } from '../application.service';
import { ApplicationDetail } from './application-detail';

const applicationId = '10000000-0000-4000-8000-000000000000';

const application: Application = {
  id: applicationId,
  companyName: 'Analytical Engines Ltd',
  roleTitle: 'Software Engineer',
  location: 'Remote',
  jobUrl: 'https://example.com/job',
  source: 'CAREER_PAGE',
  status: 'APPLIED',
  priority: 'HIGH',
  dateFound: '2026-08-01',
  dateApplied: '2026-08-02',
  notesMarkdown: '# Notes',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
};

const jobDescription: JobDescription = {
  id: '20000000-0000-4000-8000-000000000000',
  applicationId,
  title: 'Software Engineer',
  companyName: 'Analytical Engines Ltd',
  descriptionMarkdown: '# Software Engineer\n\nBuild reliable systems.',
  requirementsMarkdown: '- TypeScript',
  responsibilitiesMarkdown: '- Own delivery',
  sourceUrl: 'https://example.com/job',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
};

const interview: Interview = {
  id: '30000000-0000-4000-8000-000000000000',
  applicationId,
  type: 'TECHNICAL',
  status: 'SCHEDULED',
  scheduledAt: '2026-09-01T14:00:00.000Z',
  completedAt: null,
  notesMarkdown: '# Preparation',
  feedbackMarkdown: null,
  sortOrder: 1,
};

const applicationEvent: ApplicationEvent = {
  id: '40000000-0000-4000-8000-000000000000',
  type: 'APPLICATION_CREATED',
  title: 'Application created',
  description: 'The application was created.',
  metadata: null,
  occurredAt: '2026-08-01T10:00:00.000Z',
  createdAt: '2026-08-01T10:00:01.000Z',
};

class FakeApplicationService {
  getResult: Observable<Application> = of(application);
  createResult: Observable<Application> = of(application);
  updateResult: Observable<Application> = of(application);
  jobDescriptionResult: Observable<JobDescription | null> = of(null);
  jobDescriptionUpdateResult: Observable<JobDescription> = of(jobDescription);
  interviewsResult: Observable<Interview[]> = of([]);
  interviewCreateResult: Observable<Interview> = of(interview);
  interviewUpdateResult: Observable<Interview> = of(interview);
  applicationEventsResult: Observable<ApplicationEvent[]> = of([
    applicationEvent,
  ]);
  readonly requestedIds: string[] = [];
  readonly createCommands: ApplicationCreateRequest[] = [];
  readonly updateCalls: {
    readonly id: string;
    readonly command: ApplicationUpdateRequest;
  }[] = [];
  readonly jobDescriptionIds: string[] = [];
  readonly jobDescriptionUpdateCalls: {
    readonly id: string;
    readonly command: JobDescriptionUpdateRequest;
  }[] = [];
  readonly interviewApplicationIds: string[] = [];
  readonly interviewCreateCalls: {
    readonly applicationId: string;
    readonly command: InterviewWriteRequest;
  }[] = [];
  readonly interviewUpdateCalls: {
    readonly applicationId: string;
    readonly interviewId: string;
    readonly command: InterviewWriteRequest;
  }[] = [];
  readonly applicationEventIds: string[] = [];

  getApplication(id: string): Observable<Application> {
    this.requestedIds.push(id);
    return this.getResult;
  }

  createApplication(command: ApplicationCreateRequest): Observable<Application> {
    this.createCommands.push(command);
    return this.createResult;
  }

  updateApplication(
    id: string,
    command: ApplicationUpdateRequest,
  ): Observable<Application> {
    this.updateCalls.push({ id, command });
    return this.updateResult;
  }

  getJobDescription(id: string): Observable<JobDescription | null> {
    this.jobDescriptionIds.push(id);
    return this.jobDescriptionResult;
  }

  updateJobDescription(
    id: string,
    command: JobDescriptionUpdateRequest,
  ): Observable<JobDescription> {
    this.jobDescriptionUpdateCalls.push({ id, command });
    return this.jobDescriptionUpdateResult;
  }

  getInterviews(id: string): Observable<Interview[]> {
    this.interviewApplicationIds.push(id);
    return this.interviewsResult;
  }

  createInterview(
    id: string,
    command: InterviewWriteRequest,
  ): Observable<Interview> {
    this.interviewCreateCalls.push({ applicationId: id, command });
    return this.interviewCreateResult;
  }

  updateInterview(
    id: string,
    interviewId: string,
    command: InterviewWriteRequest,
  ): Observable<Interview> {
    this.interviewUpdateCalls.push({
      applicationId: id,
      interviewId,
      command,
    });
    return this.interviewUpdateResult;
  }

  getApplicationEvents(id: string): Observable<ApplicationEvent[]> {
    this.applicationEventIds.push(id);
    return this.applicationEventsResult;
  }
}

class FakeAnalyzeService {
  getAnalyzeHistory(): Observable<AnalyzeHistoryResponse> {
    return of({ items: [] });
  }

  getLatestCompletedAnalyze(): Observable<JobAnalysisDetail | null> {
    return of(null);
  }
}

class FakeResearchService {
  readonly historyCalls: string[] = [];
  readonly latestCalls: string[] = [];

  getResearchHistory(id: string): Observable<ResearchHistoryResponse> {
    this.historyCalls.push(id);
    return of({ items: [] });
  }

  getLatestCompletedResearch(id: string): Observable<ResearchDetail | null> {
    this.latestCalls.push(id);
    return of(null);
  }
}

async function configureDetail(
  service: FakeApplicationService,
  id: string | null,
): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [ApplicationDetail],
    providers: [
      provideRouter([]),
      { provide: ApplicationService, useValue: service },
      { provide: AnalyzeService, useClass: FakeAnalyzeService },
      { provide: ResearchService, useClass: FakeResearchService },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(id === null ? {} : { id }),
          },
        },
      },
    ],
  }).compileComponents();
}

function createFixture(): ComponentFixture<ApplicationDetail> {
  const fixture = TestBed.createComponent(ApplicationDetail);
  fixture.detectChanges();
  return fixture;
}

function setInput(
  fixture: ComponentFixture<ApplicationDetail>,
  selector: string,
  value: string,
): void {
  const input = fixture.nativeElement.querySelector(selector) as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null;

  if (input === null) {
    throw new Error(`Expected input ${selector}.`);
  }

  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<ApplicationDetail>): void {
  const button = fixture.nativeElement.querySelector(
    'button[type="submit"]',
  ) as HTMLButtonElement | null;

  if (button === null) {
    throw new Error('Expected submit button.');
  }

  button.click();
  fixture.detectChanges();
}

describe('ApplicationDetail', () => {
  it('starts with defaults in create mode without loading a resource', async () => {
    const service = new FakeApplicationService();
    await configureDetail(service, null);
    const fixture = createFixture();

    expect(fixture.nativeElement.textContent).toContain('Add application');
    expect(fixture.nativeElement.textContent).toContain('Create application');
    expect(service.requestedIds).toEqual([]);
    expect(
      (fixture.nativeElement.querySelector('#application-status') as HTMLSelectElement)
        .value,
    ).toBe('FOUND');
  });

  it('loads and populates edit mode', async () => {
    const service = new FakeApplicationService();
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    expect(service.requestedIds).toEqual([applicationId]);
    expect(
      (fixture.nativeElement.querySelector('#company-name') as HTMLInputElement)
        .value,
    ).toBe('Analytical Engines Ltd');
    expect(fixture.nativeElement.textContent).toContain('Save application');
    expect(service.jobDescriptionIds).toEqual([applicationId]);
    expect(service.interviewApplicationIds).toEqual([applicationId]);
    expect(service.applicationEventIds).toEqual([applicationId]);
    expect(fixture.nativeElement.textContent).toContain('Documents');
    expect(fixture.nativeElement.textContent).toContain('Analyze');
    expect(fixture.nativeElement.textContent).toContain('Research');
    expect(fixture.nativeElement.textContent).toContain('Timeline');
    expect(fixture.nativeElement.textContent).toContain('Application created');
    const researchService = TestBed.inject(
      ResearchService,
    ) as unknown as FakeResearchService;
    expect(researchService.latestCalls).toEqual([]);
    expect(researchService.historyCalls).toEqual([applicationId]);
  });

  it('scrolls every desktop workspace control without changing the Application route', async () => {
    const service = new FakeApplicationService();
    await configureDetail(service, applicationId);
    const fixture = createFixture();
    const location = TestBed.inject(Location);
    location.go(`/applications/${applicationId}`);
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.workspace-navigation__desktop button',
      ) as NodeListOf<HTMLButtonElement>,
    );

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'Overview',
      'Job Description',
      'Analyze',
      'Research',
      'Interviews',
      'Documents',
      'Timeline',
    ]);
    for (const [index, button] of buttons.entries()) {
      const targetId = fixture.componentInstance.workspaceSections[index]?.id;
      const target = fixture.nativeElement.querySelector(
        `#${targetId}`,
      ) as HTMLElement;
      const scrollIntoView = vi.fn();
      target.scrollIntoView = scrollIntoView;

      expect(button.type).toBe('button');
      button.click();
      fixture.detectChanges();

      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
      expect(location.path()).toBe(`/applications/${applicationId}`);
    }

    expect(
      fixture.nativeElement.querySelector('.workspace-navigation a'),
    ).toBeNull();
    expect(service.updateCalls).toEqual([]);
  });

  it('offers all sections in the mobile selector and scrolls without routing', async () => {
    const service = new FakeApplicationService();
    await configureDetail(service, applicationId);
    const fixture = createFixture();
    const location = TestBed.inject(Location);
    location.go(`/applications/${applicationId}`);
    const selector = fixture.nativeElement.querySelector(
      '#workspace-section-select',
    ) as HTMLSelectElement;
    const research = fixture.nativeElement.querySelector(
      '#research',
    ) as HTMLElement;
    const scrollIntoView = vi.fn();
    research.scrollIntoView = scrollIntoView;

    expect(
      Array.from(selector.options).map((option) => option.textContent),
    ).toEqual([
      'Overview',
      'Job Description',
      'Analyze',
      'Research',
      'Interviews',
      'Documents',
      'Timeline',
    ]);

    selector.value = 'research';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(location.path()).toBe(`/applications/${applicationId}`);
    expect(fixture.componentInstance.selectedWorkspaceSection()).toBe(
      'research',
    );
    expect(service.updateCalls).toEqual([]);
  });

  it('blocks blank fields, invalid URLs, and reversed dates', async () => {
    const service = new FakeApplicationService();
    await configureDetail(service, null);
    const fixture = createFixture();

    setInput(fixture, '#company-name', 'Example Company');
    setInput(fixture, '#role-title', 'Engineer');
    setInput(fixture, '#job-url', 'ftp://example.com/job');
    setInput(fixture, '#date-found', '2026-08-02');
    setInput(fixture, '#date-applied', '2026-08-01');
    submit(fixture);

    expect(service.createCommands).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain(
      'Check the highlighted fields before saving.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Use a complete HTTP or HTTPS URL.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Date applied must be on or after date found.',
    );
  });

  it('creates a complete Application and changes to its resource URL', async () => {
    const service = new FakeApplicationService();
    service.createResult = of({
      ...application,
      companyName: 'New Company',
      roleTitle: 'Platform Engineer',
      location: null,
      jobUrl: null,
      source: 'OTHER',
      status: 'FOUND',
      priority: 'MEDIUM',
      dateFound: null,
      dateApplied: null,
      notesMarkdown: null,
    });
    await configureDetail(service, null);
    const fixture = createFixture();

    setInput(fixture, '#company-name', 'New Company');
    setInput(fixture, '#role-title', 'Platform Engineer');
    submit(fixture);

    expect(service.createCommands).toEqual([
      {
        companyName: 'New Company',
        roleTitle: 'Platform Engineer',
        location: null,
        jobUrl: null,
        source: 'OTHER',
        status: 'FOUND',
        priority: 'MEDIUM',
        dateFound: null,
        dateApplied: null,
        notesMarkdown: null,
      },
    ]);
    expect(fixture.nativeElement.textContent).toContain('Application created.');
    expect(TestBed.inject(Location).path()).toBe(`/applications/${applicationId}`);
    expect(service.applicationEventIds).toEqual([applicationId]);
  });

  it('updates an existing Application successfully', async () => {
    const service = new FakeApplicationService();
    service.updateResult = of({ ...application, companyName: 'Updated Company' });
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    setInput(fixture, '#company-name', 'Updated Company');
    submit(fixture);

    expect(service.updateCalls).toHaveLength(1);
    expect(service.updateCalls[0]).toMatchObject({
      id: applicationId,
      command: { companyName: 'Updated Company' },
    });
    expect(fixture.nativeElement.textContent).toContain('Application saved.');
    expect(service.applicationEventIds).toEqual([applicationId, applicationId]);
  });

  it('shows a safe save error and keeps the form available', async () => {
    const service = new FakeApplicationService();
    service.createResult = throwError(() => new Error('private server detail'));
    await configureDetail(service, null);
    const fixture = createFixture();

    setInput(fixture, '#company-name', 'New Company');
    setInput(fixture, '#role-title', 'Platform Engineer');
    submit(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'We could not save this application.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('private server detail');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });

  it('shows the empty Job Description state and opens creation editing', async () => {
    const service = new FakeApplicationService();
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    expect(fixture.nativeElement.textContent).toContain(
      'No job description added yet.',
    );
    const addButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Add job description'));
    addButton?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#job-description-markdown')).not.toBeNull();
    expect(
      (fixture.nativeElement.querySelector(
        '#job-description-title-input',
      ) as HTMLInputElement).value,
    ).toBe(application.roleTitle);
    expect(
      (fixture.nativeElement.querySelector(
        '#job-description-company',
      ) as HTMLInputElement).value,
    ).toBe(application.companyName);
    expect(
      (fixture.nativeElement.querySelector(
        '#job-description-source-url',
      ) as HTMLInputElement).value,
    ).toBe(application.jobUrl);
  });

  it('preserves edits to prefilled Job Description fields when Overview changes', async () => {
    const service = new FakeApplicationService();
    service.updateResult = of({
      ...application,
      companyName: 'Updated Overview Company',
    });
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    const addButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Add job description'));
    addButton?.click();
    fixture.detectChanges();
    setInput(fixture, '#job-description-title-input', 'Custom JD title');
    setInput(fixture, '#company-name', 'Updated Overview Company');
    submit(fixture);

    expect(
      (fixture.nativeElement.querySelector(
        '#job-description-title-input',
      ) as HTMLInputElement).value,
    ).toBe('Custom JD title');
    expect(
      (fixture.nativeElement.querySelector(
        '#job-description-company',
      ) as HTMLInputElement).value,
    ).toBe(application.companyName);
  });

  it('leaves a new Job Description source URL empty when the Application has no job URL', async () => {
    const service = new FakeApplicationService();
    service.getResult = of({ ...application, jobUrl: null });
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    const addButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Add job description'));
    addButton?.click();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector(
        '#job-description-source-url',
      ) as HTMLInputElement).value,
    ).toBe('');
  });

  it('renders a populated Job Description and fills the editor', async () => {
    const service = new FakeApplicationService();
    service.jobDescriptionResult = of({
      ...jobDescription,
      title: 'Persisted JD title',
      companyName: 'Persisted JD company',
      sourceUrl: 'https://persisted.example/job',
    });
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    expect(fixture.nativeElement.textContent).toContain('Build reliable systems.');
    const editButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Edit job description'));
    editButton?.click();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector('#job-description-title-input') as HTMLInputElement)
        .value,
    ).toBe('Persisted JD title');
    expect(
      (fixture.nativeElement.querySelector(
        '#job-description-company',
      ) as HTMLInputElement).value,
    ).toBe('Persisted JD company');
    expect(
      (fixture.nativeElement.querySelector(
        '#job-description-source-url',
      ) as HTMLInputElement).value,
    ).toBe('https://persisted.example/job');
    expect(
      (fixture.nativeElement.querySelector('#job-description-markdown') as HTMLTextAreaElement)
        .value,
    ).toContain('Build reliable systems.');
  });

  it('shows saving feedback and persists a full Job Description replacement', async () => {
    const service = new FakeApplicationService();
    service.jobDescriptionResult = of(jobDescription);
    const saveResult = new Subject<JobDescription>();
    service.jobDescriptionUpdateResult = saveResult;
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    const editButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Edit job description'));
    editButton?.click();
    fixture.detectChanges();
    setInput(fixture, '#job-description-title-input', 'Principal Engineer');
    (fixture.nativeElement.querySelector('#save-job-description') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Saving…');
    expect(service.jobDescriptionUpdateCalls).toEqual([
      {
        id: applicationId,
        command: {
          title: 'Principal Engineer',
          companyName: jobDescription.companyName,
          descriptionMarkdown: jobDescription.descriptionMarkdown,
          requirementsMarkdown: jobDescription.requirementsMarkdown,
          responsibilitiesMarkdown: jobDescription.responsibilitiesMarkdown,
          sourceUrl: jobDescription.sourceUrl,
        },
      },
    ]);

    saveResult.next({ ...jobDescription, title: 'Principal Engineer' });
    saveResult.complete();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Job description saved.');
    expect(fixture.nativeElement.textContent).toContain('Principal Engineer');
    expect(service.applicationEventIds).toEqual([applicationId, applicationId]);
  });

  it('shows a safe Job Description save error and keeps editing available', async () => {
    const service = new FakeApplicationService();
    service.jobDescriptionUpdateResult = throwError(
      () => new Error('private backend detail'),
    );
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    const addButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Add job description'));
    addButton?.click();
    fixture.detectChanges();
    setInput(fixture, '#job-description-markdown', '# Role');
    (fixture.nativeElement.querySelector('#save-job-description') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Could not save job description.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('private backend detail');
    expect(fixture.nativeElement.querySelector('#job-description-markdown')).not.toBeNull();
  });

  it('shows an empty Interview state and opens the create form', async () => {
    const service = new FakeApplicationService();
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    expect(fixture.nativeElement.textContent).toContain('No interviews yet.');
    const addButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Add interview'));
    addButton?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#interview-type')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#save-interview')?.textContent).toContain(
      'Create interview',
    );
  });

  it('renders the Interview list and opens an existing Interview for editing', async () => {
    const service = new FakeApplicationService();
    service.interviewsResult = of([interview]);
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    expect(fixture.nativeElement.textContent).toContain('TECHNICAL');
    expect(fixture.nativeElement.textContent).toContain('SCHEDULED');
    const editButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Edit interview'));
    editButton?.click();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector('#interview-type') as HTMLSelectElement)
        .value,
    ).toBe('TECHNICAL');
    expect(fixture.nativeElement.querySelector('#save-interview')?.textContent).toContain(
      'Save interview',
    );
  });

  it('creates an Interview and keeps a complete request boundary', async () => {
    const service = new FakeApplicationService();
    service.interviewCreateResult = of({
      ...interview,
      type: 'RECRUITER',
      scheduledAt: null,
      notesMarkdown: null,
      sortOrder: 0,
    });
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    const addButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Add interview'));
    addButton?.click();
    fixture.detectChanges();
    const type = fixture.nativeElement.querySelector(
      '#interview-type',
    ) as HTMLSelectElement;
    type.value = 'RECRUITER';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('#save-interview') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.interviewCreateCalls).toEqual([
      {
        applicationId,
        command: {
          type: 'RECRUITER',
          status: 'SCHEDULED',
          scheduledAt: null,
          completedAt: null,
          notesMarkdown: null,
          feedbackMarkdown: null,
          sortOrder: 0,
        },
      },
    ]);
    expect(fixture.nativeElement.textContent).toContain('Interview created.');
    expect(fixture.nativeElement.textContent).toContain('RECRUITER');
    expect(service.applicationEventIds).toEqual([applicationId, applicationId]);
  });

  it('updates an Interview with full replacement semantics', async () => {
    const service = new FakeApplicationService();
    service.interviewsResult = of([interview]);
    service.interviewUpdateResult = of({
      ...interview,
      status: 'COMPLETED',
      feedbackMarkdown: '# Strong result',
    });
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    const editButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Edit interview'));
    editButton?.click();
    fixture.detectChanges();
    const status = fixture.nativeElement.querySelector(
      '#interview-status',
    ) as HTMLSelectElement;
    status.value = 'COMPLETED';
    status.dispatchEvent(new Event('change'));
    setInput(fixture, '#interview-feedback', '# Strong result');
    (fixture.nativeElement.querySelector('#save-interview') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.interviewUpdateCalls).toHaveLength(1);
    expect(service.interviewUpdateCalls[0]).toMatchObject({
      applicationId,
      interviewId: interview.id,
      command: {
        type: 'TECHNICAL',
        status: 'COMPLETED',
        feedbackMarkdown: '# Strong result',
        sortOrder: 1,
      },
    });
    expect(fixture.nativeElement.textContent).toContain('Interview saved.');
  });

  it('shows a safe Interview save error and keeps the editor open', async () => {
    const service = new FakeApplicationService();
    service.interviewCreateResult = throwError(
      () => new Error('private interview detail'),
    );
    await configureDetail(service, applicationId);
    const fixture = createFixture();

    const addButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Add interview'));
    addButton?.click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('#save-interview') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Could not save interview.');
    expect(fixture.nativeElement.textContent).not.toContain(
      'private interview detail',
    );
    expect(fixture.nativeElement.querySelector('#interview-type')).not.toBeNull();
  });
});
