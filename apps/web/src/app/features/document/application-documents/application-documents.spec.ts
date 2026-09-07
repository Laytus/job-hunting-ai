import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, Subject, throwError } from 'rxjs';
import type {
  CreateDocumentRequest,
  Document as WorkspaceDocument,
  DocumentSummary,
  DocumentVersion,
} from '../document.models';
import { DocumentService } from '../document.service';
import type {
  CoverLetterProfileSuggestion,
  GenerateDocumentRequest,
  GenerationResponse,
  RegenerateDocumentRequest,
} from '../../generation/generation.models';
import { GenerationService } from '../../generation/generation.service';
import { ApplicationDocuments } from './application-documents';

const applicationId = '10000000-0000-4000-8000-000000000000';
const documentId = '20000000-0000-4000-8000-000000000000';
const versionId = '30000000-0000-4000-8000-000000000000';

const summary: DocumentSummary = {
  id: documentId,
  type: 'COVER_LETTER',
  title: 'Platform Engineer cover letter',
  currentVersionId: versionId,
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-22T12:30:00.000Z',
};

const document: WorkspaceDocument = {
  ...summary,
  candidateId: null,
  applicationId,
  currentVersion: {
    id: versionId,
    documentId,
    contentMarkdown: '# Platform Engineer cover letter',
    createdAt: '2026-08-22T12:30:00.000Z',
    coverLetterProfile: {
      outputLanguage: 'en',
      market: 'UNITED_KINGDOM',
      sector: 'QUANT_TRADING',
    },
  },
};

class FakeDocumentService {
  listResult: Observable<DocumentSummary[]> = of([]);
  documentResult: Observable<WorkspaceDocument> = of(document);
  createResult: Observable<WorkspaceDocument> = of(document);
  versionsResult: Observable<DocumentVersion[]> = of([
    document.currentVersion,
  ]);
  readonly listCalls: string[] = [];
  readonly documentCalls: string[] = [];
  readonly createCommands: CreateDocumentRequest[] = [];
  readonly versionListCalls: string[] = [];

  getApplicationDocuments(id: string): Observable<DocumentSummary[]> {
    this.listCalls.push(id);
    return this.listResult;
  }

  getDocument(id: string): Observable<WorkspaceDocument> {
    this.documentCalls.push(id);
    return this.documentResult;
  }

  getDocumentVersions(id: string): Observable<DocumentVersion[]> {
    this.versionListCalls.push(id);
    return this.versionsResult;
  }

  createDocument(
    command: CreateDocumentRequest,
  ): Observable<WorkspaceDocument> {
    this.createCommands.push(command);
    return this.createResult;
  }
}

function generatedResponse(
  type: WorkspaceDocument['type'] = 'COVER_LETTER',
  currentVersionId = versionId,
): GenerationResponse {
  const generatedDocument: WorkspaceDocument = {
    ...document,
    type,
    title:
      type === 'COVER_LETTER'
        ? 'Generated Cover Letter'
        : type === 'APPLICATION_BRIEF'
          ? 'Generated Application Brief'
          : 'Generated Interview Brief',
    currentVersionId,
    updatedAt: '2026-08-28T12:00:00.000Z',
    currentVersion: {
      id: currentVersionId,
      documentId,
      contentMarkdown: '# Generated title\n\n- Generated content',
      createdAt: '2026-08-28T12:00:00.000Z',
      ...(type === 'COVER_LETTER'
        ? {
            coverLetterProfile: {
              outputLanguage: 'en' as const,
              market: 'UNITED_KINGDOM' as const,
              sector: 'QUANT_TRADING' as const,
            },
          }
        : {}),
    },
  };
  return {
    document: generatedDocument,
    currentVersion: generatedDocument.currentVersion,
    warnings: ['NO_ANALYSIS_AVAILABLE', 'NO_RESEARCH_AVAILABLE'],
  };
}

class FakeGenerationService {
  generateResult: Observable<GenerationResponse> = of(generatedResponse());
  regenerateResult: Observable<GenerationResponse> = of(
    generatedResponse('COVER_LETTER', '40000000-0000-4000-8000-000000000000'),
  );
  suggestionResult: Observable<CoverLetterProfileSuggestion> = of({
    market: { value: 'UNITED_KINGDOM', source: 'APPLICATION_LOCATION' },
    sector: { value: 'QUANT_TRADING', source: 'ROLE_TITLE' },
  });
  readonly suggestionCalls: string[] = [];
  readonly generateCalls: Array<{
    readonly applicationId: string;
    readonly request: GenerateDocumentRequest;
  }> = [];
  readonly regenerateCalls: Array<{
    readonly applicationId: string;
    readonly documentId: string;
    readonly request: RegenerateDocumentRequest;
  }> = [];

  suggestCoverLetterProfile(
    id: string,
  ): Observable<CoverLetterProfileSuggestion> {
    this.suggestionCalls.push(id);
    return this.suggestionResult;
  }

  generateDocument(
    id: string,
    request: GenerateDocumentRequest,
  ): Observable<GenerationResponse> {
    this.generateCalls.push({ applicationId: id, request });
    return this.generateResult;
  }

  regenerateDocument(
    id: string,
    targetDocumentId: string,
    request: RegenerateDocumentRequest,
  ): Observable<GenerationResponse> {
    this.regenerateCalls.push({
      applicationId: id,
      documentId: targetDocumentId,
      request,
    });
    return this.regenerateResult;
  }
}

async function createDocuments(
  service: FakeDocumentService,
  generationService = new FakeGenerationService(),
): Promise<ComponentFixture<ApplicationDocuments>> {
  await TestBed.configureTestingModule({
    imports: [ApplicationDocuments],
    providers: [
      { provide: DocumentService, useValue: service },
      { provide: GenerationService, useValue: generationService },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ApplicationDocuments);
  fixture.componentRef.setInput('applicationId', applicationId);
  fixture.detectChanges();
  return fixture;
}

function openGenerationOptions(
  fixture: ComponentFixture<ApplicationDocuments>,
): void {
  (
    fixture.nativeElement.querySelector(
      '[aria-controls="generation-options"]',
    ) as HTMLButtonElement
  ).click();
  fixture.detectChanges();
}

function setControl(
  fixture: ComponentFixture<ApplicationDocuments>,
  selector: string,
  value: string,
): void {
  const control = fixture.nativeElement.querySelector(selector) as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement;
  control.value = value;
  control.dispatchEvent(
    new Event(control instanceof HTMLSelectElement ? 'change' : 'input'),
  );
  fixture.detectChanges();
}

describe('ApplicationDocuments', () => {
  it('shows a loading state while documents are requested', async () => {
    const service = new FakeDocumentService();
    service.listResult = new Subject<DocumentSummary[]>();
    const fixture = await createDocuments(service);

    expect(fixture.nativeElement.textContent).toContain('Loading documents…');
    expect(service.listCalls).toEqual([applicationId]);
  });

  it('shows an empty state when the application has no documents', async () => {
    const fixture = await createDocuments(new FakeDocumentService());

    expect(fixture.nativeElement.textContent).toContain('No documents yet.');
    expect(fixture.nativeElement.textContent).toContain(
      'Select a document to view or edit it.',
    );
  });

  it('loads document summaries without exposing internal identifiers', async () => {
    const service = new FakeDocumentService();
    service.listResult = of([summary]);
    const fixture = await createDocuments(service);
    const time = fixture.nativeElement.querySelector('time') as HTMLTimeElement;

    expect(fixture.nativeElement.textContent).toContain(summary.title);
    expect(fixture.nativeElement.textContent).toContain('Cover Letter');
    expect(fixture.nativeElement.textContent).not.toContain('COVER_LETTER');
    expect(time.dateTime).toBe(summary.updatedAt);
    expect(fixture.nativeElement.textContent).not.toContain(summary.id);
    expect(fixture.nativeElement.textContent).not.toContain(
      summary.currentVersionId,
    );
  });

  it('selects and loads a document into the editor', async () => {
    const service = new FakeDocumentService();
    service.listResult = of([summary]);
    const fixture = await createDocuments(service);

    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement)
      .click();
    fixture.detectChanges();

    expect(service.documentCalls).toEqual([documentId]);
    expect(
      (fixture.nativeElement.querySelector('#document-title') as HTMLInputElement)
        .value,
    ).toBe(document.title);
    expect(
      (fixture.nativeElement.querySelector(
        '#document-content',
      ) as HTMLTextAreaElement).value,
    ).toBe(document.currentVersion.contentMarkdown);
  });

  it('creates an application-owned document with its initial version', async () => {
    const service = new FakeDocumentService();
    const fixture = await createDocuments(service);

    const newButton = fixture.nativeElement.querySelector(
      '.documents-heading .button',
    ) as HTMLButtonElement;
    newButton.click();
    fixture.detectChanges();
    setControl(fixture, '#new-document-title', 'Application brief');
    setControl(fixture, '#new-document-type', 'APPLICATION_BRIEF');
    setControl(fixture, '#new-document-content', '# Application brief');
    (
      fixture.nativeElement.querySelector(
        '.create-document-form button[type="submit"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(service.createCommands).toEqual([
      {
        candidateId: null,
        applicationId,
        type: 'APPLICATION_BRIEF',
        title: 'Application brief',
        contentMarkdown: '# Application brief',
      },
    ]);
    expect(fixture.nativeElement.querySelector('#document-title')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain(document.title);
  });

  it('shows a safe creation error and keeps the create form available', async () => {
    const service = new FakeDocumentService();
    service.createResult = throwError(
      () => new Error('private document failure'),
    );
    const fixture = await createDocuments(service);

    (
      fixture.nativeElement.querySelector(
        '.documents-heading .button',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    setControl(fixture, '#new-document-title', 'Notes');
    setControl(fixture, '#new-document-content', '# Notes');
    (
      fixture.nativeElement.querySelector(
        '.create-document-form button[type="submit"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Could not create the document.',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'private document failure',
    );
    expect(fixture.nativeElement.querySelector('#new-document-title')).not.toBeNull();
  });

  it('shows a safe loading error and retries the request', async () => {
    const service = new FakeDocumentService();
    service.listResult = throwError(() => new Error('private backend detail'));
    const fixture = await createDocuments(service);

    expect(fixture.nativeElement.textContent).toContain(
      'Could not load application documents.',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'private backend detail',
    );

    service.listResult = of([summary]);
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.listCalls).toEqual([applicationId, applicationId]);
    expect(fixture.nativeElement.textContent).toContain(summary.title);
  });

  it('offers explicit Cover Letter profile controls without changing brief actions', async () => {
    const generationService = new FakeGenerationService();
    const fixture = await createDocuments(
      new FakeDocumentService(),
      generationService,
    );
    openGenerationOptions(fixture);

    expect(fixture.nativeElement.textContent).toContain('Cover Letter');
    expect(fixture.nativeElement.textContent).toContain('Application Brief');
    expect(fixture.nativeElement.textContent).toContain('Interview Brief');
    expect(fixture.nativeElement.querySelector('#generate-cover-letter-language')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#generate-cover-letter-market')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#generate-cover-letter-sector')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#generate-cover-letter')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#generate-application-brief')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#generate-interview-brief')).not.toBeNull();
    expect(generationService.suggestionCalls).toEqual([applicationId]);
    expect(
      fixture.nativeElement.querySelector('.generation-option:nth-child(2)')
        .textContent,
    ).not.toContain('French');
    expect(
      fixture.nativeElement.querySelector('.generation-option:nth-child(3)')
        .textContent,
    ).not.toContain('French');
  });

  it('loads suggestions once and treats GENERAL as a valid visible preselection', async () => {
    const generationService = new FakeGenerationService();
    generationService.suggestionResult = of({
      market: { value: 'FRANCE', source: 'APPLICATION_LOCATION' },
      sector: { value: 'GENERAL', source: 'DEFAULT_GENERAL' },
    });
    const fixture = await createDocuments(
      new FakeDocumentService(),
      generationService,
    );

    openGenerationOptions(fixture);

    expect(
      (fixture.nativeElement.querySelector(
        '#generate-cover-letter-language',
      ) as HTMLSelectElement).value,
    ).toBe('');
    expect(
      (fixture.nativeElement.querySelector(
        '#generate-cover-letter-market',
      ) as HTMLSelectElement).value,
    ).toBe('FRANCE');
    expect(
      (fixture.nativeElement.querySelector(
        '#generate-cover-letter-sector',
      ) as HTMLSelectElement).value,
    ).toBe('GENERAL');
    expect(fixture.nativeElement.textContent).toContain(
      'Suggested General because no specific sector was identified.',
    );
    expect(
      (fixture.nativeElement.querySelector(
        '#generate-cover-letter',
      ) as HTMLButtonElement).disabled,
    ).toBe(true);

    setControl(fixture, '#generate-cover-letter-language', 'fr');
    expect(
      (fixture.nativeElement.querySelector(
        '#generate-cover-letter',
      ) as HTMLButtonElement).disabled,
    ).toBe(false);

    (
      fixture.nativeElement.querySelector(
        '[aria-controls="generation-options"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    openGenerationOptions(fixture);
    expect(generationService.suggestionCalls).toEqual([applicationId]);
  });

  it('keeps an unresolved suggested market empty and prevents incomplete Generate', async () => {
    const generationService = new FakeGenerationService();
    generationService.suggestionResult = of({
      market: { value: null, source: 'AMBIGUOUS' },
      sector: { value: 'GENERAL', source: 'AMBIGUOUS' },
    });
    const fixture = await createDocuments(
      new FakeDocumentService(),
      generationService,
    );
    openGenerationOptions(fixture);
    setControl(fixture, '#generate-cover-letter-language', 'en');

    const market = fixture.nativeElement.querySelector(
      '#generate-cover-letter-market',
    ) as HTMLSelectElement;
    const button = fixture.nativeElement.querySelector(
      '#generate-cover-letter',
    ) as HTMLButtonElement;
    expect(market.value).toBe('');
    expect(button.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Could not determine the market automatically.',
    );

    button.click();
    fixture.detectChanges();
    expect(generationService.generateCalls).toEqual([]);
  });

  it.each(['UNITED_KINGDOM', 'UNITED_STATES'] as const)(
    'allows French to be submitted independently for %s',
    async (market) => {
      const generationService = new FakeGenerationService();
      const fixture = await createDocuments(
        new FakeDocumentService(),
        generationService,
      );
      openGenerationOptions(fixture);
      setControl(fixture, '#generate-cover-letter-language', 'fr');
      setControl(fixture, '#generate-cover-letter-market', market);
      setControl(fixture, '#generate-cover-letter-sector', 'QUANT_TRADING');

      (
        fixture.nativeElement.querySelector(
          '#generate-cover-letter',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      expect(generationService.generateCalls).toEqual([
        {
          applicationId,
          request: {
            documentType: 'COVER_LETTER',
            outputLanguage: 'fr',
            market,
            sector: 'QUANT_TRADING',
          },
        },
      ]);
    },
  );

  it('does not overwrite manual Market or Sector choices when a late suggestion resolves', async () => {
    const suggestions = new Subject<CoverLetterProfileSuggestion>();
    const generationService = new FakeGenerationService();
    generationService.suggestionResult = suggestions;
    const fixture = await createDocuments(
      new FakeDocumentService(),
      generationService,
    );
    openGenerationOptions(fixture);
    setControl(fixture, '#generate-cover-letter-market', 'UNITED_STATES');
    setControl(fixture, '#generate-cover-letter-sector', 'CONSULTING');

    suggestions.next({
      market: { value: 'UNITED_KINGDOM', source: 'APPLICATION_LOCATION' },
      sector: { value: 'QUANT_TRADING', source: 'ROLE_TITLE' },
    });
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector(
        '#generate-cover-letter-market',
      ) as HTMLSelectElement).value,
    ).toBe('UNITED_STATES');
    expect(
      (fixture.nativeElement.querySelector(
        '#generate-cover-letter-sector',
      ) as HTMLSelectElement).value,
    ).toBe('CONSULTING');
    expect(fixture.nativeElement.textContent).toContain(
      'Your selection will be used.',
    );
  });

  it('keeps manual Cover Letter controls usable when suggestion loading fails', async () => {
    const generationService = new FakeGenerationService();
    generationService.suggestionResult = throwError(
      () => new Error('private suggestion failure'),
    );
    const fixture = await createDocuments(
      new FakeDocumentService(),
      generationService,
    );
    openGenerationOptions(fixture);

    expect(fixture.nativeElement.textContent).toContain(
      'Could not load suggested Cover Letter settings.',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'private suggestion failure',
    );
    setControl(fixture, '#generate-cover-letter-language', 'en');
    setControl(fixture, '#generate-cover-letter-market', 'FRANCE');
    setControl(fixture, '#generate-cover-letter-sector', 'GENERAL');
    (
      fixture.nativeElement.querySelector(
        '#generate-cover-letter',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(generationService.generateCalls[0]?.request).toEqual({
      documentType: 'COVER_LETTER',
      outputLanguage: 'en',
      market: 'FRANCE',
      sector: 'GENERAL',
    });
  });

  it.each([
    {
      selector: '#generate-cover-letter',
      request: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'en',
        market: 'FRANCE',
        sector: 'GENERAL_FINANCE',
      },
      type: 'COVER_LETTER',
    },
    {
      selector: '#generate-cover-letter',
      request: {
        documentType: 'COVER_LETTER',
        outputLanguage: 'fr',
        market: 'UNITED_STATES',
        sector: 'SOFTWARE_TECH',
      },
      type: 'COVER_LETTER',
    },
    {
      selector: '#generate-application-brief',
      request: { documentType: 'APPLICATION_BRIEF' },
      type: 'APPLICATION_BRIEF',
    },
    {
      selector: '#generate-interview-brief',
      request: { documentType: 'INTERVIEW_BRIEF' },
      type: 'INTERVIEW_BRIEF',
    },
  ] as const)('sends the exact Generate request for $type', async (testCase) => {
    const documentService = new FakeDocumentService();
    const generationService = new FakeGenerationService();
    generationService.generateResult = of(generatedResponse(testCase.type));
    const fixture = await createDocuments(documentService, generationService);
    openGenerationOptions(fixture);

    if (testCase.type === 'COVER_LETTER') {
      setControl(
        fixture,
        '#generate-cover-letter-language',
        testCase.request.outputLanguage,
      );
      setControl(
        fixture,
        '#generate-cover-letter-market',
        testCase.request.market,
      );
      setControl(
        fixture,
        '#generate-cover-letter-sector',
        testCase.request.sector,
      );
    }

    (
      fixture.nativeElement.querySelector(testCase.selector) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(generationService.generateCalls).toEqual([
      { applicationId, request: testCase.request },
    ]);
    expect(generationService.regenerateCalls).toEqual([]);
  });

  it('uses the Generate response directly, selects it, renders Markdown, and maps warnings', async () => {
    const documentService = new FakeDocumentService();
    const generationService = new FakeGenerationService();
    generationService.generateResult = of(generatedResponse('APPLICATION_BRIEF'));
    const fixture = await createDocuments(documentService, generationService);
    openGenerationOptions(fixture);

    (
      fixture.nativeElement.querySelector(
        '#generate-application-brief',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedDocumentId()).toBe(documentId);
    expect(fixture.componentInstance.documents()).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.markdown-preview h1')?.textContent).toBe(
      'Generated title',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Generated without Analyze context.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Generated without external Research.',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'NO_ANALYSIS_AVAILABLE',
    );
    expect(generationService.generateCalls).toHaveLength(1);
    expect(documentService.documentCalls).toEqual([]);
  });

  it('prevents duplicate Generate submission while keeping existing content visible', async () => {
    const documentService = new FakeDocumentService();
    const noteSummary: DocumentSummary = {
      ...summary,
      type: 'MARKDOWN_NOTE',
      title: 'Existing notes',
    };
    const noteDocument: WorkspaceDocument = {
      ...document,
      ...noteSummary,
      currentVersion: {
        ...document.currentVersion,
        contentMarkdown: '# Existing notes',
      },
    };
    documentService.listResult = of([noteSummary]);
    documentService.documentResult = of(noteDocument);
    const generationService = new FakeGenerationService();
    generationService.generateResult = new Subject<GenerationResponse>();
    const fixture = await createDocuments(documentService, generationService);
    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    openGenerationOptions(fixture);
    const generateButton = fixture.nativeElement.querySelector(
      '#generate-application-brief',
    ) as HTMLButtonElement;

    generateButton.click();
    generateButton.click();
    fixture.detectChanges();

    expect(generationService.generateCalls).toHaveLength(1);
    expect(generateButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Existing notes');
    expect(fixture.nativeElement.textContent).toContain(
      'Generating Application Brief…',
    );
  });

  it('shows a safe Generate error, clears pending, and inserts no phantom document', async () => {
    const generationService = new FakeGenerationService();
    generationService.generateResult = throwError(
      () =>
        new HttpErrorResponse({
          status: 502,
          error: {
            error: {
              code: 'SCHEMA_VALIDATION_FAILED',
              message: 'private provider detail',
            },
          },
        }),
    );
    const fixture = await createDocuments(
      new FakeDocumentService(),
      generationService,
    );
    openGenerationOptions(fixture);

    (
      fixture.nativeElement.querySelector(
        '#generate-interview-brief',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.generationPendingType()).toBeNull();
    expect(fixture.componentInstance.documents()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain(
      'Generation could not produce usable document content.',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'private provider detail',
    );
  });

  it('opens an existing generated Document instead of knowingly generating a duplicate', async () => {
    const documentService = new FakeDocumentService();
    documentService.listResult = of([summary]);
    const generationService = new FakeGenerationService();
    const fixture = await createDocuments(documentService, generationService);
    openGenerationOptions(fixture);

    const openButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.generation-option button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent.includes('Open existing')) as HTMLButtonElement;
    openButton.click();
    fixture.detectChanges();

    expect(generationService.generateCalls).toEqual([]);
    expect(documentService.documentCalls).toEqual([documentId]);
    expect(fixture.nativeElement.querySelector('#regenerate-cover-letter')).not.toBeNull();
  });

  it('refreshes and opens an existing Document after a stale-state conflict without retrying Generation', async () => {
    const documentService = new FakeDocumentService();
    const generationService = new FakeGenerationService();
    const pending = new Subject<GenerationResponse>();
    generationService.generateResult = pending;
    const fixture = await createDocuments(documentService, generationService);
    openGenerationOptions(fixture);
    setControl(fixture, '#generate-cover-letter-language', 'en');
    setControl(fixture, '#generate-cover-letter-market', 'UNITED_KINGDOM');
    setControl(fixture, '#generate-cover-letter-sector', 'QUANT_TRADING');
    (
      fixture.nativeElement.querySelector(
        '#generate-cover-letter',
      ) as HTMLButtonElement
    ).click();
    documentService.listResult = of([summary]);

    pending.error(
      new HttpErrorResponse({
        status: 409,
        error: { error: { code: 'DOCUMENT_ALREADY_EXISTS' } },
      }),
    );
    fixture.detectChanges();

    expect(generationService.generateCalls).toHaveLength(1);
    expect(documentService.listCalls).toEqual([applicationId, applicationId]);
    expect(documentService.documentCalls).toEqual([documentId]);
    expect(fixture.componentInstance.selectedDocumentId()).toBe(documentId);
  });

  it('prefills Regenerate from the selected adaptive current-version profile', async () => {
    const documentService = new FakeDocumentService();
    documentService.listResult = of([summary]);
    const generationService = new FakeGenerationService();
    const fixture = await createDocuments(documentService, generationService);
    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter-language',
      ) as HTMLSelectElement).value,
    ).toBe('en');
    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter-market',
      ) as HTMLSelectElement).value,
    ).toBe('UNITED_KINGDOM');
    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter-sector',
      ) as HTMLSelectElement).value,
    ).toBe('QUANT_TRADING');
    expect(fixture.nativeElement.textContent).toContain(
      'From the current version.',
    );
    expect(generationService.suggestionCalls).toEqual([]);
  });

  it('uses explicit Regenerate overrides instead of adaptive metadata', async () => {
    const documentService = new FakeDocumentService();
    documentService.listResult = of([summary]);
    const generationService = new FakeGenerationService();
    const fixture = await createDocuments(documentService, generationService);
    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    setControl(fixture, '#regenerate-cover-letter-language', 'fr');
    setControl(fixture, '#regenerate-cover-letter-market', 'UNITED_STATES');
    setControl(fixture, '#regenerate-cover-letter-sector', 'GENERAL');

    (
      fixture.nativeElement.querySelector(
        '#regenerate-cover-letter',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(generationService.regenerateCalls).toEqual([
      {
        applicationId,
        documentId,
        request: {
          outputLanguage: 'fr',
          market: 'UNITED_STATES',
          sector: 'GENERAL',
        },
      },
    ]);
  });

  it('uses language metadata plus suggestions for a pre-10.7 Regenerate profile', async () => {
    const legacyDocument: WorkspaceDocument = {
      ...document,
      currentVersion: {
        ...document.currentVersion,
        coverLetterProfile: { outputLanguage: 'fr' },
      },
    };
    const documentService = new FakeDocumentService();
    documentService.listResult = of([summary]);
    documentService.documentResult = of(legacyDocument);
    const generationService = new FakeGenerationService();
    generationService.suggestionResult = of({
      market: { value: 'FRANCE', source: 'APPLICATION_LOCATION' },
      sector: { value: 'GENERAL', source: 'DEFAULT_GENERAL' },
    });
    const fixture = await createDocuments(documentService, generationService);
    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter-language',
      ) as HTMLSelectElement).value,
    ).toBe('fr');
    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter-market',
      ) as HTMLSelectElement).value,
    ).toBe('FRANCE');
    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter-sector',
      ) as HTMLSelectElement).value,
    ).toBe('GENERAL');
    expect(generationService.suggestionCalls).toEqual([applicationId]);
    expect(fixture.nativeElement.querySelector('#document-content')).not.toBeNull();
  });

  it('requires a manual Market for pre-10.7 Regenerate when suggestion is unresolved', async () => {
    const legacyDocument: WorkspaceDocument = {
      ...document,
      currentVersion: {
        ...document.currentVersion,
        coverLetterProfile: { outputLanguage: 'en' },
      },
    };
    const documentService = new FakeDocumentService();
    documentService.listResult = of([summary]);
    documentService.documentResult = of(legacyDocument);
    const generationService = new FakeGenerationService();
    generationService.suggestionResult = of({
      market: { value: null, source: 'NONE' },
      sector: { value: 'GENERAL', source: 'DEFAULT_GENERAL' },
    });
    const fixture = await createDocuments(documentService, generationService);
    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter-market',
      ) as HTMLSelectElement).value,
    ).toBe('');
    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter',
      ) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(generationService.regenerateCalls).toEqual([]);
  });

  it('rehydrates Regenerate controls when a new adaptive current version is applied', async () => {
    const documentService = new FakeDocumentService();
    documentService.listResult = of([summary]);
    const fixture = await createDocuments(documentService);
    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement).click();
    fixture.detectChanges();

    fixture.componentInstance.documentSaved({
      ...document,
      currentVersionId: '50000000-0000-4000-8000-000000000000',
      currentVersion: {
        ...document.currentVersion,
        id: '50000000-0000-4000-8000-000000000000',
        coverLetterProfile: {
          outputLanguage: 'fr',
          market: 'UNITED_STATES',
          sector: 'CONSULTING',
        },
      },
    });
    fixture.detectChanges();

    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter-language',
      ) as HTMLSelectElement).value,
    ).toBe('fr');
    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter-market',
      ) as HTMLSelectElement).value,
    ).toBe('UNITED_STATES');
    expect(
      (fixture.nativeElement.querySelector(
        '#regenerate-cover-letter-sector',
      ) as HTMLSelectElement).value,
    ).toBe('CONSULTING');
  });

  it.each([
    {
      type: 'COVER_LETTER',
      selector: '#regenerate-cover-letter',
      request: {
        outputLanguage: 'en',
        market: 'UNITED_KINGDOM',
        sector: 'QUANT_TRADING',
      },
    },
    {
      type: 'COVER_LETTER',
      selector: '#regenerate-cover-letter',
      request: {
        outputLanguage: 'fr',
        market: 'UNITED_STATES',
        sector: 'GENERAL',
      },
    },
    {
      type: 'APPLICATION_BRIEF',
      selector: '#regenerate-brief',
      request: {},
    },
    {
      type: 'INTERVIEW_BRIEF',
      selector: '#regenerate-brief',
      request: {},
    },
  ] as const)('sends the exact Regenerate request for $type', async (testCase) => {
    const documentService = new FakeDocumentService();
    const selectedSummary = { ...summary, type: testCase.type };
    const selectedDocument = { ...document, type: testCase.type };
    documentService.listResult = of([selectedSummary]);
    documentService.documentResult = of(selectedDocument);
    const generationService = new FakeGenerationService();
    generationService.regenerateResult = of(
      generatedResponse(
        testCase.type,
        '40000000-0000-4000-8000-000000000000',
      ),
    );
    const fixture = await createDocuments(documentService, generationService);
    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement).click();
    fixture.detectChanges();

    if (testCase.type === 'COVER_LETTER') {
      setControl(
        fixture,
        '#regenerate-cover-letter-language',
        testCase.request.outputLanguage,
      );
      setControl(
        fixture,
        '#regenerate-cover-letter-market',
        testCase.request.market,
      );
      setControl(
        fixture,
        '#regenerate-cover-letter-sector',
        testCase.request.sector,
      );
    }

    (
      fixture.nativeElement.querySelector(testCase.selector) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(generationService.regenerateCalls).toEqual([
      { applicationId, documentId, request: testCase.request },
    ]);
    expect(generationService.regenerateCalls[0]?.request).not.toHaveProperty(
      'contentMarkdown',
    );
  });

  it('applies a regenerated current version to the same selection and refreshes history', async () => {
    const documentService = new FakeDocumentService();
    documentService.listResult = of([summary]);
    const generationService = new FakeGenerationService();
    const fixture = await createDocuments(documentService, generationService);
    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    const callsBeforeRegenerate = documentService.versionListCalls.length;
    const regeneratedVersion = generatedResponse(
      'COVER_LETTER',
      '40000000-0000-4000-8000-000000000000',
    ).currentVersion;
    documentService.versionsResult = of([
      regeneratedVersion,
      document.currentVersion,
    ]);

    (
      fixture.nativeElement.querySelector(
        '#regenerate-cover-letter',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedDocumentId()).toBe(documentId);
    expect(fixture.componentInstance.selectedDocument()?.currentVersionId).toBe(
      '40000000-0000-4000-8000-000000000000',
    );
    expect(
      (fixture.nativeElement.querySelector(
        '#document-content',
      ) as HTMLTextAreaElement).value,
    ).toContain('Generated content');
    expect(documentService.versionListCalls.length).toBeGreaterThan(
      callsBeforeRegenerate,
    );
    expect(
      fixture.nativeElement.querySelectorAll('.version-card'),
    ).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('Version 2');
    expect(fixture.nativeElement.textContent).toContain('Version 1');
    expect(fixture.nativeElement.textContent).toContain(
      'Generated without external Research.',
    );
  });

  it('keeps the previous current version visible and prevents duplicate Regenerate submission while pending', async () => {
    const documentService = new FakeDocumentService();
    documentService.listResult = of([summary]);
    const generationService = new FakeGenerationService();
    generationService.regenerateResult = new Subject<GenerationResponse>();
    const fixture = await createDocuments(documentService, generationService);
    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    const regenerateButton = fixture.nativeElement.querySelector(
      '#regenerate-cover-letter',
    ) as HTMLButtonElement;

    regenerateButton.click();
    regenerateButton.click();
    fixture.detectChanges();

    expect(generationService.regenerateCalls).toHaveLength(1);
    expect(regenerateButton.disabled).toBe(true);
    expect(
      (fixture.nativeElement.querySelector(
        '#document-content',
      ) as HTMLTextAreaElement).value,
    ).toBe(document.currentVersion.contentMarkdown);
    expect(fixture.nativeElement.textContent).toContain(
      'The current version remains available until this completes.',
    );
  });

  it('preserves the old current version and history when Regenerate fails', async () => {
    const documentService = new FakeDocumentService();
    documentService.listResult = of([summary]);
    const generationService = new FakeGenerationService();
    generationService.regenerateResult = throwError(
      () =>
        new HttpErrorResponse({
          status: 503,
          error: { error: { code: 'USAGE_CHECK_FAILED' } },
        }),
    );
    const fixture = await createDocuments(documentService, generationService);
    (fixture.nativeElement.querySelector('.document-card') as HTMLButtonElement).click();
    fixture.detectChanges();
    const historyCalls = [...documentService.versionListCalls];

    (
      fixture.nativeElement.querySelector(
        '#regenerate-cover-letter',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.regenerationPending()).toBe(false);
    expect(fixture.componentInstance.selectedDocument()?.currentVersionId).toBe(
      versionId,
    );
    expect(
      (fixture.nativeElement.querySelector(
        '#document-content',
      ) as HTMLTextAreaElement).value,
    ).toBe(document.currentVersion.contentMarkdown);
    expect(documentService.versionListCalls).toEqual(historyCalls);
    expect(fixture.nativeElement.textContent).toContain(
      'Generation is temporarily unavailable.',
    );
  });

  it('renders APPLICATION_BRIEF as a human-readable type label', async () => {
    const documentService = new FakeDocumentService();
    documentService.listResult = of([
      { ...summary, type: 'APPLICATION_BRIEF', title: 'Opportunity dossier' },
    ]);
    const fixture = await createDocuments(documentService);

    expect(fixture.nativeElement.textContent).toContain('Application Brief');
    expect(fixture.nativeElement.textContent).not.toContain(
      'APPLICATION_BRIEF',
    );
  });

  it.each(['APPLICATION_BRIEF', 'INTERVIEW_BRIEF'] as const)(
    'keeps adaptive controls hidden for a selected %s',
    async (type) => {
      const documentService = new FakeDocumentService();
      documentService.listResult = of([{ ...summary, type }]);
      documentService.documentResult = of({ ...document, type });
      const generationService = new FakeGenerationService();
      const fixture = await createDocuments(
        documentService,
        generationService,
      );

      (
        fixture.nativeElement.querySelector(
          '.document-card',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector(
          '#regenerate-cover-letter-language',
        ),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('#regenerate-cover-letter-market'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('#regenerate-cover-letter-sector'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('#regenerate-brief'),
      ).not.toBeNull();
      expect(generationService.suggestionCalls).toEqual([]);
    },
  );
});
