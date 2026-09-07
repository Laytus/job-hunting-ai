import { describe, expect, it } from 'vitest';
import {
  DocumentApplicationNotFoundError,
  DocumentNotFoundError,
  DocumentOwnerNotFoundError,
  InvalidDocumentDataError,
  InvalidDocumentIdentifierError,
} from '../src/document/document.errors.js';
import {
  DocumentService,
  type DocumentPersistence,
} from '../src/document/document.service.js';
import type {
  CreateDocumentCommand,
  CreateDocumentVersionCommand,
  DocumentVersion,
  DocumentSummary,
  DocumentWithCurrentVersion,
  UpdateDocumentMetadataCommand,
} from '../src/document/document.types.js';

const candidateId = '10000000-0000-4000-8000-000000000000';
const applicationId = '20000000-0000-4000-8000-000000000000';
const documentId = '30000000-0000-4000-8000-000000000000';
const versionId = '40000000-0000-4000-8000-000000000000';

function document(): DocumentWithCurrentVersion {
  const version: DocumentVersion = {
    id: versionId,
    documentId,
    contentMarkdown: '# Resume notes',
    metadata: null,
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
  };
  return {
    id: documentId,
    candidateId,
    applicationId: null,
    type: 'MARKDOWN_NOTE',
    title: 'Resume notes',
    currentVersionId: versionId,
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    updatedAt: new Date('2026-08-22T10:00:00.000Z'),
    currentVersion: version,
  };
}

class FakeDocumentRepository implements DocumentPersistence {
  applicationExistsResult = true;
  summariesResult: DocumentSummary[] = [];
  readonly applicationExistsCalls: string[] = [];
  readonly findAllCalls: string[] = [];
  result: DocumentWithCurrentVersion | null = document();
  versionsResult: DocumentVersion[] | null = [document().currentVersion];
  createCommand?: CreateDocumentCommand;
  metadataCommand?: UpdateDocumentMetadataCommand;
  versionCommand?: CreateDocumentVersionCommand;

  async applicationExists(id: string): Promise<boolean> {
    this.applicationExistsCalls.push(id);
    return this.applicationExistsResult;
  }

  async findAllByApplicationId(id: string): Promise<DocumentSummary[]> {
    this.findAllCalls.push(id);
    return this.summariesResult;
  }

  async findById(): Promise<DocumentWithCurrentVersion | null> {
    return this.result;
  }

  async findVersions(): Promise<DocumentVersion[] | null> {
    return this.versionsResult;
  }

  async create(command: CreateDocumentCommand) {
    this.createCommand = command;
    return this.result;
  }

  async updateMetadata(_id: string, command: UpdateDocumentMetadataCommand) {
    this.metadataCommand = command;
    return this.result;
  }

  async createVersion(_id: string, command: CreateDocumentVersionCommand) {
    this.versionCommand = command;
    return this.result;
  }
}

function validCreate() {
  return {
    candidateId,
    applicationId: null,
    type: 'MARKDOWN_NOTE' as const,
    title: 'Resume notes',
    contentMarkdown: '# Resume notes',
  };
}

describe('DocumentService', () => {
  it('returns Application Document summaries in repository order', async () => {
    const repository = new FakeDocumentRepository();
    repository.summariesResult = [
      {
        id: documentId,
        type: 'MARKDOWN_NOTE',
        title: 'Newest note',
        currentVersionId: versionId,
        createdAt: new Date('2026-08-22T10:00:00.000Z'),
        updatedAt: new Date('2026-08-22T12:00:00.000Z'),
      },
    ];
    const service = new DocumentService(repository);

    await expect(service.getApplicationDocuments(applicationId)).resolves.toEqual(
      repository.summariesResult,
    );
    expect(repository.applicationExistsCalls).toEqual([applicationId]);
    expect(repository.findAllCalls).toEqual([applicationId]);
  });

  it('returns an empty list for an Application without Documents', async () => {
    const repository = new FakeDocumentRepository();
    const service = new DocumentService(repository);

    await expect(service.getApplicationDocuments(applicationId)).resolves.toEqual([]);
  });

  it('validates the Application identifier and reports a missing parent', async () => {
    const repository = new FakeDocumentRepository();
    const service = new DocumentService(repository);

    await expect(service.getApplicationDocuments('invalid')).rejects.toBeInstanceOf(
      InvalidDocumentIdentifierError,
    );
    expect(repository.applicationExistsCalls).toEqual([]);

    repository.applicationExistsResult = false;
    await expect(
      service.getApplicationDocuments(applicationId),
    ).rejects.toBeInstanceOf(DocumentApplicationNotFoundError);
    expect(repository.findAllCalls).toEqual([]);
  });

  it('validates and creates a Candidate-owned Document', async () => {
    const repository = new FakeDocumentRepository();
    const service = new DocumentService(repository);

    await expect(service.createDocument(validCreate())).resolves.toEqual(document());
    expect(repository.createCommand).toEqual({ ...validCreate(), metadata: null });
  });

  it('supports an Application owner and structured version metadata', async () => {
    const repository = new FakeDocumentRepository();
    const service = new DocumentService(repository);
    const metadata = { promptVersion: 'manual-v1' };

    await service.createDocument({
      ...validCreate(),
      candidateId: null,
      applicationId,
      type: 'APPLICATION_BRIEF',
      metadata,
    });

    expect(repository.createCommand).toMatchObject({
      candidateId: null,
      applicationId,
      type: 'APPLICATION_BRIEF',
      metadata,
    });
  });

  it.each([
    {
      label: 'neither owner',
      input: { ...validCreate(), candidateId: null },
    },
    {
      label: 'both owners',
      input: { ...validCreate(), applicationId },
    },
    {
      label: 'blank title',
      input: { ...validCreate(), title: '   ' },
    },
    {
      label: 'blank content',
      input: { ...validCreate(), contentMarkdown: '   ' },
    },
    {
      label: 'invalid owner UUID',
      input: { ...validCreate(), candidateId: 'invalid' },
    },
  ])('rejects invalid create data: $label', async ({ input }) => {
    const repository = new FakeDocumentRepository();
    const service = new DocumentService(repository);

    await expect(service.createDocument(input)).rejects.toBeInstanceOf(
      InvalidDocumentDataError,
    );
    expect(repository.createCommand).toBeUndefined();
  });

  it('rejects array metadata even if it reaches the service boundary', async () => {
    const repository = new FakeDocumentRepository();
    const service = new DocumentService(repository);

    await expect(
      service.createDocument({
        ...validCreate(),
        metadata: [] as unknown as Readonly<Record<string, unknown>>,
      }),
    ).rejects.toBeInstanceOf(InvalidDocumentDataError);
  });

  it('reports a missing owner without exposing persistence details', async () => {
    const repository = new FakeDocumentRepository();
    repository.result = null;
    const service = new DocumentService(repository);

    await expect(service.createDocument(validCreate())).rejects.toBeInstanceOf(
      DocumentOwnerNotFoundError,
    );
  });

  it('gets a Document and rejects invalid or missing identifiers', async () => {
    const repository = new FakeDocumentRepository();
    const service = new DocumentService(repository);

    await expect(service.getDocument(documentId)).resolves.toEqual(document());
    await expect(service.getDocument('invalid')).rejects.toBeInstanceOf(
      InvalidDocumentIdentifierError,
    );
    repository.result = null;
    await expect(service.getDocument(documentId)).rejects.toBeInstanceOf(
      DocumentNotFoundError,
    );
  });

  it('validates and updates metadata without accepting content', async () => {
    const repository = new FakeDocumentRepository();
    const service = new DocumentService(repository);

    await service.updateDocumentMetadata(documentId, {
      type: 'INTERVIEW_BRIEF',
      title: 'Interview preparation',
    });

    expect(repository.metadataCommand).toEqual({
      type: 'INTERVIEW_BRIEF',
      title: 'Interview preparation',
    });
    await expect(
      service.updateDocumentMetadata(documentId, {
        type: 'MARKDOWN_NOTE',
        title: ' ',
      }),
    ).rejects.toBeInstanceOf(InvalidDocumentDataError);
  });

  it('lists versions and creates a validated append-only version', async () => {
    const repository = new FakeDocumentRepository();
    const service = new DocumentService(repository);

    await expect(service.getDocumentVersions(documentId)).resolves.toEqual(
      repository.versionsResult,
    );
    await service.createDocumentVersion(documentId, {
      contentMarkdown: '# Revised notes',
      metadata: { origin: 'manual' },
    });
    expect(repository.versionCommand).toEqual({
      contentMarkdown: '# Revised notes',
      metadata: { origin: 'manual' },
    });
  });

  it('rejects invalid version content and missing Documents', async () => {
    const repository = new FakeDocumentRepository();
    const service = new DocumentService(repository);

    await expect(
      service.createDocumentVersion(documentId, { contentMarkdown: '' }),
    ).rejects.toBeInstanceOf(InvalidDocumentDataError);

    repository.result = null;
    repository.versionsResult = null;
    await expect(
      service.updateDocumentMetadata(documentId, {
        type: 'MARKDOWN_NOTE',
        title: 'Missing',
      }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    await expect(service.getDocumentVersions(documentId)).rejects.toBeInstanceOf(
      DocumentNotFoundError,
    );
    await expect(
      service.createDocumentVersion(documentId, { contentMarkdown: '# Missing' }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
  });
});
