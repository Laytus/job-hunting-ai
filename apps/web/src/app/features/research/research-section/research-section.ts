import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import type {
  ResearchDetail,
  ResearchHistoryItem,
  ResearchStatus,
} from '../research.models';
import { ResearchResult } from '../research-result/research-result';
import { ResearchService } from '../research.service';

@Component({
  selector: 'app-research-section',
  imports: [DatePipe, ResearchResult],
  templateUrl: './research-section.html',
  styleUrl: './research-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResearchSection {
  private readonly researchService = inject(ResearchService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly retryToken = signal(0);
  private historyRequestGeneration = 0;
  private readonly researchSection =
    viewChild.required<ElementRef<HTMLElement>>('researchSection');

  readonly applicationId = input.required<string>();
  readonly latestCompleted = signal<ResearchDetail | null>(null);
  readonly displayedResearch = signal<ResearchDetail | null>(null);
  readonly history = signal<readonly ResearchHistoryItem[]>([]);
  readonly initialLoading = signal(true);
  readonly runInProgress = signal(false);
  readonly historyLoading = signal(true);
  readonly historyDetailLoading = signal(false);
  readonly selectedHistoricalResearchId = signal<string | null>(null);
  readonly initialLoadError = signal<string | null>(null);
  readonly runError = signal<string | null>(null);
  readonly historyError = signal<string | null>(null);
  readonly historyDetailError = signal<string | null>(null);

  readonly viewingHistorical = computed(
    () => this.selectedHistoricalResearchId() !== null,
  );
  readonly runButtonLabel = computed(() => {
    if (this.runInProgress()) return 'Researching application…';
    return this.latestCompleted() === null
      ? 'Run Research'
      : 'Rerun Research';
  });

  constructor() {
    effect((onCleanup) => {
      const applicationId = this.applicationId();
      this.retryToken();
      this.resetForInitialLoad();

      const subscriptions = new Subscription();
      subscriptions.add(this.loadInitial(applicationId));
      onCleanup(() => subscriptions.unsubscribe());
    });
  }

  retryInitialLoad(): void {
    this.retryToken.update((value) => value + 1);
  }

  runResearch(): void {
    if (this.runInProgress()) return;

    this.runInProgress.set(true);
    this.runError.set(null);

    this.researchService
      .runResearch(this.applicationId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (research) => {
          this.historyRequestGeneration += 1;
          this.latestCompleted.set(research);
          this.displayedResearch.set(research);
          this.selectedHistoricalResearchId.set(null);
          this.historyDetailLoading.set(false);
          this.historyDetailError.set(null);
          this.runInProgress.set(false);
          this.runError.set(null);
          this.loadHistory(this.applicationId(), false);
        },
        error: (error: unknown) => {
          this.runInProgress.set(false);
          this.runError.set(this.runErrorMessage(error));
        },
      });
  }

  selectResearch(researchId: string): void {
    if (researchId === this.latestCompleted()?.id) {
      this.returnToLatest();
      return;
    }
    if (researchId === this.selectedHistoricalResearchId()) return;

    const requestGeneration = ++this.historyRequestGeneration;
    this.historyDetailLoading.set(true);
    this.historyDetailError.set(null);

    this.researchService
      .getResearchDetail(this.applicationId(), researchId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (research) => {
          if (requestGeneration !== this.historyRequestGeneration) return;
          this.selectedHistoricalResearchId.set(researchId);
          this.displayedResearch.set(research);
          this.historyDetailLoading.set(false);
          this.scrollToResearchAfterRender();
        },
        error: () => {
          if (requestGeneration !== this.historyRequestGeneration) return;
          this.historyDetailLoading.set(false);
          this.historyDetailError.set('Could not load this Research result.');
        },
      });
  }

  returnToLatest(): void {
    this.historyRequestGeneration += 1;
    this.selectedHistoricalResearchId.set(null);
    this.displayedResearch.set(this.latestCompleted());
    this.historyDetailLoading.set(false);
    this.historyDetailError.set(null);
    this.scrollToResearchAfterRender();
  }

  statusLabel(status: ResearchStatus): string {
    if (status === 'RUNNING') return 'Running';
    if (status === 'COMPLETED') return 'Completed';
    return 'Failed';
  }

  historyTimestamp(research: ResearchHistoryItem): string {
    return research.completedAt ?? research.failedAt ?? research.startedAt;
  }

  private resetForInitialLoad(): void {
    this.historyRequestGeneration += 1;
    this.latestCompleted.set(null);
    this.displayedResearch.set(null);
    this.history.set([]);
    this.initialLoading.set(true);
    this.runInProgress.set(false);
    this.historyLoading.set(true);
    this.historyDetailLoading.set(false);
    this.selectedHistoricalResearchId.set(null);
    this.initialLoadError.set(null);
    this.runError.set(null);
    this.historyError.set(null);
    this.historyDetailError.set(null);
  }

  private loadLatest(applicationId: string): Subscription {
    return this.researchService
      .getLatestCompletedResearch(applicationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (research) => {
          this.latestCompleted.set(research);
          this.displayedResearch.set(research);
          this.initialLoading.set(false);
        },
        error: () => {
          this.initialLoading.set(false);
          this.initialLoadError.set('Could not load the latest Research result.');
        },
      });
  }

  private loadInitial(applicationId: string): Subscription {
    const subscriptions = new Subscription();
    subscriptions.add(
      this.researchService
        .getResearchHistory(applicationId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            this.history.set(response.items);
            this.historyLoading.set(false);
            if (response.items.some(({ status }) => status === 'COMPLETED')) {
              subscriptions.add(this.loadLatest(applicationId));
              return;
            }
            this.initialLoading.set(false);
          },
          error: () => {
            this.historyLoading.set(false);
            this.historyError.set('Could not load Research history.');
            subscriptions.add(this.loadLatest(applicationId));
          },
        }),
    );
    return subscriptions;
  }

  private loadHistory(
    applicationId: string,
    initial: boolean,
  ): Subscription {
    this.historyLoading.set(true);
    this.historyError.set(null);
    return this.researchService
      .getResearchHistory(applicationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.history.set(response.items);
          this.historyLoading.set(false);
        },
        error: () => {
          this.historyLoading.set(false);
          this.historyError.set(
            initial
              ? 'Could not load Research history.'
              : 'Could not refresh Research history.',
          );
        },
      });
  }

  private scrollToResearchAfterRender(): void {
    afterNextRender(
      () => {
        this.researchSection().nativeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      },
      { injector: this.injector },
    );
  }

  private runErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Research could not be completed. Please try again.';
    }
    if (error.status === 409) {
      return 'Research is already running for this application.';
    }
    if (error.status === 429) {
      return 'AI usage limit reached. Research could not be started.';
    }
    if (error.status === 502) {
      return 'Research could not be completed from the available AI/web result.';
    }
    if (error.status === 503) {
      return 'Research is temporarily unavailable. Please try again later.';
    }
    if (error.status === 500) {
      return 'Research could not be saved. Please try again later.';
    }
    return 'Research could not be completed. Please try again.';
  }
}
