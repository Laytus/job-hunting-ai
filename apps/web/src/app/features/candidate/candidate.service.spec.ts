import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import {
  CandidateProfile,
  CandidateReplacement,
  CandidateResponse,
} from './candidate.models';
import { CandidateService } from './candidate.service';

const candidate: CandidateProfile = {
  id: '4eac3db6-3eb1-4a31-9c14-68b1a6a51adc',
  fullName: 'Ada Lovelace',
  headline: 'Software Engineer',
  summaryMarkdown: null,
  linkedinUrl: null,
  githubUrl: null,
  portfolioUrl: null,
  location: 'Santiago',
  targetRoles: ['Staff Engineer'],
  targetLocations: ['Remote'],
  careerGoalsMarkdown: null,
  cvMarkdown: null,
  additionalContext: null,
  experiences: [],
  education: [],
  projects: [],
  skills: [],
  languages: [],
  candidateContextUpdatedAt: '2026-08-21T10:00:00.000Z',
  createdAt: '2026-08-21T10:00:00.000Z',
  updatedAt: '2026-08-21T10:00:00.000Z',
};

const replacement: CandidateReplacement = {
  fullName: candidate.fullName,
  headline: candidate.headline,
  summaryMarkdown: candidate.summaryMarkdown,
  linkedinUrl: candidate.linkedinUrl,
  githubUrl: candidate.githubUrl,
  portfolioUrl: candidate.portfolioUrl,
  location: candidate.location,
  targetRoles: candidate.targetRoles,
  targetLocations: candidate.targetLocations,
  careerGoalsMarkdown: candidate.careerGoalsMarkdown,
  cvMarkdown: candidate.cvMarkdown,
  additionalContext: candidate.additionalContext,
  experiences: [],
  education: [],
  projects: [],
  skills: [],
  languages: [],
};

describe('CandidateService', () => {
  let service: CandidateService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(CandidateService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('loads the Candidate aggregate with GET', async () => {
    const result = firstValueFrom(service.getCandidate());
    const request = httpController.expectOne('/api/v1/candidate');

    expect(request.request.method).toBe('GET');
    request.flush({ candidate } satisfies CandidateResponse);
    await expect(result).resolves.toEqual(candidate);
  });

  it('sends the complete replacement with PUT', async () => {
    const result = firstValueFrom(service.replaceCandidate(replacement));
    const request = httpController.expectOne('/api/v1/candidate');

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(replacement);
    request.flush({ candidate } satisfies CandidateResponse);
    await expect(result).resolves.toEqual(candidate);
  });
});
