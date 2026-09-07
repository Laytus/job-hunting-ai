import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, Subject, throwError } from 'rxjs';
import { Application } from '../application.models';
import { ApplicationService } from '../application.service';
import { ApplicationList } from './application-list';

const applications: Application[] = [
  {
    id: '10000000-0000-4000-8000-000000000000',
    companyName: 'Critical Company',
    roleTitle: 'Principal Engineer',
    location: 'Remote',
    jobUrl: null,
    source: 'REFERRAL',
    status: 'INTERVIEW',
    priority: 'CRITICAL',
    dateFound: '2026-08-01',
    dateApplied: '2026-08-02',
    notesMarkdown: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
  },
  {
    id: '20000000-0000-4000-8000-000000000000',
    companyName: 'Second Company',
    roleTitle: 'Software Engineer',
    location: null,
    jobUrl: null,
    source: 'LINKEDIN',
    status: 'FOUND',
    priority: 'MEDIUM',
    dateFound: null,
    dateApplied: null,
    notesMarkdown: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-02T10:00:00.000Z',
  },
];

class FakeApplicationService {
  result: Observable<Application[]> = of([]);

  getApplications(): Observable<Application[]> {
    return this.result;
  }
}

function createFixture(): ComponentFixture<ApplicationList> {
  const fixture = TestBed.createComponent(ApplicationList);
  fixture.detectChanges();
  return fixture;
}

describe('ApplicationList', () => {
  let service: FakeApplicationService;

  beforeEach(async () => {
    service = new FakeApplicationService();
    await TestBed.configureTestingModule({
      imports: [ApplicationList],
      providers: [
        provideRouter([]),
        { provide: ApplicationService, useValue: service },
      ],
    }).compileComponents();
  });

  it('shows a loading state while the request is pending', () => {
    service.result = new Subject<Application[]>();
    const fixture = createFixture();

    expect(fixture.nativeElement.textContent).toContain('Loading applications');
  });

  it('renders populated data in backend order', () => {
    service.result = of(applications);
    const fixture = createFixture();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Critical Company');
    expect(text).toContain('Principal Engineer');
    expect(text).toContain('CRITICAL');
    expect(text.indexOf('Critical Company')).toBeLessThan(
      text.indexOf('Second Company'),
    );
  });

  it('shows the empty state', () => {
    const fixture = createFixture();

    expect(fixture.nativeElement.textContent).toContain('No applications yet');
    expect(fixture.nativeElement.textContent).toContain('Create first application');
  });

  it('shows a safe error state', () => {
    service.result = throwError(() => new Error('private server detail'));
    const fixture = createFixture();

    expect(fixture.nativeElement.textContent).toContain(
      'We could not load your applications.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('private server detail');
  });

  it('provides navigation to creation and detail routes', () => {
    service.result = of(applications);
    const fixture = createFixture();
    const createLink = fixture.nativeElement.querySelector(
      'a[href="/applications/new"]',
    ) as HTMLAnchorElement | null;
    const detailLink = fixture.nativeElement.querySelector(
      `a[href="/applications/${applications[0]!.id}"]`,
    ) as HTMLAnchorElement | null;

    expect(createLink).not.toBeNull();
    expect(detailLink).not.toBeNull();
  });
});
