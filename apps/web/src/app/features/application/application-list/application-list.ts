import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Application } from '../application.models';
import { ApplicationService } from '../application.service';

@Component({
  selector: 'app-application-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './application-list.html',
  styleUrl: './application-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplicationList implements OnInit {
  private readonly applicationService = inject(ApplicationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly applications = signal<Application[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadApplications();
  }

  loadApplications(): void {
    this.loading.set(true);
    this.error.set(null);

    this.applicationService
      .getApplications()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (applications) => {
          this.applications.set(applications);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('We could not load your applications. Please try again.');
        },
      });
  }
}
