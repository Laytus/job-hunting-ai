import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import type {
  CreateDocumentVersionRequest,
  Document as WorkspaceDocument,
  DocumentVersion,
  UpdateDocumentMetadataRequest,
} from '../document.models';
import { DocumentService } from '../document.service';
import { DocumentEditor } from './document-editor';

const documentId = '20000000-0000-4000-8000-000000000000';
const document: WorkspaceDocument = {
  id: documentId,
  candidateId: null,
  applicationId: '10000000-0000-4000-8000-000000000000',
  type: 'COVER_LETTER',
  title: 'Platform Engineer cover letter',
  currentVersionId: '30000000-0000-4000-8000-000000000000',
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-22T12:30:00.000Z',
  currentVersion: {
    id: '30000000-0000-4000-8000-000000000000',
    documentId,
    contentMarkdown: '# Platform Engineer cover letter',
    createdAt: '2026-08-22T12:30:00.000Z',
  },
};

class FakeDocumentService {
  metadataResult: Observable<WorkspaceDocument> = of(document);
  versionResult: Observable<WorkspaceDocument> = of(document);
  versionsResult: Observable<DocumentVersion[]> = of([document.currentVersion]);
  readonly metadataCalls: {
    readonly id: string;
    readonly command: UpdateDocumentMetadataRequest;
  }[] = [];
  readonly versionCalls: {
    readonly id: string;
    readonly command: CreateDocumentVersionRequest;
  }[] = [];
  readonly versionListCalls: string[] = [];

  getDocumentVersions(id: string): Observable<DocumentVersion[]> {
    this.versionListCalls.push(id);
    return this.versionsResult;
  }

  updateDocumentMetadata(
    id: string,
    command: UpdateDocumentMetadataRequest,
  ): Observable<WorkspaceDocument> {
    this.metadataCalls.push({ id, command });
    return this.metadataResult;
  }

  createDocumentVersion(
    id: string,
    command: CreateDocumentVersionRequest,
  ): Observable<WorkspaceDocument> {
    this.versionCalls.push({ id, command });
    return this.versionResult;
  }
}

async function createEditor(
  service: FakeDocumentService,
  selectedDocument: WorkspaceDocument = document,
): Promise<ComponentFixture<DocumentEditor>> {
  await TestBed.configureTestingModule({
    imports: [DocumentEditor],
    providers: [{ provide: DocumentService, useValue: service }],
  }).compileComponents();
  const fixture = TestBed.createComponent(DocumentEditor);
  fixture.componentRef.setInput('document', selectedDocument);
  fixture.detectChanges();
  return fixture;
}

function setControl(
  fixture: ComponentFixture<DocumentEditor>,
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

describe('DocumentEditor', () => {
  it('renders the selected document metadata and current Markdown', async () => {
    const service = new FakeDocumentService();
    const fixture = await createEditor(service);

    expect(
      (fixture.nativeElement.querySelector('#document-title') as HTMLInputElement)
        .value,
    ).toBe(document.title);
    expect(
      (fixture.nativeElement.querySelector('#document-type') as HTMLSelectElement)
        .value,
    ).toBe(document.type);
    expect(
      (fixture.nativeElement.querySelector(
        '#document-content',
      ) as HTMLTextAreaElement).value,
    ).toBe(document.currentVersion.contentMarkdown);
    expect(fixture.nativeElement.textContent).toContain('Version history');
    expect(fixture.nativeElement.querySelector('.markdown-preview h1')?.textContent).toBe(
      'Platform Engineer cover letter',
    );
    expect(service.versionListCalls).toEqual([documentId]);
  });

  it('defaults existing content to Preview and preserves a draft across pane switches', async () => {
    const fixture = await createEditor(new FakeDocumentService());
    const workspace = fixture.nativeElement.querySelector(
      '.content-workspace',
    ) as HTMLElement;
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.editor-pane-toggle button',
      ) as NodeListOf<HTMLButtonElement>,
    );
    const editButton = buttons.find((button) =>
      button.textContent?.includes('Edit'),
    );
    const previewButton = buttons.find((button) =>
      button.textContent?.includes('Preview'),
    );

    const editPane = workspace.querySelector(
      '.editor-pane--edit',
    ) as HTMLElement;
    const previewPane = workspace.querySelector(
      '.editor-pane--preview',
    ) as HTMLElement;

    expect(workspace.dataset['activePane']).toBe('preview');
    expect(editPane.hidden).toBe(true);
    expect(previewPane.hidden).toBe(false);

    editButton?.click();
    fixture.detectChanges();
    expect(workspace.dataset['activePane']).toBe('edit');
    expect(editPane.hidden).toBe(false);
    expect(previewPane.hidden).toBe(true);
    setControl(fixture, '#document-content', '# Unsaved mobile draft');
    previewButton?.click();
    fixture.detectChanges();

    expect(workspace.dataset['activePane']).toBe('preview');
    expect(editPane.hidden).toBe(true);
    expect(previewPane.hidden).toBe(false);
    expect(
      (fixture.nativeElement.querySelector(
        '#document-content',
      ) as HTMLTextAreaElement).value,
    ).toBe('# Unsaved mobile draft');
    expect(fixture.nativeElement.querySelector('.markdown-preview h1')?.textContent).toBe(
      'Unsaved mobile draft',
    );

    editButton?.click();
    fixture.detectChanges();
    expect(workspace.dataset['activePane']).toBe('edit');
    expect(editPane.hidden).toBe(false);
    expect(previewPane.hidden).toBe(true);
    expect(
      (fixture.nativeElement.querySelector(
        '#document-content',
      ) as HTMLTextAreaElement).value,
    ).toBe('# Unsaved mobile draft');
  });

  it('defaults a blank Document to the full-width Edit pane', async () => {
    const blankDocument: WorkspaceDocument = {
      ...document,
      currentVersion: {
        ...document.currentVersion,
        contentMarkdown: '   ',
      },
    };
    const fixture = await createEditor(
      new FakeDocumentService(),
      blankDocument,
    );
    const workspace = fixture.nativeElement.querySelector(
      '.content-workspace',
    ) as HTMLElement;

    expect(workspace.dataset['activePane']).toBe('edit');
    expect(
      (workspace.querySelector('.editor-pane--edit') as HTMLElement).hidden,
    ).toBe(false);
    expect(
      (workspace.querySelector('.editor-pane--preview') as HTMLElement).hidden,
    ).toBe(true);
  });

  it('applies a new current version for the same Document to the editor and safe Markdown preview', async () => {
    const service = new FakeDocumentService();
    const fixture = await createEditor(service);
    const regeneratedDocument: WorkspaceDocument = {
      ...document,
      currentVersionId: '40000000-0000-4000-8000-000000000000',
      currentVersion: {
        id: '40000000-0000-4000-8000-000000000000',
        documentId,
        contentMarkdown:
          '# Regenerated cover letter\n\n<script>unsafe()</script>',
        createdAt: '2026-08-28T12:00:00.000Z',
      },
    };

    fixture.componentRef.setInput('document', regeneratedDocument);
    fixture.detectChanges();

    expect(fixture.componentInstance.activePane()).toBe('preview');
    expect(
      (fixture.nativeElement.querySelector(
        '#document-content',
      ) as HTMLTextAreaElement).value,
    ).toBe(regeneratedDocument.currentVersion.contentMarkdown);
    expect(fixture.nativeElement.querySelector('.markdown-preview h1')?.textContent).toBe(
      'Regenerated cover letter',
    );
    expect(fixture.nativeElement.querySelector('.markdown-preview script')).toBeNull();
    expect(fixture.nativeElement.querySelector('.markdown-preview').textContent).toContain(
      '<script>unsafe()</script>',
    );
  });

  it('updates metadata separately and emits the saved document', async () => {
    const service = new FakeDocumentService();
    const savedDocument = {
      ...document,
      title: 'Application brief',
      type: 'APPLICATION_BRIEF' as const,
    };
    service.metadataResult = of(savedDocument);
    const fixture = await createEditor(service);
    const saved: WorkspaceDocument[] = [];
    fixture.componentInstance.saved.subscribe((value) => saved.push(value));

    setControl(fixture, '#document-title', 'Application brief');
    setControl(fixture, '#document-type', 'APPLICATION_BRIEF');
    (
      fixture.nativeElement.querySelector(
        '#save-document-details',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(service.metadataCalls).toEqual([
      {
        id: documentId,
        command: { title: 'Application brief', type: 'APPLICATION_BRIEF' },
      },
    ]);
    expect(service.versionCalls).toEqual([]);
    expect(saved).toEqual([savedDocument]);
    expect(fixture.nativeElement.textContent).toContain(
      'Document details saved.',
    );
  });

  it('creates an append-only version separately and emits the result', async () => {
    const service = new FakeDocumentService();
    const savedDocument: WorkspaceDocument = {
      ...document,
      currentVersionId: '40000000-0000-4000-8000-000000000000',
      currentVersion: {
        id: '40000000-0000-4000-8000-000000000000',
        documentId,
        contentMarkdown: '# Revised cover letter',
        createdAt: '2026-08-22T13:00:00.000Z',
      },
    };
    service.versionResult = of(savedDocument);
    const fixture = await createEditor(service);
    const saved: WorkspaceDocument[] = [];
    fixture.componentInstance.saved.subscribe((value) => saved.push(value));

    setControl(fixture, '#document-content', '# Revised cover letter');
    (
      fixture.nativeElement.querySelector(
        '#save-document-version',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(service.versionCalls).toEqual([
      {
        id: documentId,
        command: { contentMarkdown: '# Revised cover letter' },
      },
    ]);
    expect(service.metadataCalls).toEqual([]);
    expect(saved).toEqual([savedDocument]);
    expect(fixture.nativeElement.textContent).toContain(
      'New document version saved.',
    );
  });

  it('applies a successful restore without overwriting unsaved metadata', async () => {
    const historicalVersion: DocumentVersion = {
      id: '10000000-0000-4000-8000-000000000000',
      documentId,
      contentMarkdown: '# Historical cover letter',
      createdAt: '2026-08-20T11:00:00.000Z',
    };
    const restoredDocument: WorkspaceDocument = {
      ...document,
      currentVersionId: '40000000-0000-4000-8000-000000000000',
      currentVersion: {
        id: '40000000-0000-4000-8000-000000000000',
        documentId,
        contentMarkdown: historicalVersion.contentMarkdown,
        createdAt: '2026-08-23T10:00:00.000Z',
      },
    };
    const service = new FakeDocumentService();
    service.versionsResult = of([document.currentVersion, historicalVersion]);
    service.versionResult = of(restoredDocument);
    const fixture = await createEditor(service);
    const saved: WorkspaceDocument[] = [];
    fixture.componentInstance.saved.subscribe((value) => saved.push(value));

    setControl(fixture, '#document-title', 'Unsaved title draft');
    const versionButtons = fixture.nativeElement.querySelectorAll(
      '.version-card',
    ) as NodeListOf<HTMLButtonElement>;
    versionButtons[1].click();
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '.restore-button',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(service.versionCalls).toEqual([
      {
        id: documentId,
        command: { contentMarkdown: historicalVersion.contentMarkdown },
      },
    ]);
    expect(
      (fixture.nativeElement.querySelector('#document-title') as HTMLInputElement)
        .value,
    ).toBe('Unsaved title draft');
    expect(
      (fixture.nativeElement.querySelector(
        '#document-content',
      ) as HTMLTextAreaElement).value,
    ).toBe(historicalVersion.contentMarkdown);
    expect(saved).toEqual([restoredDocument]);
    expect(fixture.nativeElement.textContent).toContain(
      'Historical version restored.',
    );
  });

  it('shows safe errors for metadata and content save failures', async () => {
    const service = new FakeDocumentService();
    service.metadataResult = throwError(
      () => new Error('private metadata failure'),
    );
    service.versionResult = throwError(
      () => new Error('private version failure'),
    );
    const fixture = await createEditor(service);

    (
      fixture.nativeElement.querySelector(
        '#save-document-details',
      ) as HTMLButtonElement
    ).click();
    (
      fixture.nativeElement.querySelector(
        '#save-document-version',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Could not save document details.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Could not save document content.',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'private metadata failure',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'private version failure',
    );
  });
});
