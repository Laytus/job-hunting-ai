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
import { RouterLink } from '@angular/router';
import { of, switchMap } from 'rxjs';
import type {
  JobAnalysisDetail,
  JobAnalysisStatus,
  JobAnalysisSummary,
} from '../analyze.models';
import { AnalyzeService } from '../analyze.service';
import { AnalyzeResult } from '../analyze-result/analyze-result';

type ExecutionGuidance =
  | 'candidate'
  | 'job-description'
  | 'source-context'
  | null;

interface ApiErrorEnvelope {
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
  };
}

function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const body = error.error as ApiErrorEnvelope | null;
  return typeof body?.error?.code === 'string' ? body.error.code : null;
}

@Component({
  selector: 'app-application-analysis',
  imports: [AnalyzeResult, DatePipe, RouterLink],
  templateUrl: './application-analysis.html',
  styleUrl: './application-analysis.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplicationAnalysis {
  private readonly analyzeService = inject(AnalyzeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly retryToken = signal(0);
  private readonly analysisSection =
    viewChild.required<ElementRef<HTMLElement>>('analysisSection');

  readonly applicationId = input.required<string>();
  readonly initialLoading = signal(true);
  readonly historyLoading = signal(false);
  readonly executionPending = signal(false);
  readonly detailLoading = signal(false);
  readonly latestCompleted = signal<JobAnalysisDetail | null>(null);
  readonly history = signal<readonly JobAnalysisSummary[]>([]);
  readonly selectedAnalysis = signal<JobAnalysisDetail | null>(null);
  readonly selectedAnalysisId = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly historyError = signal<string | null>(null);
  readonly detailError = signal<string | null>(null);
  readonly executionError = signal<string | null>(null);
  readonly executionGuidance = signal<ExecutionGuidance>(null);

  readonly displayedAnalysis = computed(
    () => this.selectedAnalysis() ?? this.latestCompleted(),
  );
  readonly viewingHistorical = computed(
    () => this.selectedAnalysis() !== null,
  );
  readonly runButtonLabel = computed(() => {
    if (this.executionPending()) return 'Analyzing application…';
    return this.latestCompleted() === null
      ? 'Run Analyze'
      : 'Run Analyze again';
  });

  constructor() {
    effect((onCleanup) => {
      const applicationId = this.applicationId();
      this.retryToken();
      this.resetForInitialLoad();

      const subscription = this.analyzeService
        .getAnalyzeHistory(applicationId)
        .pipe(
          switchMap((history) => {
            this.history.set(history.items);
            return history.items.some(({ status }) => status === 'COMPLETED')
              ? this.analyzeService.getLatestCompletedAnalyze(applicationId)
              : of(null);
          }),
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (latest) => {
            this.latestCompleted.set(latest);
            this.initialLoading.set(false);
          },
          error: () => {
            this.initialLoading.set(false);
            this.loadError.set('Could not load Analyze data.');
          },
        });

      onCleanup(() => subscription.unsubscribe());
    });
  }

  retryInitialLoad(): void {
    this.retryToken.update((value) => value + 1);
  }

  runAnalyze(): void {
    if (this.executionPending()) return;

    this.executionPending.set(true);
    this.executionError.set(null);
    this.executionGuidance.set(null);

    this.analyzeService
      .runAnalyze(this.applicationId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (analysis) => {
          this.latestCompleted.set(analysis);
          this.selectedAnalysis.set(null);
          this.selectedAnalysisId.set(null);
          this.executionPending.set(false);
          this.executionError.set(null);
          this.refreshHistory();
        },
        error: (error: unknown) => {
          const presentation = this.executionErrorPresentation(error);
          this.executionPending.set(false);
          this.executionError.set(presentation.message);
          this.executionGuidance.set(presentation.guidance);
          this.refreshHistory();
        },
      });
  }

  selectAnalysis(analysisId: string): void {
    if (analysisId === this.latestCompleted()?.id) {
      this.returnToLatest();
      return;
    }
    if (
      analysisId === this.selectedAnalysisId() &&
      this.selectedAnalysis() !== null
    ) {
      return;
    }

    this.selectedAnalysisId.set(analysisId);
    this.selectedAnalysis.set(null);
    this.detailLoading.set(true);
    this.detailError.set(null);

    this.analyzeService
      .getAnalyzeById(this.applicationId(), analysisId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (analysis) => {
          if (this.selectedAnalysisId() !== analysisId) return;
          this.selectedAnalysis.set(analysis);
          this.detailLoading.set(false);
          this.scrollToAnalysisAfterRender();
        },
        error: () => {
          if (this.selectedAnalysisId() !== analysisId) return;
          this.detailLoading.set(false);
          this.detailError.set('Could not load this analysis.');
        },
      });
  }

  returnToLatest(): void {
    this.selectedAnalysis.set(null);
    this.selectedAnalysisId.set(null);
    this.detailLoading.set(false);
    this.detailError.set(null);
    this.scrollToAnalysisAfterRender();
  }

  statusLabel(status: JobAnalysisStatus): string {
    if (status === 'RUNNING') return 'Running';
    if (status === 'COMPLETED') return 'Completed';
    return 'Failed';
  }

  historyTimestamp(analysis: JobAnalysisSummary): string {
    return (
      analysis.completedAt ?? analysis.failedAt ?? analysis.startedAt
    );
  }

  private resetForInitialLoad(): void {
    this.initialLoading.set(true);
    this.latestCompleted.set(null);
    this.history.set([]);
    this.selectedAnalysis.set(null);
    this.selectedAnalysisId.set(null);
    this.loadError.set(null);
    this.historyError.set(null);
    this.detailError.set(null);
    this.executionError.set(null);
    this.executionGuidance.set(null);
  }

  private scrollToAnalysisAfterRender(): void {
    afterNextRender(
      () => {
        this.analysisSection().nativeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      },
      { injector: this.injector },
    );
  }

  private refreshHistory(): void {
    this.historyLoading.set(true);
    this.historyError.set(null);
    this.analyzeService
      .getAnalyzeHistory(this.applicationId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.history.set(response.items);
          this.historyLoading.set(false);
        },
        error: () => {
          this.historyLoading.set(false);
          this.historyError.set('Could not refresh Analyze history.');
        },
      });
  }

  private executionErrorPresentation(error: unknown): {
    readonly message: string;
    readonly guidance: ExecutionGuidance;
  } {
    const code = apiErrorCode(error);
    if (code === 'ANALYSIS_ALREADY_RUNNING') {
      return {
        message: 'An analysis is already in progress for this application.',
        guidance: null,
      };
    }
    if (code === 'CANDIDATE_PROFILE_UNAVAILABLE') {
      return {
        message: 'Complete the Candidate Profile before running Analyze.',
        guidance: 'candidate',
      };
    }
    if (code === 'JOB_DESCRIPTION_UNAVAILABLE') {
      return {
        message: 'Add a Job Description before running Analyze.',
        guidance: 'job-description',
      };
    }
    if (code === 'INVALID_SOURCE_CONTEXT') {
      return {
        message:
          'Review the Candidate Profile and Job Description before running Analyze.',
        guidance: 'source-context',
      };
    }
    if (
      code === 'USAGE_NOT_ALLOWED' ||
      (error instanceof HttpErrorResponse && error.status === 429)
    ) {
      return {
        message:
          'Analyze is temporarily unavailable because the configured AI usage limit has been reached.',
        guidance: null,
      };
    }
    if (error instanceof HttpErrorResponse && error.status === 502) {
      return {
        message: 'Analyze could not complete successfully. Try again.',
        guidance: null,
      };
    }
    if (error instanceof HttpErrorResponse && error.status === 503) {
      return {
        message: 'Analyze is temporarily unavailable. Try again later.',
        guidance: null,
      };
    }
    return {
      message: 'Analyze could not be completed. Please try again.',
      guidance: null,
    };
  }
}
