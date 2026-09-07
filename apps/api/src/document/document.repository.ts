import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  applications,
  candidateProfiles,
  documents,
  documentVersions,
} from '../db/schema.js';
import { DocumentInvariantViolationError } from './document.errors.js';
import type {
  CreateDocumentCommand,
  CreateDocumentVersionCommand,
  Document,
  DocumentSummary,
  DocumentType,
  DocumentVersion,
  DocumentWithCurrentVersion,
  UpdateDocumentMetadataCommand,
} from './document.types.js';

type DocumentRow = typeof documents.$inferSelect;
type DocumentVersionRow = typeof documentVersions.$inferSelect;
type DocumentTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type DocumentExecutor = Database | DocumentTransaction;

function mapDocumentVersion(row: DocumentVersionRow): DocumentVersion {
  return {
    id: row.id,
    documentId: row.documentId,
    contentMarkdown: row.contentMarkdown,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

function mapDocument(row: DocumentRow): Document {
  if (row.currentVersionId === null) {
    throw new DocumentInvariantViolationError('CURRENT_VERSION_REQUIRED');
  }

  return {
    id: row.id,
    candidateId: row.candidateId,
    applicationId: row.applicationId,
    type: row.type,
    title: row.title,
    currentVersionId: row.currentVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DocumentRepository {
  constructor(private readonly database: Database) {}

  async applicationExists(applicationId: string): Promise<boolean> {
    const [application] = await this.database
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    return application !== undefined;
  }

  async findAllByApplicationId(applicationId: string): Promise<DocumentSummary[]> {
    const rows = await this.database
      .select({
        id: documents.id,
        type: documents.type,
        title: documents.title,
        currentVersionId: documents.currentVersionId,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(eq(documents.applicationId, applicationId))
      .orderBy(
        desc(documents.updatedAt),
        desc(documents.createdAt),
        desc(documents.id),
      );

    return rows.map((row) => {
      if (row.currentVersionId === null) {
        throw new DocumentInvariantViolationError('CURRENT_VERSION_REQUIRED');
      }

      return {
        id: row.id,
        type: row.type,
        title: row.title,
        currentVersionId: row.currentVersionId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  async findById(id: string): Promise<DocumentWithCurrentVersion | null> {
    return this.findByIdFrom(this.database, id);
  }

  async findByApplicationIdAndType(
    applicationId: string,
    type: DocumentType,
  ): Promise<DocumentWithCurrentVersion | null> {
    const [document] = await this.database
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.applicationId, applicationId),
          eq(documents.type, type),
        ),
      )
      .orderBy(desc(documents.createdAt), desc(documents.id))
      .limit(1);

    return document === undefined
      ? null
      : this.requireCurrentVersion(this.database, document);
  }

  async findVersions(id: string): Promise<DocumentVersion[] | null> {
    const [document] = await this.database
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (document === undefined) {
      return null;
    }

    const versions = await this.database
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id))
      .orderBy(desc(documentVersions.createdAt), desc(documentVersions.id));

    return versions.map(mapDocumentVersion);
  }

  async create(
    command: CreateDocumentCommand,
  ): Promise<DocumentWithCurrentVersion | null> {
    return this.database.transaction(async (transaction) => {
      if (!(await this.lockOwner(transaction, command))) {
        return null;
      }

      const [document] = await transaction
        .insert(documents)
        .values({
          candidateId: command.candidateId,
          applicationId: command.applicationId,
          type: command.type,
          title: command.title,
        })
        .returning();
      if (document === undefined) {
        throw new DocumentInvariantViolationError('DOCUMENT_INSERT');
      }

      const [version] = await transaction
        .insert(documentVersions)
        .values({
          documentId: document.id,
          contentMarkdown: command.contentMarkdown,
          metadata: command.metadata,
        })
        .returning();
      if (version === undefined) {
        throw new DocumentInvariantViolationError('INITIAL_VERSION_INSERT');
      }

      const [completed] = await transaction
        .update(documents)
        .set({ currentVersionId: version.id })
        .where(eq(documents.id, document.id))
        .returning();
      if (completed === undefined) {
        throw new DocumentInvariantViolationError('CURRENT_VERSION_UPDATE');
      }

      return {
        ...mapDocument(completed),
        currentVersion: mapDocumentVersion(version),
      };
    });
  }

  async updateMetadata(
    id: string,
    command: UpdateDocumentMetadataCommand,
  ): Promise<DocumentWithCurrentVersion | null> {
    return this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(documents)
        .set({
          type: command.type,
          title: command.title,
          updatedAt: sql`transaction_timestamp()`,
        })
        .where(eq(documents.id, id))
        .returning();

      if (updated === undefined) {
        return null;
      }

      return this.requireCurrentVersion(transaction, updated);
    });
  }

  async createVersion(
    id: string,
    command: CreateDocumentVersionCommand,
  ): Promise<DocumentWithCurrentVersion | null> {
    return this.database.transaction(async (transaction) => {
      const [document] = await transaction
        .select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1)
        .for('update');

      if (document === undefined) {
        return null;
      }

      const [version] = await transaction
        .insert(documentVersions)
        .values({ documentId: id, ...command })
        .returning();
      if (version === undefined) {
        throw new DocumentInvariantViolationError('VERSION_INSERT');
      }

      const [updated] = await transaction
        .update(documents)
        .set({
          currentVersionId: version.id,
          updatedAt: sql`transaction_timestamp()`,
        })
        .where(eq(documents.id, id))
        .returning();
      if (updated === undefined) {
        throw new DocumentInvariantViolationError('CURRENT_VERSION_UPDATE');
      }

      return {
        ...mapDocument(updated),
        currentVersion: mapDocumentVersion(version),
      };
    });
  }

  private async findByIdFrom(
    executor: DocumentExecutor,
    id: string,
  ): Promise<DocumentWithCurrentVersion | null> {
    const [document] = await executor
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    if (document === undefined) {
      return null;
    }

    return this.requireCurrentVersion(executor, document);
  }

  private async requireCurrentVersion(
    executor: DocumentExecutor,
    row: DocumentRow,
  ): Promise<DocumentWithCurrentVersion> {
    const document = mapDocument(row);
    const [version] = await executor
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, document.id),
          eq(documentVersions.id, document.currentVersionId),
        ),
      )
      .limit(1);

    if (version === undefined) {
      throw new DocumentInvariantViolationError('CURRENT_VERSION_MISSING');
    }

    return { ...document, currentVersion: mapDocumentVersion(version) };
  }

  private async lockOwner(
    transaction: DocumentTransaction,
    command: Pick<CreateDocumentCommand, 'candidateId' | 'applicationId'>,
  ): Promise<boolean> {
    if (command.candidateId !== null) {
      const [candidate] = await transaction
        .select({ id: candidateProfiles.id })
        .from(candidateProfiles)
        .where(eq(candidateProfiles.id, command.candidateId))
        .limit(1)
        .for('key share');
      return candidate !== undefined;
    }

    if (command.applicationId !== null) {
      const [application] = await transaction
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.id, command.applicationId))
        .limit(1)
        .for('key share');
      return application !== undefined;
    }

    return false;
  }
}
