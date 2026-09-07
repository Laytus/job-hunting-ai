import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import type { ApplicationEvent } from '../application.models';
import { ApplicationService } from '../application.service';
import { ApplicationTimeline } from './application-timeline';

const applicationId = '10000000-0000-4000-8000-000000000000';
const event: ApplicationEvent = {
  id: '20000000-0000-4000-8000-000000000000',
  type: 'APPLICATION_STATUS_CHANGED',
  title: 'Application status changed',
  description: 'Application status changed from FOUND to APPLIED.',
  metadata: { internal: 'must not be rendered' },
  occurredAt: '2026-08-22T12:00:00.000Z',
  createdAt: '2026-08-22T12:00:01.000Z',
};

class FakeApplicationService {
  result: Observable<ApplicationEvent[]> = of([]);
  readonly calls: string[] = [];

  getApplicationEvents(id: string): Observable<ApplicationEvent[]> {
    this.calls.push(id);
    return this.result;
  }
}

async function createTimeline(
  service: FakeApplicationService,
): Promise<ComponentFixture<ApplicationTimeline>> {
  await TestBed.configureTestingModule({
    imports: [ApplicationTimeline],
    providers: [{ provide: ApplicationService, useValue: service }],
  }).compileComponents();
  const fixture = TestBed.createComponent(ApplicationTimeline);
  fixture.componentRef.setInput('applicationId', applicationId);
  fixture.detectChanges();
  return fixture;
}

describe('ApplicationTimeline', () => {
  it('shows a loading state while activity is requested', async () => {
    const service = new FakeApplicationService();
    service.result = new Subject<ApplicationEvent[]>();
    const fixture = await createTimeline(service);

    expect(fixture.nativeElement.textContent).toContain(
      'Loading application activity…',
    );
    expect(service.calls).toEqual([applicationId]);
  });

  it('shows the empty state when no activity exists', async () => {
    const fixture = await createTimeline(new FakeApplicationService());

    expect(fixture.nativeElement.textContent).toContain(
      'No application activity yet.',
    );
  });

  it('renders readable domain activity without exposing metadata', async () => {
    const service = new FakeApplicationService();
    service.result = of([event]);
    const fixture = await createTimeline(service);
    const time = fixture.nativeElement.querySelector('time') as HTMLTimeElement;

    expect(fixture.nativeElement.textContent).toContain(event.title);
    expect(fixture.nativeElement.textContent).toContain(event.description);
    expect(time.dateTime).toBe(event.occurredAt);
    expect(time.textContent?.trim()).not.toBe(event.occurredAt);
    expect(fixture.nativeElement.textContent).not.toContain('must not be rendered');
  });

  it('shows a safe error and retries the request', async () => {
    const service = new FakeApplicationService();
    service.result = throwError(() => new Error('private backend detail'));
    const fixture = await createTimeline(service);

    expect(fixture.nativeElement.textContent).toContain(
      'Could not load application activity.',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'private backend detail',
    );

    service.result = of([event]);
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.calls).toEqual([applicationId, applicationId]);
    expect(fixture.nativeElement.textContent).toContain(event.title);
  });
});
