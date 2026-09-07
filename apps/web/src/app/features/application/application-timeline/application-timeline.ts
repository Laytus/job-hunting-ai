import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { ApplicationEvent } from '../application.models';
import { ApplicationService } from '../application.service';

@Component({
  selector: 'app-application-timeline',
  imports: [DatePipe],
  templateUrl: './application-timeline.html',
  styleUrl: './application-timeline.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplicationTimeline {
  private readonly applicationService = inject(ApplicationService);
  private readonly retryToken = signal(0);

  readonly applicationId = input.required<string>();
  readonly refreshToken = input(0);
  readonly events = signal<ApplicationEvent[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const applicationId = this.applicationId();
      this.refreshToken();
      this.retryToken();
      this.loading.set(true);
      this.error.set(null);

      const subscription = this.applicationService
        .getApplicationEvents(applicationId)
        .subscribe({
          next: (events) => {
            this.events.set(events);
            this.loading.set(false);
          },
          error: () => {
            this.events.set([]);
            this.loading.set(false);
            this.error.set('Could not load application activity.');
          },
        });

      onCleanup(() => subscription.unsubscribe());
    });
  }

  retry(): void {
    this.retryToken.update((value) => value + 1);
  }
}
