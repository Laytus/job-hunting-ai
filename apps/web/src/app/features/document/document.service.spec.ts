import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import type {
  CreateDocumentRequest,
  CreateDocumentVersionRequest,
  Document,
  DocumentSummary,
  UpdateDocumentMetadataRequest,
} from './document.models';
import { DocumentService } from './document.service';

const applicationId = '10000000-0000-4000-8000-000000000000';
const documentId = '20000000-0000-4000-8000-000000000000';
const versionId = '30000000-0000-4000-8000-000000000000';

const summary: DocumentSummary = {
  id: documentId,
  type: 'COVER_LETTER',
  title: 'Tailored cover letter',
  currentVersionId: versionId,
  createdAt: '2026-08-22T10:00:00.000Z',
  updatedAt: '2026-08-22T11:00:00.000Z',
};

const document: Document = {
  ...summary,
  candidateId: null,
  applicationId,
  currentVersion: {
    id: versionId,
    documentId,
    contentMarkdown: '# Tailored cover letter',
    createdAt: '2026-08-22T11:00:00.000Z',
  },
};

const apiDocument = {
  ...document,
  currentVersion: {
    ...document.currentVersion,
    metadata: { futureProviderContext: 'must not cross the frontend boundary' },
  },
};

describe('DocumentService', () => {
  let service: DocumentService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DocumentService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  it('loads Application Document summaries with GET', async () => {
    const result = firstValueFrom(service.getApplicationDocuments(applicationId));
    const request = httpController.expectOne(
      `/api/v1/applications/${applicationId}/documents`,
    );

    expect(request.request.method).toBe('GET');
    request.flush({ documents: [summary] });
    await expect(result).resolves.toEqual([summary]);
  });

  it('loads a Document detail and removes backend metadata', async () => {
    const result = firstValueFrom(service.getDocument(documentId));
    const request = httpController.expectOne(`/api/v1/documents/${documentId}`);

    expect(request.request.method).toBe('GET');
    request.flush({ document: apiDocument });
    await expect(result).resolves.toEqual(document);
    expect('metadata' in (await result).currentVersion).toBe(false);
  });

  it('retains only valid Cover Letter profile fields from version metadata', async () => {
    const result = firstValueFrom(service.getDocument(documentId));
    const request = httpController.expectOne(`/api/v1/documents/${documentId}`);

    request.flush({
      document: {
        ...apiDocument,
        currentVersion: {
          ...apiDocument.currentVersion,
          metadata: {
            generation: {
              outputLanguage: 'fr',
              coverLetterMarket: 'UNITED_KINGDOM',
              coverLetterSector: 'QUANT_TRADING',
              promptVersion: 'cover-letter-v2',
              providerPayload: 'must remain private',
            },
          },
        },
      },
    });

    await expect(result).resolves.toMatchObject({
      currentVersion: {
        coverLetterProfile: {
          outputLanguage: 'fr',
          market: 'UNITED_KINGDOM',
          sector: 'QUANT_TRADING',
        },
      },
    });
    expect(JSON.stringify(await result)).not.toContain('providerPayload');
    expect(JSON.stringify(await result)).not.toContain('promptVersion');
  });

  it('safely ignores malformed and pre-adaptive metadata fields', async () => {
    const result = firstValueFrom(service.getDocument(documentId));
    const request = httpController.expectOne(`/api/v1/documents/${documentId}`);

    request.flush({
      document: {
        ...apiDocument,
        currentVersion: {
          ...apiDocument.currentVersion,
          metadata: {
            generation: {
              outputLanguage: 'de',
              coverLetterMarket: 'CANADA',
              coverLetterSector: 42,
              promptVersion: 'cover-letter-v1',
            },
          },
        },
      },
    });

    expect((await result).currentVersion.coverLetterProfile).toBeUndefined();
  });

  it('loads Document versions with GET and removes backend metadata', async () => {
    const result = firstValueFrom(service.getDocumentVersions(documentId));
    const request = httpController.expectOne(
      `/api/v1/documents/${documentId}/versions`,
    );

    expect(request.request.method).toBe('GET');
    request.flush({ versions: [apiDocument.currentVersion] });
    await expect(result).resolves.toEqual([document.currentVersion]);
    expect('metadata' in (await result)[0]).toBe(false);
  });

  it('creates a Document with POST', async () => {
    const command: CreateDocumentRequest = {
      candidateId: null,
      applicationId,
      type: 'COVER_LETTER',
      title: 'Tailored cover letter',
      contentMarkdown: '# Tailored cover letter',
    };
    const result = firstValueFrom(service.createDocument(command));
    const request = httpController.expectOne('/api/v1/documents');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(command);
    expect(request.request.body).not.toHaveProperty('metadata');
    request.flush({ document: apiDocument });
    await expect(result).resolves.toEqual(document);
  });

  it('updates Document metadata with PUT', async () => {
    const command: UpdateDocumentMetadataRequest = {
      type: 'INTERVIEW_BRIEF',
      title: 'Interview brief',
    };
    const result = firstValueFrom(
      service.updateDocumentMetadata(documentId, command),
    );
    const request = httpController.expectOne(`/api/v1/documents/${documentId}`);

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(command);
    request.flush({ document: apiDocument });
    await expect(result).resolves.toEqual(document);
  });

  it('creates a new Document version with POST', async () => {
    const command: CreateDocumentVersionRequest = {
      contentMarkdown: '# Revised cover letter',
    };
    const result = firstValueFrom(service.createDocumentVersion(documentId, command));
    const request = httpController.expectOne(
      `/api/v1/documents/${documentId}/versions`,
    );

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(command);
    expect(request.request.body).not.toHaveProperty('metadata');
    request.flush({ document: apiDocument });
    await expect(result).resolves.toEqual(document);
  });
});
