import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import type { Subscription } from 'rxjs';
import {
  Document as WorkspaceDocument,
  DocumentSummary,
  DocumentType,
  documentTypeLabel,
  documentTypes,
} from '../document.models';
import { DocumentService } from '../document.service';
import { DocumentEditor } from '../document-editor/document-editor';
import type {
  CoverLetterGenerationProfile,
  CoverLetterMarket,
  CoverLetterProfileSuggestion,
  CoverLetterSector,
  GenerationDocumentType,
  GenerationOutputLanguage,
  GenerationResponse,
  GenerationWarning,
} from '../../generation/generation.models';
import {
  generationWarningMessage,
  isCompleteCoverLetterProfile,
  isCoverLetterMarket,
  isCoverLetterSector,
  isGenerationDocumentType,
  isGenerationOutputLanguage,
} from '../../generation/generation.models';
import { GenerationService } from '../../generation/generation.service';

interface ApiErrorEnvelope {
  readonly error?: {
    readonly code?: unknown;
  };
}

function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const body = error.error as ApiErrorEnvelope | null;
  return typeof body?.error?.code === 'string' ? body.error.code : null;
}

function nonWhitespace(
  control: AbstractControl<unknown>,
): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length === 0
    ? { whitespace: true }
    : null;
}

function toSummary(document: WorkspaceDocument): DocumentSummary {
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    currentVersionId: document.currentVersionId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function orderSummaries(documents: DocumentSummary[]): DocumentSummary[] {
  return [...documents].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.createdAt.localeCompare(left.createdAt) ||
      right.id.localeCompare(left.id),
  );
}

@Component({
  selector: 'app-application-documents',
  imports: [DatePipe, DocumentEditor, ReactiveFormsModule],
  templateUrl: './application-documents.html',
  styleUrl: './application-documents.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplicationDocuments {
  private readonly documentService = inject(DocumentService);
  private readonly generationService = inject(GenerationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly retryToken = signal(0);
  private selectedDocumentSubscription: Subscription | null = null;
  private generationSubscription: Subscription | null = null;
  private regenerationSubscription: Subscription | null = null;
  private suggestionSubscription: Subscription | null = null;
  private generationRequestGeneration = 0;
  private regenerationRequestGeneration = 0;
  private suggestionRequestGeneration = 0;
  private suggestionApplicationId: string | null = null;
  private initializedRegenerateKey: string | null = null;

  readonly applicationId = input.required<string>();
  readonly documents = signal<DocumentSummary[]>([]);
  readonly selectedDocument = signal<WorkspaceDocument | null>(null);
  readonly selectedDocumentId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly selectionLoading = signal(false);
  readonly selectionError = signal<string | null>(null);
  readonly creating = signal(false);
  readonly createSaving = signal(false);
  readonly createError = signal<string | null>(null);
  readonly generationMenuOpen = signal(false);
  readonly generationPendingType = signal<GenerationDocumentType | null>(null);
  readonly generationError = signal<string | null>(null);
  readonly generationWarnings = signal<readonly GenerationWarning[]>([]);
  readonly coverLetterSuggestion =
    signal<CoverLetterProfileSuggestion | null>(null);
  readonly coverLetterSuggestionLoading = signal(false);
  readonly coverLetterSuggestionError = signal<string | null>(null);
  readonly generateCoverLetterLanguage =
    signal<GenerationOutputLanguage | null>(null);
  readonly generateCoverLetterMarket = signal<CoverLetterMarket | null>(null);
  readonly generateCoverLetterSector = signal<CoverLetterSector | null>(null);
  readonly generateMarketOverridden = signal(false);
  readonly generateSectorOverridden = signal(false);
  readonly regenerateCoverLetterLanguage =
    signal<GenerationOutputLanguage | null>(null);
  readonly regenerateCoverLetterMarket =
    signal<CoverLetterMarket | null>(null);
  readonly regenerateCoverLetterSector =
    signal<CoverLetterSector | null>(null);
  readonly regenerateMarketOverridden = signal(false);
  readonly regenerateSectorOverridden = signal(false);
  readonly regenerateUsesAdaptiveProfile = signal(false);
  readonly regenerationPending = signal(false);
  readonly regeneratingDocumentId = signal<string | null>(null);
  readonly regenerationError = signal<string | null>(null);
  readonly documentTypes = documentTypes;
  readonly documentTypeLabel = documentTypeLabel;
  readonly generationWarningMessage = generationWarningMessage;
  readonly generationBusy = computed(
    () =>
      this.generationPendingType() !== null || this.regenerationPending(),
  );
  readonly selectedGenerationType = computed(() => {
    const type = this.selectedDocument()?.type;
    return type !== undefined && isGenerationDocumentType(type) ? type : null;
  });
  readonly generateCoverLetterValid = computed(
    () => this.generateCoverLetterProfile() !== null,
  );
  readonly regenerateCoverLetterValid = computed(
    () => this.regenerateCoverLetterProfile() !== null,
  );
  readonly languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'French' },
  ] as const;
  readonly marketOptions = [
    { value: 'FRANCE', label: 'France' },
    { value: 'UNITED_KINGDOM', label: 'United Kingdom' },
    { value: 'UNITED_STATES', label: 'United States' },
  ] as const;
  readonly sectorOptions = [
    { value: 'QUANT_TRADING', label: 'Quant / Trading' },
    { value: 'INVESTMENT_BANKING', label: 'Investment Banking' },
    { value: 'ASSET_MANAGEMENT', label: 'Asset Management' },
    { value: 'SOFTWARE_TECH', label: 'Software / Tech' },
    { value: 'CONSULTING', label: 'Consulting' },
    { value: 'GENERAL_FINANCE', label: 'General Finance' },
    { value: 'GENERAL', label: 'General' },
  ] as const;

  readonly createForm = this.formBuilder.group({
    title: this.formBuilder.nonNullable.control('', [
      Validators.required,
      nonWhitespace,
    ]),
    type:
      this.formBuilder.nonNullable.control<DocumentType>('MARKDOWN_NOTE'),
    contentMarkdown: this.formBuilder.nonNullable.control('', [
      Validators.required,
      nonWhitespace,
    ]),
  });

  constructor() {
    effect((onCleanup) => {
      const applicationId = this.applicationId();
      this.retryToken();
      this.selectedDocumentSubscription?.unsubscribe();
      this.generationSubscription?.unsubscribe();
      this.regenerationSubscription?.unsubscribe();
      this.suggestionSubscription?.unsubscribe();
      this.generationRequestGeneration += 1;
      this.regenerationRequestGeneration += 1;
      this.suggestionRequestGeneration += 1;
      this.suggestionApplicationId = null;
      this.initializedRegenerateKey = null;
      this.selectedDocument.set(null);
      this.selectedDocumentId.set(null);
      this.selectionLoading.set(false);
      this.selectionError.set(null);
      this.creating.set(false);
      this.generationMenuOpen.set(false);
      this.generationPendingType.set(null);
      this.generationError.set(null);
      this.generationWarnings.set([]);
      this.resetCoverLetterSuggestion();
      this.resetGenerateCoverLetterProfile();
      this.resetRegenerateCoverLetterProfile();
      this.regenerationPending.set(false);
      this.regeneratingDocumentId.set(null);
      this.regenerationError.set(null);
      this.loading.set(true);
      this.loadError.set(null);

      const subscription = this.documentService
        .getApplicationDocuments(applicationId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (documents) => {
            this.documents.set(documents);
            this.loading.set(false);
          },
          error: () => {
            this.documents.set([]);
            this.loading.set(false);
            this.loadError.set('Could not load application documents.');
          },
        });

      onCleanup(() => subscription.unsubscribe());
    });

    effect(() => {
      const document = this.selectedDocument();
      const regenerateKey =
        document === null
          ? null
          : `${document.id}:${document.type}:${document.currentVersion.id}`;
      if (regenerateKey === this.initializedRegenerateKey) return;
      this.initializedRegenerateKey = regenerateKey;
      this.initializeRegenerateCoverLetterProfile(document);
    });
  }

  retry(): void {
    this.retryToken.update((value) => value + 1);
  }

  selectDocument(id: string): void {
    if (id === this.selectedDocumentId() && this.selectedDocument() !== null) {
      return;
    }

    this.selectedDocumentSubscription?.unsubscribe();
    this.creating.set(false);
    this.createError.set(null);
    this.generationError.set(null);
    this.generationWarnings.set([]);
    this.regenerationError.set(null);
    this.selectedDocument.set(null);
    this.selectedDocumentId.set(id);
    this.selectionLoading.set(true);
    this.selectionError.set(null);

    this.selectedDocumentSubscription = this.documentService
      .getDocument(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (document) => {
          this.selectedDocument.set(document);
          this.selectionLoading.set(false);
        },
        error: () => {
          this.selectionLoading.set(false);
          this.selectionError.set('Could not load this document.');
        },
      });
  }

  retrySelection(): void {
    const id = this.selectedDocumentId();
    if (id !== null) {
      this.selectDocument(id);
    }
  }

  startCreating(): void {
    this.selectedDocumentSubscription?.unsubscribe();
    this.selectedDocument.set(null);
    this.selectedDocumentId.set(null);
    this.selectionLoading.set(false);
    this.selectionError.set(null);
    this.createError.set(null);
    this.generationMenuOpen.set(false);
    this.generationError.set(null);
    this.generationWarnings.set([]);
    this.regenerationError.set(null);
    this.createForm.reset({
      title: '',
      type: 'MARKDOWN_NOTE',
      contentMarkdown: '',
    });
    this.creating.set(true);
  }

  cancelCreating(): void {
    this.creating.set(false);
    this.createError.set(null);
  }

  toggleGenerationMenu(): void {
    const open = !this.generationMenuOpen();
    this.generationMenuOpen.set(open);
    this.generationError.set(null);
    if (open && this.existingDocument('COVER_LETTER') === null) {
      this.ensureCoverLetterSuggestion();
    }
  }

  existingDocument(
    documentType: GenerationDocumentType,
  ): DocumentSummary | null {
    return (
      this.documents().find((document) => document.type === documentType) ??
      null
    );
  }

  openExisting(documentType: GenerationDocumentType): void {
    const existing = this.existingDocument(documentType);
    if (existing === null) return;
    this.generationMenuOpen.set(false);
    this.selectDocument(existing.id);
  }

  generateDocument(documentType: GenerationDocumentType): void {
    if (this.generationBusy()) return;
    const existing = this.existingDocument(documentType);
    if (existing !== null) {
      this.openExisting(documentType);
      return;
    }
    const coverLetterProfile =
      documentType === 'COVER_LETTER'
        ? this.generateCoverLetterProfile()
        : null;
    if (documentType === 'COVER_LETTER' && coverLetterProfile === null) {
      this.generationError.set(
        'Choose a Language, Market, and Sector before generating the Cover Letter.',
      );
      return;
    }

    const applicationId = this.applicationId();
    const requestGeneration = ++this.generationRequestGeneration;
    const request =
      documentType === 'COVER_LETTER'
        ? { documentType, ...coverLetterProfile! }
        : { documentType };
    this.generationPendingType.set(documentType);
    this.generationError.set(null);

    this.generationSubscription = this.generationService
      .generateDocument(applicationId, request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (
            requestGeneration !== this.generationRequestGeneration ||
            applicationId !== this.applicationId()
          ) {
            return;
          }
          this.generationPendingType.set(null);
          this.generationMenuOpen.set(false);
          this.applyGenerationResponse(response, true);
        },
        error: (error: unknown) => {
          if (requestGeneration !== this.generationRequestGeneration) return;
          this.generationPendingType.set(null);
          if (apiErrorCode(error) === 'DOCUMENT_ALREADY_EXISTS') {
            this.generationError.set(
              'A document of this type already exists. Opening the existing document.',
            );
            this.refreshDocumentsAndOpen(documentType);
            return;
          }
          this.generationError.set(this.generationErrorMessage(error));
        },
      });
  }

  regenerateDocument(): void {
    const document = this.selectedDocument();
    const documentType = this.selectedGenerationType();
    if (
      document === null ||
      documentType === null ||
      this.generationBusy()
    ) {
      return;
    }
    const coverLetterProfile =
      documentType === 'COVER_LETTER'
        ? this.regenerateCoverLetterProfile()
        : null;
    if (documentType === 'COVER_LETTER' && coverLetterProfile === null) {
      this.regenerationError.set(
        'Choose a Language, Market, and Sector before regenerating the Cover Letter.',
      );
      return;
    }

    const applicationId = this.applicationId();
    const documentId = document.id;
    const requestGeneration = ++this.regenerationRequestGeneration;
    this.regenerationPending.set(true);
    this.regeneratingDocumentId.set(documentId);
    this.regenerationError.set(null);

    this.regenerationSubscription = this.generationService
      .regenerateDocument(
        applicationId,
        documentId,
        documentType === 'COVER_LETTER' ? coverLetterProfile! : {},
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (
            requestGeneration !== this.regenerationRequestGeneration ||
            applicationId !== this.applicationId()
          ) {
            return;
          }
          this.regenerationPending.set(false);
          this.regeneratingDocumentId.set(null);
          this.applyGenerationResponse(
            response,
            this.selectedDocumentId() === documentId,
          );
        },
        error: (error: unknown) => {
          if (requestGeneration !== this.regenerationRequestGeneration) return;
          this.regenerationPending.set(false);
          this.regeneratingDocumentId.set(null);
          if (this.selectedDocumentId() !== documentId) return;
          this.regenerationError.set(this.generationErrorMessage(error));
        },
      });
  }

  createDocument(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      this.createError.set('Check the document fields before creating it.');
      return;
    }

    this.createSaving.set(true);
    this.createError.set(null);
    const value = this.createForm.getRawValue();

    this.documentService
      .createDocument({
        candidateId: null,
        applicationId: this.applicationId(),
        type: value.type,
        title: value.title,
        contentMarkdown: value.contentMarkdown,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (document) => {
          this.documents.update((documents) =>
            orderSummaries([
              toSummary(document),
              ...documents.filter((item) => item.id !== document.id),
            ]),
          );
          this.selectedDocumentId.set(document.id);
          this.selectedDocument.set(document);
          this.creating.set(false);
          this.createSaving.set(false);
        },
        error: () => {
          this.createSaving.set(false);
          this.createError.set('Could not create the document.');
        },
      });
  }

  documentSaved(document: WorkspaceDocument): void {
    this.selectedDocument.set(document);
    this.selectedDocumentId.set(document.id);
    this.documents.update((documents) =>
      orderSummaries(
        documents.map((item) =>
          item.id === document.id ? toSummary(document) : item,
        ),
      ),
    );
  }

  selectGenerateLanguage(value: string): void {
    this.generateCoverLetterLanguage.set(
      isGenerationOutputLanguage(value) ? value : null,
    );
  }

  selectGenerateMarket(value: string): void {
    this.generateMarketOverridden.set(true);
    this.generateCoverLetterMarket.set(
      isCoverLetterMarket(value) ? value : null,
    );
  }

  selectGenerateSector(value: string): void {
    this.generateSectorOverridden.set(true);
    this.generateCoverLetterSector.set(
      isCoverLetterSector(value) ? value : null,
    );
  }

  selectRegenerateLanguage(value: string): void {
    this.regenerateCoverLetterLanguage.set(
      isGenerationOutputLanguage(value) ? value : null,
    );
  }

  selectRegenerateMarket(value: string): void {
    this.regenerateMarketOverridden.set(true);
    this.regenerateCoverLetterMarket.set(
      isCoverLetterMarket(value) ? value : null,
    );
  }

  selectRegenerateSector(value: string): void {
    this.regenerateSectorOverridden.set(true);
    this.regenerateCoverLetterSector.set(
      isCoverLetterSector(value) ? value : null,
    );
  }

  retryCoverLetterSuggestion(): void {
    this.suggestionApplicationId = null;
    this.ensureCoverLetterSuggestion();
  }

  generateMarketHint(): string {
    return this.marketHint(this.generateMarketOverridden());
  }

  generateSectorHint(): string {
    return this.sectorHint(this.generateSectorOverridden());
  }

  regenerateMarketHint(): string {
    if (this.regenerateMarketOverridden()) return 'Your selection will be used.';
    if (this.regenerateUsesAdaptiveProfile()) return 'From the current version.';
    return this.marketHint(false);
  }

  regenerateSectorHint(): string {
    if (this.regenerateSectorOverridden()) return 'Your selection will be used.';
    if (this.regenerateUsesAdaptiveProfile()) return 'From the current version.';
    return this.sectorHint(false);
  }

  private applyGenerationResponse(
    response: GenerationResponse,
    select: boolean,
  ): void {
    this.documents.update((documents) =>
      orderSummaries([
        toSummary(response.document),
        ...documents.filter((item) => item.id !== response.document.id),
      ]),
    );
    if (!select) return;

    this.selectedDocumentSubscription?.unsubscribe();
    this.creating.set(false);
    this.selectionLoading.set(false);
    this.selectionError.set(null);
    this.selectedDocumentId.set(response.document.id);
    this.selectedDocument.set(response.document);
    this.generationWarnings.set(response.warnings);
  }

  private generateCoverLetterProfile(): CoverLetterGenerationProfile | null {
    return this.profileFromSelections(
      this.generateCoverLetterLanguage(),
      this.generateCoverLetterMarket(),
      this.generateCoverLetterSector(),
    );
  }

  private regenerateCoverLetterProfile(): CoverLetterGenerationProfile | null {
    return this.profileFromSelections(
      this.regenerateCoverLetterLanguage(),
      this.regenerateCoverLetterMarket(),
      this.regenerateCoverLetterSector(),
    );
  }

  private profileFromSelections(
    outputLanguage: GenerationOutputLanguage | null,
    market: CoverLetterMarket | null,
    sector: CoverLetterSector | null,
  ): CoverLetterGenerationProfile | null {
    return outputLanguage === null || market === null || sector === null
      ? null
      : { outputLanguage, market, sector };
  }

  private initializeRegenerateCoverLetterProfile(
    document: WorkspaceDocument | null,
  ): void {
    this.resetRegenerateCoverLetterProfile();
    if (document?.type !== 'COVER_LETTER') return;

    const profile = document.currentVersion.coverLetterProfile;
    if (isCompleteCoverLetterProfile(profile)) {
      this.regenerateUsesAdaptiveProfile.set(true);
      this.regenerateCoverLetterLanguage.set(profile.outputLanguage);
      this.regenerateCoverLetterMarket.set(profile.market);
      this.regenerateCoverLetterSector.set(profile.sector);
      return;
    }

    if (isGenerationOutputLanguage(profile?.outputLanguage)) {
      this.regenerateCoverLetterLanguage.set(profile.outputLanguage);
    }
    const suggestion = this.coverLetterSuggestion();
    if (suggestion === null) {
      this.ensureCoverLetterSuggestion();
      return;
    }
    this.applySuggestionToRegenerate(suggestion);
  }

  private ensureCoverLetterSuggestion(): void {
    const applicationId = this.applicationId();
    if (this.suggestionApplicationId === applicationId) return;

    this.suggestionSubscription?.unsubscribe();
    this.suggestionApplicationId = applicationId;
    const requestGeneration = ++this.suggestionRequestGeneration;
    this.coverLetterSuggestionLoading.set(true);
    this.coverLetterSuggestionError.set(null);

    this.suggestionSubscription = this.generationService
      .suggestCoverLetterProfile(applicationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (suggestion) => {
          if (
            requestGeneration !== this.suggestionRequestGeneration ||
            applicationId !== this.applicationId()
          ) {
            return;
          }
          this.coverLetterSuggestionLoading.set(false);
          this.coverLetterSuggestion.set(suggestion);
          this.applyCoverLetterSuggestion(suggestion);
        },
        error: () => {
          if (requestGeneration !== this.suggestionRequestGeneration) return;
          this.coverLetterSuggestionLoading.set(false);
          this.coverLetterSuggestionError.set(
            'Could not load suggested Cover Letter settings. Choose them manually.',
          );
        },
      });
  }

  private applyCoverLetterSuggestion(
    suggestion: CoverLetterProfileSuggestion,
  ): void {
    if (!this.generateMarketOverridden()) {
      this.generateCoverLetterMarket.set(suggestion.market.value);
    }
    if (!this.generateSectorOverridden()) {
      this.generateCoverLetterSector.set(suggestion.sector.value);
    }
    if (
      this.selectedDocument()?.type === 'COVER_LETTER' &&
      !this.regenerateUsesAdaptiveProfile()
    ) {
      this.applySuggestionToRegenerate(suggestion);
    }
  }

  private applySuggestionToRegenerate(
    suggestion: CoverLetterProfileSuggestion,
  ): void {
    if (!this.regenerateMarketOverridden()) {
      this.regenerateCoverLetterMarket.set(suggestion.market.value);
    }
    if (!this.regenerateSectorOverridden()) {
      this.regenerateCoverLetterSector.set(suggestion.sector.value);
    }
  }

  private resetCoverLetterSuggestion(): void {
    this.coverLetterSuggestion.set(null);
    this.coverLetterSuggestionLoading.set(false);
    this.coverLetterSuggestionError.set(null);
  }

  private resetGenerateCoverLetterProfile(): void {
    this.generateCoverLetterLanguage.set(null);
    this.generateCoverLetterMarket.set(null);
    this.generateCoverLetterSector.set(null);
    this.generateMarketOverridden.set(false);
    this.generateSectorOverridden.set(false);
  }

  private resetRegenerateCoverLetterProfile(): void {
    this.regenerateCoverLetterLanguage.set(null);
    this.regenerateCoverLetterMarket.set(null);
    this.regenerateCoverLetterSector.set(null);
    this.regenerateMarketOverridden.set(false);
    this.regenerateSectorOverridden.set(false);
    this.regenerateUsesAdaptiveProfile.set(false);
  }

  private marketHint(overridden: boolean): string {
    if (overridden) return 'Your selection will be used.';
    if (this.coverLetterSuggestionLoading()) {
      return 'Loading suggested market…';
    }
    const suggestion = this.coverLetterSuggestion()?.market;
    if (suggestion?.value === null) {
      return 'Could not determine the market automatically.';
    }
    if (suggestion !== undefined) {
      return 'Suggested from application details.';
    }
    return 'Select the market manually.';
  }

  private sectorHint(overridden: boolean): string {
    if (overridden) return 'Your selection will be used.';
    if (this.coverLetterSuggestionLoading()) {
      return 'Loading suggested sector…';
    }
    const suggestion = this.coverLetterSuggestion()?.sector;
    if (suggestion?.source === 'AMBIGUOUS') {
      return 'Suggested General because the role is ambiguous.';
    }
    if (suggestion?.source === 'DEFAULT_GENERAL') {
      return 'Suggested General because no specific sector was identified.';
    }
    if (suggestion !== undefined) {
      return 'Suggested from application details.';
    }
    return 'Select the sector manually.';
  }

  private refreshDocumentsAndOpen(
    documentType: GenerationDocumentType,
  ): void {
    const applicationId = this.applicationId();
    this.documentService
      .getApplicationDocuments(applicationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (documents) => {
          if (applicationId !== this.applicationId()) return;
          this.documents.set(orderSummaries(documents));
          const existing = documents.find(
            (document) => document.type === documentType,
          );
          if (existing !== undefined) {
            this.selectDocument(existing.id);
            return;
          }
          this.generationError.set(
            'A document of this type already exists. Refresh Documents to open it.',
          );
        },
        error: () => {
          if (applicationId !== this.applicationId()) return;
          this.generationError.set(
            'A document of this type already exists. Refresh Documents to open it.',
          );
        },
      });
  }

  private generationErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Generation could not be completed. Please try again.';
    }
    const code = apiErrorCode(error);
    if (code === 'CANDIDATE_UNAVAILABLE') {
      return 'Complete the Candidate Profile before generating a document.';
    }
    if (code === 'JOB_DESCRIPTION_UNAVAILABLE') {
      return 'Add a Job Description before generating a document.';
    }
    if (error.status === 400) {
      return 'The Generation request is invalid. Check the selected document and profile.';
    }
    if (error.status === 404) {
      return 'The Application or Document required for Generation is unavailable.';
    }
    if (error.status === 409) {
      return code === 'GENERATION_ALREADY_RUNNING'
        ? 'Generation is already running for this document type.'
        : 'Generation cannot start because the current document state conflicts.';
    }
    if (error.status === 429) {
      return 'AI usage limit reached. Generation could not be started.';
    }
    if (error.status === 502) {
      return 'Generation could not produce usable document content.';
    }
    if (error.status === 503) {
      return 'Generation is temporarily unavailable. Please try again later.';
    }
    if (error.status === 500) {
      return 'The generated document could not be saved. Please try again later.';
    }
    return 'Generation could not be completed. Please try again.';
  }
}
