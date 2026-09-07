import {
  DocumentApplicationNotFoundError,
  DocumentNotFoundError,
  DocumentOwnerNotFoundError,
  InvalidDocumentDataError,
  InvalidDocumentIdentifierError,
  type DocumentDataIssue,
} from './document.errors.js';
import {
  documentTypes,
  type CreateDocumentCommand,
  type CreateDocumentInput,
  type CreateDocumentVersionCommand,
  type CreateDocumentVersionInput,
  type DocumentVersion,
  type DocumentSummary,
  type DocumentWithCurrentVersion,
  type UpdateDocumentMetadataCommand,
  type UpdateDocumentMetadataInput,
} from './document.types.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface DocumentPersistence {
  applicationExists(applicationId: string): Promise<boolean>;
  findAllByApplicationId(applicationId: string): Promise<DocumentSummary[]>;
  findById(id: string): Promise<DocumentWithCurrentVersion | null>;
  findVersions(id: string): Promise<DocumentVersion[] | null>;
  create(command: CreateDocumentCommand): Promise<DocumentWithCurrentVersion | null>;
  updateMetadata(
    id: string,
    command: UpdateDocumentMetadataCommand,
  ): Promise<DocumentWithCurrentVersion | null>;
  createVersion(
    id: string,
    command: CreateDocumentVersionCommand,
  ): Promise<DocumentWithCurrentVersion | null>;
}

function assertValidIdentifier(identifier: string): void {
  if (!uuidPattern.test(identifier)) {
    throw new InvalidDocumentIdentifierError(identifier);
  }
}

function validateMetadata(
  metadata: Readonly<Record<string, unknown>> | null,
  issues: DocumentDataIssue[],
): void {
  if (
    metadata !== null &&
    (typeof metadata !== 'object' || Array.isArray(metadata))
  ) {
    issues.push({ path: 'metadata', message: 'Metadata must be an object or null.' });
  }
}

function validateTypeAndTitle(
  input: UpdateDocumentMetadataInput,
  issues: DocumentDataIssue[],
): void {
  if (!documentTypes.includes(input.type)) {
    issues.push({ path: 'type', message: 'Use an approved Document type.' });
  }
  if (input.title.trim() === '') {
    issues.push({ path: 'title', message: 'Title is required.' });
  }
}

function normalizeCreateDocument(input: CreateDocumentInput): CreateDocumentCommand {
  const issues: DocumentDataIssue[] = [];
  const hasCandidate = input.candidateId !== null;
  const hasApplication = input.applicationId !== null;
  const metadata = input.metadata ?? null;

  validateTypeAndTitle(input, issues);
  if (hasCandidate === hasApplication) {
    issues.push({
      path: 'owner',
      message: 'Exactly one Candidate or Application owner is required.',
    });
  }
  if (input.candidateId !== null && !uuidPattern.test(input.candidateId)) {
    issues.push({ path: 'candidateId', message: 'Use a valid Candidate UUID.' });
  }
  if (input.applicationId !== null && !uuidPattern.test(input.applicationId)) {
    issues.push({ path: 'applicationId', message: 'Use a valid Application UUID.' });
  }
  if (input.contentMarkdown.trim() === '') {
    issues.push({ path: 'contentMarkdown', message: 'Markdown content is required.' });
  }
  validateMetadata(metadata, issues);

  if (issues.length > 0) {
    throw new InvalidDocumentDataError(issues);
  }

  return {
    candidateId: input.candidateId,
    applicationId: input.applicationId,
    type: input.type,
    title: input.title,
    contentMarkdown: input.contentMarkdown,
    metadata,
  };
}

function validateMetadataUpdate(
  input: UpdateDocumentMetadataInput,
): UpdateDocumentMetadataCommand {
  const issues: DocumentDataIssue[] = [];
  validateTypeAndTitle(input, issues);

  if (issues.length > 0) {
    throw new InvalidDocumentDataError(issues);
  }

  return { type: input.type, title: input.title };
}

function normalizeVersion(
  input: CreateDocumentVersionInput,
): CreateDocumentVersionCommand {
  const issues: DocumentDataIssue[] = [];
  const metadata = input.metadata ?? null;

  if (input.contentMarkdown.trim() === '') {
    issues.push({ path: 'contentMarkdown', message: 'Markdown content is required.' });
  }
  validateMetadata(metadata, issues);

  if (issues.length > 0) {
    throw new InvalidDocumentDataError(issues);
  }

  return { contentMarkdown: input.contentMarkdown, metadata };
}

export class DocumentService {
  constructor(private readonly repository: DocumentPersistence) {}

  async getApplicationDocuments(applicationId: string): Promise<DocumentSummary[]> {
    assertValidIdentifier(applicationId);
    if (!(await this.repository.applicationExists(applicationId))) {
      throw new DocumentApplicationNotFoundError(applicationId);
    }

    return this.repository.findAllByApplicationId(applicationId);
  }

  async createDocument(input: CreateDocumentInput): Promise<DocumentWithCurrentVersion> {
    const command = normalizeCreateDocument(input);
    const document = await this.repository.create(command);

    if (document === null) {
      throw new DocumentOwnerNotFoundError();
    }

    return document;
  }

  async getDocument(id: string): Promise<DocumentWithCurrentVersion> {
    assertValidIdentifier(id);
    const document = await this.repository.findById(id);

    if (document === null) {
      throw new DocumentNotFoundError(id);
    }

    return document;
  }

  async updateDocumentMetadata(
    id: string,
    input: UpdateDocumentMetadataInput,
  ): Promise<DocumentWithCurrentVersion> {
    assertValidIdentifier(id);
    const command = validateMetadataUpdate(input);
    const document = await this.repository.updateMetadata(id, command);

    if (document === null) {
      throw new DocumentNotFoundError(id);
    }

    return document;
  }

  async getDocumentVersions(id: string): Promise<DocumentVersion[]> {
    assertValidIdentifier(id);
    const versions = await this.repository.findVersions(id);

    if (versions === null) {
      throw new DocumentNotFoundError(id);
    }

    return versions;
  }

  async createDocumentVersion(
    id: string,
    input: CreateDocumentVersionInput,
  ): Promise<DocumentWithCurrentVersion> {
    assertValidIdentifier(id);
    const command = normalizeVersion(input);
    const document = await this.repository.createVersion(id, command);

    if (document === null) {
      throw new DocumentNotFoundError(id);
    }

    return document;
  }
}
