import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  Application,
  ApplicationCreateRequest,
  ApplicationEvent,
  ApplicationEventListResponse,
  ApplicationListResponse,
  ApplicationResponse,
  ApplicationUpdateRequest,
  JobDescription,
  JobDescriptionResponse,
  JobDescriptionUpdateRequest,
  Interview,
  InterviewListResponse,
  InterviewResponse,
  InterviewWriteRequest,
  PersistedJobDescriptionResponse,
} from './application.models';

const applicationsUrl = '/api/v1/applications';

function mapJobDescription(jobDescription: JobDescription): JobDescription {
  return {
    id: jobDescription.id,
    applicationId: jobDescription.applicationId,
    title: jobDescription.title,
    companyName: jobDescription.companyName,
    descriptionMarkdown: jobDescription.descriptionMarkdown,
    requirementsMarkdown: jobDescription.requirementsMarkdown,
    responsibilitiesMarkdown: jobDescription.responsibilitiesMarkdown,
    sourceUrl: jobDescription.sourceUrl,
    createdAt: jobDescription.createdAt,
    updatedAt: jobDescription.updatedAt,
  };
}

function mapInterview(interview: Interview): Interview {
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    type: interview.type,
    status: interview.status,
    scheduledAt: interview.scheduledAt,
    completedAt: interview.completedAt,
    notesMarkdown: interview.notesMarkdown,
    feedbackMarkdown: interview.feedbackMarkdown,
    sortOrder: interview.sortOrder,
  };
}

function mapApplicationEvent(event: ApplicationEvent): ApplicationEvent {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    description: event.description,
    metadata: event.metadata,
    occurredAt: event.occurredAt,
    createdAt: event.createdAt,
  };
}

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  private readonly httpClient = inject(HttpClient);

  getApplications(): Observable<Application[]> {
    return this.httpClient
      .get<ApplicationListResponse>(applicationsUrl)
      .pipe(map((response) => response.applications));
  }

  getApplication(id: string): Observable<Application> {
    return this.httpClient
      .get<ApplicationResponse>(`${applicationsUrl}/${id}`)
      .pipe(map((response) => response.application));
  }

  createApplication(command: ApplicationCreateRequest): Observable<Application> {
    return this.httpClient
      .post<ApplicationResponse>(applicationsUrl, command)
      .pipe(map((response) => response.application));
  }

  updateApplication(
    id: string,
    command: ApplicationUpdateRequest,
  ): Observable<Application> {
    return this.httpClient
      .put<ApplicationResponse>(`${applicationsUrl}/${id}`, command)
      .pipe(map((response) => response.application));
  }

  getJobDescription(applicationId: string): Observable<JobDescription | null> {
    return this.httpClient
      .get<JobDescriptionResponse>(
        `${applicationsUrl}/${applicationId}/job-description`,
      )
      .pipe(
        map((response) =>
          response.jobDescription === null
            ? null
            : mapJobDescription(response.jobDescription),
        ),
      );
  }

  updateJobDescription(
    applicationId: string,
    command: JobDescriptionUpdateRequest,
  ): Observable<JobDescription> {
    return this.httpClient
      .put<PersistedJobDescriptionResponse>(
        `${applicationsUrl}/${applicationId}/job-description`,
        command,
      )
      .pipe(map((response) => mapJobDescription(response.jobDescription)));
  }

  getInterviews(applicationId: string): Observable<Interview[]> {
    return this.httpClient
      .get<InterviewListResponse>(
        `${applicationsUrl}/${applicationId}/interviews`,
      )
      .pipe(map((response) => response.interviews.map(mapInterview)));
  }

  createInterview(
    applicationId: string,
    command: InterviewWriteRequest,
  ): Observable<Interview> {
    return this.httpClient
      .post<InterviewResponse>(
        `${applicationsUrl}/${applicationId}/interviews`,
        command,
      )
      .pipe(map((response) => mapInterview(response.interview)));
  }

  updateInterview(
    applicationId: string,
    interviewId: string,
    command: InterviewWriteRequest,
  ): Observable<Interview> {
    return this.httpClient
      .put<InterviewResponse>(
        `${applicationsUrl}/${applicationId}/interviews/${interviewId}`,
        command,
      )
      .pipe(map((response) => mapInterview(response.interview)));
  }

  getApplicationEvents(applicationId: string): Observable<ApplicationEvent[]> {
    return this.httpClient
      .get<ApplicationEventListResponse>(
        `${applicationsUrl}/${applicationId}/events`,
      )
      .pipe(map((response) => response.events.map(mapApplicationEvent)));
  }
}
