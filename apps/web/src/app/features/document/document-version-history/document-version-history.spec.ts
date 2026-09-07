import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import type {
  CreateDocumentVersionRequest,
  Document as WorkspaceDocument,
  DocumentVersion,
} from '../document.models';
import { DocumentService } from '../document.service';
import { DocumentVersionHistory } from './document-version-history';

const documentId = '10000000-0000-4000-8000-000000000000';
const currentVersion: DocumentVersion = {
  id: '40000000-0000-4000-8000-000000000000',
  documentId,
  contentMarkdown: '# Current content',
  createdAt: '2026-08-25T18:30:00.000Z',
};
const previousVersion: DocumentVersion = {
  id: '30000000-0000-4000-8000-000000000000',
  documentId,
  contentMarkdown: '# Previous content',
  createdAt: '2026-08-24T10:15:00.000Z',
};
const firstVersion: DocumentVersion = {
  id: '20000000-0000-4000-8000-000000000000',
  documentId,
  contentMarkdown: '# First content',
  createdAt: '2026-08-22T14:20:00.000Z',
};
const restoredVersion: DocumentVersion = {
  id: '50000000-0000-4000-8000-000000000000',
  documentId,
  contentMarkdown: previousVersion.contentMarkdown,
  createdAt: '2026-08-26T09:00:00.000Z',
};
const restoredDocument: WorkspaceDocument = {
  id: documentId,
  candidateId: null,
  applicationId: '60000000-0000-4000-8000-000000000000',
  type: 'MARKDOWN_NOTE',
  title: 'Application notes',
  currentVersionId: restoredVersion.id,
  createdAt: '2026-08-22T14:20:00.000Z',
  updatedAt: restoredVersion.createdAt,
  currentVersion: restoredVersion,
};

class FakeDocumentService {
  versionsResult: Observable<DocumentVersion[]> = of([
    currentVersion,
    previousVersion,
    firstVersion,
  ]);
  restoreResult: Observable<WorkspaceDocument> = of(restoredDocument);
  readonly versionListCalls: string[] = [];
  readonly restoreCalls: {
    readonly id: string;
    readonly command: CreateDocumentVersionRequest;
  }[] = [];

  getDocumentVersions(id: string): Observable<DocumentVersion[]> {
    this.versionListCalls.push(id);
    return this.versionsResult;
  }

  createDocumentVersion(
    id: string,
    command: CreateDocumentVersionRequest,
  ): Observable<WorkspaceDocument> {
    this.restoreCalls.push({ id, command });
    return this.restoreResult;
  }
}

async function createHistory(
  service: FakeDocumentService,
): Promise<ComponentFixture<DocumentVersionHistory>> {
  await TestBed.configureTestingModule({
    imports: [DocumentVersionHistory],
    providers: [{ provide: DocumentService, useValue: service }],
  }).compileComponents();
  const fixture = TestBed.createComponent(DocumentVersionHistory);
  fixture.componentRef.setInput('documentId', documentId);
  fixture.componentRef.setInput('currentVersionId', currentVersion.id);
  fixture.detectChanges();
  return fixture;
}

function versionButtons(
  fixture: ComponentFixture<DocumentVersionHistory>,
): HTMLButtonElement[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll(
      '.version-card',
    ) as NodeListOf<HTMLButtonElement>,
  );
}

describe('DocumentVersionHistory', () => {
  it('renders a loading state while versions are requested', async () => {
    const service = new FakeDocumentService();
    service.versionsResult = new Subject<DocumentVersion[]>();
    const fixture = await createHistory(service);

    expect(fixture.nativeElement.textContent).toContain(
      'Loading version history…',
    );
    expect(service.versionListCalls).toEqual([documentId]);
  });

  it('renders an empty state when no versions are returned', async () => {
    const service = new FakeDocumentService();
    service.versionsResult = of([]);
    const fixture = await createHistory(service);

    expect(fixture.nativeElement.textContent).toContain(
      'No document versions are available.',
    );
  });

  it('renders ordered versions and marks the current version', async () => {
    const fixture = await createHistory(new FakeDocumentService());
    const buttons = versionButtons(fixture);

    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toContain('Version 3');
    expect(buttons[0].textContent).toContain('Current');
    expect(buttons[1].textContent).toContain('Version 2');
    expect(buttons[2].textContent).toContain('Version 1');
    expect((buttons[0].querySelector('time') as HTMLTimeElement).dateTime).toBe(
      currentVersion.createdAt,
    );
  });

  it('selects a historical version and previews Markdown as text', async () => {
    const fixture = await createHistory(new FakeDocumentService());

    versionButtons(fixture)[1].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('pre')?.textContent).toBe(
      previousVersion.contentMarkdown,
    );
    expect(fixture.nativeElement.textContent).toContain('Restore this version');
    expect(fixture.nativeElement.querySelector('pre')?.querySelector('*')).toBeNull();
  });

  it('restores historical content by creating a new append-only version', async () => {
    const service = new FakeDocumentService();
    const fixture = await createHistory(service);
    const restored: WorkspaceDocument[] = [];
    fixture.componentInstance.restored.subscribe((value) => restored.push(value));

    versionButtons(fixture)[1].click();
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '.restore-button',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(service.restoreCalls).toEqual([
      {
        id: documentId,
        command: { contentMarkdown: previousVersion.contentMarkdown },
      },
    ]);
    expect(restored).toEqual([restoredDocument]);
    expect(versionButtons(fixture)).toHaveLength(4);
    expect(versionButtons(fixture)[0].textContent).toContain('Version 4');
    expect(versionButtons(fixture)[0].textContent).toContain('Current');
    expect(fixture.nativeElement.textContent).toContain(
      'Version restored as a new current version.',
    );
  });

  it('shows a safe load error and retries', async () => {
    const service = new FakeDocumentService();
    service.versionsResult = throwError(
      () => new Error('private version list failure'),
    );
    const fixture = await createHistory(service);

    expect(fixture.nativeElement.textContent).toContain(
      'Could not load document versions.',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'private version list failure',
    );

    service.versionsResult = of([currentVersion]);
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.versionListCalls).toEqual([documentId, documentId]);
    expect(versionButtons(fixture)).toHaveLength(1);
  });

  it('shows a safe restore error without mutating the version list', async () => {
    const service = new FakeDocumentService();
    service.restoreResult = throwError(
      () => new Error('private restore failure'),
    );
    const fixture = await createHistory(service);

    versionButtons(fixture)[1].click();
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '.restore-button',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Could not restore this document version.',
    );
    expect(fixture.nativeElement.textContent).not.toContain(
      'private restore failure',
    );
    expect(versionButtons(fixture)).toHaveLength(3);
  });
});
