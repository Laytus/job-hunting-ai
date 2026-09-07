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
import {
  takeUntilDestroyed,
  toSignal,
} from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  Document as WorkspaceDocument,
  DocumentType,
  documentTypeLabel,
  documentTypes,
} from '../document.models';
import { DocumentService } from '../document.service';
import { DocumentVersionHistory } from '../document-version-history/document-version-history';
import { MarkdownContent } from '../../../shared/markdown-content/markdown-content';

function nonWhitespace(
  control: AbstractControl<unknown>,
): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length === 0
    ? { whitespace: true }
    : null;
}

@Component({
  selector: 'app-document-editor',
  imports: [DocumentVersionHistory, MarkdownContent, ReactiveFormsModule],
  templateUrl: './document-editor.html',
  styleUrl: './document-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentEditor {
  private readonly documentService = inject(DocumentService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private populatedDocumentKey: string | null = null;

  readonly document = input.required<WorkspaceDocument>();
  readonly saved = output<WorkspaceDocument>();
  readonly documentTypes = documentTypes;
  readonly documentTypeLabel = documentTypeLabel;
  readonly metadataSaving = signal(false);
  readonly metadataError = signal<string | null>(null);
  readonly metadataSuccess = signal<string | null>(null);
  readonly contentSaving = signal(false);
  readonly contentError = signal<string | null>(null);
  readonly contentSuccess = signal<string | null>(null);
  readonly activePane = signal<'edit' | 'preview'>('edit');

  readonly metadataForm = this.formBuilder.group({
    title: this.formBuilder.nonNullable.control('', [
      Validators.required,
      nonWhitespace,
    ]),
    type:
      this.formBuilder.nonNullable.control<DocumentType>('MARKDOWN_NOTE'),
  });

  readonly contentForm = this.formBuilder.group({
    contentMarkdown: this.formBuilder.nonNullable.control('', [
      Validators.required,
      nonWhitespace,
    ]),
  });
  readonly previewMarkdown = toSignal(
    this.contentForm.controls.contentMarkdown.valueChanges,
    { initialValue: '' },
  );

  constructor() {
    effect(() => {
      const document = this.document();
      const documentKey = `${document.id}:${document.currentVersionId}`;
      if (this.populatedDocumentKey === documentKey) {
        return;
      }

      this.populatedDocumentKey = documentKey;
      this.populateForms(document);
      this.metadataError.set(null);
      this.metadataSuccess.set(null);
      this.contentError.set(null);
      this.contentSuccess.set(null);
      this.activePane.set(
        document.currentVersion.contentMarkdown.trim() === ''
          ? 'edit'
          : 'preview',
      );
    });
  }

  showPane(pane: 'edit' | 'preview'): void {
    this.activePane.set(pane);
  }

  saveMetadata(): void {
    if (this.metadataForm.invalid) {
      this.metadataForm.markAllAsTouched();
      this.metadataError.set('Check the document details before saving.');
      return;
    }

    this.metadataSaving.set(true);
    this.metadataError.set(null);
    this.metadataSuccess.set(null);

    this.documentService
      .updateDocumentMetadata(
        this.document().id,
        this.metadataForm.getRawValue(),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (document) => {
          this.metadataSaving.set(false);
          this.metadataSuccess.set('Document details saved.');
          this.metadataForm.markAsPristine();
          this.saved.emit(document);
        },
        error: () => {
          this.metadataSaving.set(false);
          this.metadataError.set('Could not save document details.');
        },
      });
  }

  saveContent(): void {
    if (this.contentForm.invalid) {
      this.contentForm.markAllAsTouched();
      this.contentError.set('Enter Markdown content before saving.');
      return;
    }

    this.contentSaving.set(true);
    this.contentError.set(null);
    this.contentSuccess.set(null);

    this.documentService
      .createDocumentVersion(
        this.document().id,
        this.contentForm.getRawValue(),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (document) => {
          this.contentSaving.set(false);
          this.contentSuccess.set('New document version saved.');
          this.contentForm.markAsPristine();
          this.saved.emit(document);
        },
        error: () => {
          this.contentSaving.set(false);
          this.contentError.set('Could not save document content.');
        },
      });
  }

  versionRestored(document: WorkspaceDocument): void {
    this.contentForm.setValue({
      contentMarkdown: document.currentVersion.contentMarkdown,
    });
    this.contentForm.markAsPristine();
    this.contentError.set(null);
    this.contentSuccess.set('Historical version restored.');
    this.saved.emit(document);
  }

  private populateForms(document: WorkspaceDocument): void {
    this.metadataForm.setValue({
      title: document.title,
      type: document.type,
    });
    this.contentForm.setValue({
      contentMarkdown: document.currentVersion.contentMarkdown,
    });
    this.metadataForm.markAsPristine();
    this.contentForm.markAsPristine();
  }
}
