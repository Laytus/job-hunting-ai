import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  Application,
  ApplicationCreateRequest,
  ApplicationEvent,
  ApplicationEventListResponse,
  ApplicationListResponse,
  ApplicationResponse,
  JobDescription,
  JobDescriptionUpdateRequest,
  Interview,
  InterviewListResponse,
  InterviewResponse,
  InterviewWriteRequest,
  PersistedJobDescriptionResponse,
} from './application.models';
import { ApplicationService } from './application.service';

const application: Application = {
  id: '10000000-0000-4000-8000-000000000000',
  companyName: 'Analytical Engines Ltd',
  roleTitle: 'Software Engineer',
  location: null,
  jobUrl: 'https://example.com/job',
  source: 'CAREER_PAGE',
  status: 'FOUND',
  priority: 'HIGH',
  dateFound: '2026-08-01',
  dateApplied: null,
  notesMarkdown: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
};

const command: ApplicationCreateRequest = {
  companyName: application.companyName,
  roleTitle: application.roleTitle,
  location: application.location,
  jobUrl: application.jobUrl,
  source: application.source,
  status: application.status,
  priority: application.priority,
  dateFound: application.dateFound,
  dateApplied: application.dateApplied,
  notesMarkdown: application.notesMarkdown,
};

const jobDescription: JobDescription = {
  id: '20000000-0000-4000-8000-000000000000',
  applicationId: application.id,
  title: 'Software Engineer',
  companyName: 'Analytical Engines Ltd',
  descriptionMarkdown: '# Software Engineer',
  requirementsMarkdown: '- TypeScript',
  responsibilitiesMarkdown: null,
  sourceUrl: 'https://example.com/job',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
};

const jobDescriptionCommand: JobDescriptionUpdateRequest = {
  title: jobDescription.title,
  companyName: jobDescription.companyName,
  descriptionMarkdown: jobDescription.descriptionMarkdown,
  requirementsMarkdown: jobDescription.requirementsMarkdown,
  responsibilitiesMarkdown: jobDescription.responsibilitiesMarkdown,
  sourceUrl: jobDescription.sourceUrl,
};

const interview: Interview = {
  id: '30000000-0000-4000-8000-000000000000',
  applicationId: application.id,
  type: 'TECHNICAL',
  status: 'SCHEDULED',
  scheduledAt: '2026-09-01T14:00:00.000Z',
  completedAt: null,
  notesMarkdown: '# Preparation',
  feedbackMarkdown: null,
  sortOrder: 1,
};

const interviewCommand: InterviewWriteRequest = {
  type: interview.type,
  status: interview.status,
  scheduledAt: interview.scheduledAt,
  completedAt: interview.completedAt,
  notesMarkdown: interview.notesMarkdown,
  feedbackMarkdown: interview.feedbackMarkdown,
  sortOrder: interview.sortOrder,
};

const applicationEvent: ApplicationEvent = {
  id: '40000000-0000-4000-8000-000000000000',
  type: 'APPLICATION_STATUS_CHANGED',
  title: 'Application status changed',
  description: 'Application status changed from FOUND to APPLIED.',
  metadata: { previousStatus: 'FOUND', newStatus: 'APPLIED' },
  occurredAt: '2026-08-02T10:00:00.000Z',
  createdAt: '2026-08-02T10:00:01.000Z',
};

describe('ApplicationService', () => {
  let service: ApplicationService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApplicationService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('loads the Application list with GET', async () => {
    const result = firstValueFrom(service.getApplications());
    const request = httpController.expectOne('/api/v1/applications');

    expect(request.request.method).toBe('GET');
    request.flush({ applications: [application] } satisfies ApplicationListResponse);
    await expect(result).resolves.toEqual([application]);
  });

  it('loads one Application with GET', async () => {
    const result = firstValueFrom(service.getApplication(application.id));
    const request = httpController.expectOne(
      `/api/v1/applications/${application.id}`,
    );

    expect(request.request.method).toBe('GET');
    request.flush({ application } satisfies ApplicationResponse);
    await expect(result).resolves.toEqual(application);
  });

  it('creates an Application with POST', async () => {
    const result = firstValueFrom(service.createApplication(command));
    const request = httpController.expectOne('/api/v1/applications');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(command);
    request.flush({ application } satisfies ApplicationResponse);
    await expect(result).resolves.toEqual(application);
  });

  it('updates an Application with PUT', async () => {
    const result = firstValueFrom(service.updateApplication(application.id, command));
    const request = httpController.expectOne(
      `/api/v1/applications/${application.id}`,
    );

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(command);
    request.flush({ application } satisfies ApplicationResponse);
    await expect(result).resolves.toEqual(application);
  });

  it('loads an optional Job Description with GET', async () => {
    const result = firstValueFrom(service.getJobDescription(application.id));
    const request = httpController.expectOne(
      `/api/v1/applications/${application.id}/job-description`,
    );

    expect(request.request.method).toBe('GET');
    request.flush({ jobDescription: null });
    await expect(result).resolves.toBeNull();
  });

  it('replaces a Job Description with PUT', async () => {
    const result = firstValueFrom(
      service.updateJobDescription(application.id, jobDescriptionCommand),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${application.id}/job-description`,
    );

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(jobDescriptionCommand);
    request.flush({
      jobDescription,
    } satisfies PersistedJobDescriptionResponse);
    await expect(result).resolves.toEqual(jobDescription);
  });

  it('loads Interviews with GET', async () => {
    const result = firstValueFrom(service.getInterviews(application.id));
    const request = httpController.expectOne(
      `/api/v1/applications/${application.id}/interviews`,
    );

    expect(request.request.method).toBe('GET');
    request.flush({ interviews: [interview] } satisfies InterviewListResponse);
    await expect(result).resolves.toEqual([interview]);
  });

  it('creates an Interview with POST', async () => {
    const result = firstValueFrom(
      service.createInterview(application.id, interviewCommand),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${application.id}/interviews`,
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(interviewCommand);
    request.flush({ interview } satisfies InterviewResponse);
    await expect(result).resolves.toEqual(interview);
  });

  it('updates an Interview with nested PUT', async () => {
    const result = firstValueFrom(
      service.updateInterview(application.id, interview.id, interviewCommand),
    );
    const request = httpController.expectOne(
      `/api/v1/applications/${application.id}/interviews/${interview.id}`,
    );

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(interviewCommand);
    request.flush({ interview } satisfies InterviewResponse);
    await expect(result).resolves.toEqual(interview);
  });

  it('loads Application Events with GET', async () => {
    const result = firstValueFrom(service.getApplicationEvents(application.id));
    const request = httpController.expectOne(
      `/api/v1/applications/${application.id}/events`,
    );

    expect(request.request.method).toBe('GET');
    request.flush({ events: [applicationEvent] } satisfies ApplicationEventListResponse);
    await expect(result).resolves.toEqual([applicationEvent]);
  });

  it('propagates HTTP errors to the component boundary', async () => {
    const result = firstValueFrom(service.getApplications());
    const request = httpController.expectOne('/api/v1/applications');

    request.flush(
      { error: { code: 'INTERNAL_ERROR', message: 'Safe server message.' } },
      { status: 500, statusText: 'Internal Server Error' },
    );
    await expect(result).rejects.toMatchObject({ status: 500 });
  });
});
