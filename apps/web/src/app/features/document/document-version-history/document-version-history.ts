import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  Document as WorkspaceDocument,
  DocumentVersion,
} from '../document.models';
import { DocumentService } from '../document.service';

@Component({
  selector: 'app-document-version-history',
  imports: [DatePipe],
  templateUrl: './document-version-history.html',
  styleUrl: './document-version-history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentVersionHistory {
  private readonly documentService = inject(DocumentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly retryToken = signal(0);
  private loadedDocumentId: string | null = null;

  readonly documentId = input.required<string>();
  readonly currentVersionId = input.required<string>();
  readonly restored = output<WorkspaceDocument>();
  readonly versions = signal<DocumentVersion[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly selectedVersion = signal<DocumentVersion | null>(null);
  readonly previewContent = signal<string | null>(null);
  readonly restoring = signal(false);
  readonly restoreError = signal<string | null>(null);
  readonly restoreSuccess = signal<string | null>(null);
  readonly activeCurrentVersionId = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const documentId = this.documentId();
      const currentVersionId = this.currentVersionId();
      this.retryToken();
      const documentChanged = this.loadedDocumentId !== documentId;
      this.loadedDocumentId = documentId;
      this.activeCurrentVersionId.set(currentVersionId);
      this.loading.set(true);
      this.loadError.set(null);

      if (documentChanged) {
        this.selectedVersion.set(null);
        this.previewContent.set(null);
        this.restoreError.set(null);
        this.restoreSuccess.set(null);
      }

      const subscription = this.documentService
        .getDocumentVersions(documentId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (versions) => {
            this.versions.set(versions);
            this.loading.set(false);
          },
          error: () => {
            this.versions.set([]);
            this.loading.set(false);
            this.loadError.set('Could not load document versions.');
          },
        });

      onCleanup(() => subscription.unsubscribe());
    });
  }

  retry(): void {
    this.retryToken.update((value) => value + 1);
  }

  selectVersion(version: DocumentVersion): void {
    this.selectedVersion.set(version);
    this.previewContent.set(version.contentMarkdown);
    this.restoreError.set(null);
    this.restoreSuccess.set(null);
  }

  versionNumber(index: number): number {
    return this.versions().length - index;
  }

  isCurrent(version: DocumentVersion): boolean {
    return version.id === this.activeCurrentVersionId();
  }

  restoreSelectedVersion(): void {
    const version = this.selectedVersion();
    if (version === null || this.isCurrent(version)) {
      return;
    }

    this.restoring.set(true);
    this.restoreError.set(null);
    this.restoreSuccess.set(null);

    this.documentService
      .createDocumentVersion(this.documentId(), {
        contentMarkdown: version.contentMarkdown,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (document) => {
          const restoredVersion = document.currentVersion;
          this.versions.update((versions) => [
            restoredVersion,
            ...versions.filter((item) => item.id !== restoredVersion.id),
          ]);
          this.activeCurrentVersionId.set(document.currentVersionId);
          this.selectedVersion.set(restoredVersion);
          this.previewContent.set(restoredVersion.contentMarkdown);
          this.restoring.set(false);
          this.restoreSuccess.set('Version restored as a new current version.');
          this.restored.emit(document);
        },
        error: () => {
          this.restoring.set(false);
          this.restoreError.set('Could not restore this document version.');
        },
      });
  }
}
