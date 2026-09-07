import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import {
  CandidateProfile,
  CandidateReplacement,
} from '../candidate.models';
import { CandidateService } from '../candidate.service';
import { CandidatePage } from './candidate-page';

const candidate: CandidateProfile = {
  id: '4eac3db6-3eb1-4a31-9c14-68b1a6a51adc',
  fullName: 'Ada Lovelace',
  headline: 'Staff Software Engineer',
  summaryMarkdown: 'Builds dependable systems.',
  linkedinUrl: 'https://www.linkedin.com/in/ada-lovelace',
  githubUrl: null,
  portfolioUrl: null,
  location: 'Santiago, Chile',
  targetRoles: ['Staff Software Engineer'],
  targetLocations: ['Remote'],
  careerGoalsMarkdown: null,
  cvMarkdown: null,
  additionalContext: null,
  experiences: [
    {
      id: '6d4d8177-1f53-47bc-a262-afc22dab88ca',
      organization: 'Analytical Engines',
      role: 'Engineer',
      location: 'Remote',
      startDate: '2022-01-01',
      endDate: null,
      descriptionMarkdown: null,
      sortOrder: 0,
      createdAt: '2026-08-21T10:00:00.000Z',
      updatedAt: '2026-08-21T10:00:00.000Z',
    },
  ],
  education: [],
  projects: [],
  skills: [],
  languages: [],
  candidateContextUpdatedAt: '2026-08-21T10:00:00.000Z',
  createdAt: '2026-08-21T10:00:00.000Z',
  updatedAt: '2026-08-21T10:00:00.000Z',
};

class FakeCandidateService {
  loadResult: Observable<CandidateProfile | null> = of(null);
  saveResult: Observable<CandidateProfile> = of(candidate);
  lastReplacement: CandidateReplacement | null = null;

  getCandidate(): Observable<CandidateProfile | null> {
    return this.loadResult;
  }

  replaceCandidate(replacement: CandidateReplacement): Observable<CandidateProfile> {
    this.lastReplacement = replacement;
    return this.saveResult;
  }
}

function setInput(
  fixture: ComponentFixture<CandidatePage>,
  selector: string,
  value: string,
): void {
  const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement | null;

  if (input === null) {
    throw new Error(`Expected input ${selector}.`);
  }

  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function click(
  fixture: ComponentFixture<CandidatePage>,
  selector: string,
): void {
  const button = fixture.nativeElement.querySelector(selector) as HTMLButtonElement | null;

  if (button === null) {
    throw new Error(`Expected button ${selector}.`);
  }

  button.click();
  fixture.detectChanges();
}

describe('CandidatePage', () => {
  let fakeService: FakeCandidateService;

  beforeEach(async () => {
    fakeService = new FakeCandidateService();

    await TestBed.configureTestingModule({
      imports: [CandidatePage],
      providers: [{ provide: CandidateService, useValue: fakeService }],
    }).compileComponents();
  });

  it('shows a loading state while the profile request is pending', () => {
    fakeService.loadResult = new Subject<CandidateProfile | null>();
    const fixture = TestBed.createComponent(CandidatePage);

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Loading candidate profile');
  });

  it('shows the empty state when no Candidate exists', () => {
    const fixture = TestBed.createComponent(CandidatePage);

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No candidate profile yet');
    expect(fixture.nativeElement.textContent).toContain('Create candidate profile');
  });

  it('shows the populated Candidate profile', () => {
    fakeService.loadResult = of(candidate);
    const fixture = TestBed.createComponent(CandidatePage);

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Ada Lovelace');
    expect(fixture.nativeElement.textContent).toContain('Analytical Engines');
    expect(fixture.nativeElement.textContent).toContain('Edit profile');
  });

  it('saves a complete Candidate replacement and shows the result', () => {
    const savedCandidate = { ...candidate, fullName: 'Grace Hopper' };
    fakeService.saveResult = of(savedCandidate);
    const fixture = TestBed.createComponent(CandidatePage);
    fixture.detectChanges();

    click(fixture, '.state-card--empty .button--primary');
    setInput(fixture, '#full-name', 'Grace Hopper');
    click(fixture, 'button[type="submit"]');

    expect(fakeService.lastReplacement).toMatchObject({
      fullName: 'Grace Hopper',
      experiences: [],
      education: [],
      projects: [],
      skills: [],
      languages: [],
    });
    expect(fixture.nativeElement.textContent).toContain('Candidate profile saved.');
    expect(fixture.nativeElement.textContent).toContain('Grace Hopper');
  });

  it('shows a safe error and keeps the form available when saving fails', () => {
    fakeService.saveResult = throwError(() => new Error('private server detail'));
    const fixture = TestBed.createComponent(CandidatePage);
    fixture.detectChanges();

    click(fixture, '.state-card--empty .button--primary');
    setInput(fixture, '#full-name', 'Grace Hopper');
    click(fixture, 'button[type="submit"]');

    expect(fixture.nativeElement.textContent).toContain(
      'We could not save your candidate profile.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('private server detail');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });
});
