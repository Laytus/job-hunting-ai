import { count, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import { buildApp } from '../../src/app.js';
import { DocumentRepository } from '../../src/document/document.repository.js';
import type { CreateDocumentCommand } from '../../src/document/document.types.js';
import * as schema from '../../src/db/schema.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

let client: Sql;
let database: TestDatabase;
let repository: DocumentRepository;

function createCommand(
  owner: { readonly candidateId: string; readonly applicationId?: never } | {
    readonly candidateId?: never;
    readonly applicationId: string;
  },
  overrides: Partial<CreateDocumentCommand> = {},
): CreateDocumentCommand {
  return {
    candidateId: owner.candidateId ?? null,
    applicationId: owner.applicationId ?? null,
    type: 'MARKDOWN_NOTE',
    title: 'Search strategy notes',
    contentMarkdown: '# Search strategy\n\nFocus on platform roles.',
    metadata: { origin: 'manual' },
    ...overrides,
  };
}

async function createCandidate(fullName = 'Ada Lovelace') {
  const [candidate] = await database
    .insert(schema.candidateProfiles)
    .values({ fullName })
    .returning();
  if (candidate === undefined) {
    throw new Error('Test Candidate insert did not return a row.');
  }
  return candidate;
}

async function createApplication(companyName = 'Analytical Engines Ltd') {
  const [application] = await database
    .insert(schema.applications)
    .values({
      companyName,
      roleTitle: 'Platform Engineer',
      source: 'CAREER_PAGE',
      status: 'FOUND',
      priority: 'HIGH',
    })
    .returning();
  if (application === undefined) {
    throw new Error('Test Application insert did not return a row.');
  }
  return application;
}

async function resetDocumentState(): Promise<void> {
  await client.unsafe('truncate table candidate_profiles, applications cascade');
}

beforeAll(async () => {
  const target = getTestDatabaseTarget();
  client = postgres(target.url, { max: 5, onnotice: () => undefined });
  database = drizzle(client, { schema });
  repository = new DocumentRepository(database);
  await resetDocumentState();
});

afterEach(resetDocumentState);

afterAll(async () => {
  await client.end();
});

describe('Document database constraints', () => {
  it('is created by the committed migration with only approved enum values', async () => {
    const tables = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('documents', 'document_versions')
      order by table_name
    `;
    const enumValues = await client<{ enumlabel: string }[]>`
      select enumlabel
      from pg_enum
      join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'document_type'
      order by pg_enum.enumsortorder
    `;
    const [currentVersionConstraint] = await client<
      { condeferrable: boolean; condeferred: boolean }[]
    >`
      select condeferrable, condeferred
      from pg_constraint
      where conname = 'documents_current_version_fk'
    `;

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'document_versions',
      'documents',
    ]);
    expect(enumValues.map(({ enumlabel }) => enumlabel)).toEqual([
      'MARKDOWN_NOTE',
      'COVER_LETTER',
      'APPLICATION_BRIEF',
      'INTERVIEW_BRIEF',
    ]);
    expect(currentVersionConstraint).toEqual({
      condeferrable: true,
      condeferred: true,
    });
  });

  it('persists every existing Document type plus APPLICATION_BRIEF', async () => {
    const application = await createApplication();
    const types = [
      'MARKDOWN_NOTE',
      'COVER_LETTER',
      'APPLICATION_BRIEF',
      'INTERVIEW_BRIEF',
    ] as const;

    const created = await Promise.all(
      types.map((type) =>
        repository.create(
          createCommand(
            { applicationId: application.id },
            { type, title: type, contentMarkdown: `# ${type}` },
          ),
        ),
      ),
    );

    expect(created.map((document) => document?.type)).toEqual(types);
  });

  it('requires exactly one valid owner', async () => {
    const candidate = await createCandidate();
    const application = await createApplication();

    await expect(
      database.insert(schema.documents).values({
        candidateId: null,
        applicationId: null,
        type: 'MARKDOWN_NOTE',
        title: 'No owner',
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(
      database.insert(schema.documents).values({
        candidateId: candidate.id,
        applicationId: application.id,
        type: 'MARKDOWN_NOTE',
        title: 'Two owners',
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(
      database.insert(schema.documents).values({
        candidateId: '00000000-0000-4000-8000-000000000000',
        applicationId: null,
        type: 'MARKDOWN_NOTE',
        title: 'Missing owner',
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('prevents the current pointer from referencing another Document version', async () => {
    const candidate = await createCandidate();
    const first = await repository.create(createCommand({ candidateId: candidate.id }));
    const second = await repository.create(
      createCommand(
        { candidateId: candidate.id },
        { title: 'Second note', contentMarkdown: '# Second' },
      ),
    );

    await expect(
      database
        .update(schema.documents)
        .set({ currentVersionId: second?.currentVersionId })
        .where(eq(schema.documents.id, first?.id ?? '')),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('prevents deleting the version selected as current', async () => {
    const candidate = await createCandidate();
    const document = await repository.create(
      createCommand({ candidateId: candidate.id }),
    );

    await expect(
      database
        .delete(schema.documentVersions)
        .where(
          eq(
            schema.documentVersions.id,
            document?.currentVersionId ?? '00000000-0000-4000-8000-000000000000',
          ),
        ),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('cascades an owner deletion through Documents and versions', async () => {
    const candidate = await createCandidate();
    const application = await createApplication();
    await repository.create(createCommand({ candidateId: candidate.id }));
    await repository.create(createCommand({ applicationId: application.id }));

    await database
      .delete(schema.candidateProfiles)
      .where(eq(schema.candidateProfiles.id, candidate.id));
    expect(await database.select({ value: count() }).from(schema.documents)).toEqual([
      { value: 1 },
    ]);

    await database
      .delete(schema.applications)
      .where(eq(schema.applications.id, application.id));
    expect(await database.select({ value: count() }).from(schema.documents)).toEqual([
      { value: 0 },
    ]);
    expect(
      await database.select({ value: count() }).from(schema.documentVersions),
    ).toEqual([{ value: 0 }]);
  });
});

describe('DocumentRepository', () => {
  it('lists only Application-owned summaries in deterministic order', async () => {
    const application = await createApplication('Target Company');
    const otherApplication = await createApplication('Other Company');
    const candidate = await createCandidate();
    const first = await repository.create(
      createCommand(
        { applicationId: application.id },
        { title: 'First application note' },
      ),
    );
    const second = await repository.create(
      createCommand(
        { applicationId: application.id },
        { title: 'Second application note' },
      ),
    );
    const third = await repository.create(
      createCommand(
        { applicationId: application.id },
        { title: 'Third application note' },
      ),
    );
    const fourth = await repository.create(
      createCommand(
        { applicationId: application.id },
        { title: 'Fourth application note' },
      ),
    );
    await repository.create(
      createCommand(
        { applicationId: otherApplication.id },
        { title: 'Other Application note' },
      ),
    );
    await repository.create(
      createCommand(
        { candidateId: candidate.id },
        { title: 'Candidate note' },
      ),
    );

    const oldest = new Date('2026-08-22T09:00:00.000Z');
    const middle = new Date('2026-08-22T10:00:00.000Z');
    const newest = new Date('2026-08-22T11:00:00.000Z');
    await database
      .update(schema.documents)
      .set({ createdAt: oldest, updatedAt: oldest })
      .where(eq(schema.documents.id, first?.id ?? ''));
    await database
      .update(schema.documents)
      .set({ createdAt: newest, updatedAt: middle })
      .where(eq(schema.documents.id, second?.id ?? ''));
    await database
      .update(schema.documents)
      .set({ createdAt: middle, updatedAt: middle })
      .where(eq(schema.documents.id, third?.id ?? ''));
    await database
      .update(schema.documents)
      .set({ createdAt: middle, updatedAt: middle })
      .where(eq(schema.documents.id, fourth?.id ?? ''));

    const summaries = await repository.findAllByApplicationId(application.id);
    const tiedIds = [third?.id, fourth?.id]
      .filter((id): id is string => id !== undefined)
      .sort()
      .reverse();

    expect(summaries.map(({ id }) => id)).toEqual([
      second?.id,
      ...tiedIds,
      first?.id,
    ]);
    expect(summaries).toHaveLength(4);
    expect(summaries[0]).toEqual({
      id: second?.id,
      type: second?.type,
      title: second?.title,
      currentVersionId: second?.currentVersionId,
      createdAt: newest,
      updatedAt: middle,
    });
    expect(summaries.every((summary) => !('contentMarkdown' in summary))).toBe(
      true,
    );
    expect(summaries.every((summary) => !('metadata' in summary))).toBe(true);
  });

  it('atomically creates a Document and database-generated initial version', async () => {
    const candidate = await createCandidate();
    const command = createCommand({ candidateId: candidate.id });

    const created = await repository.create(command);

    expect(created).toMatchObject({
      candidateId: candidate.id,
      applicationId: null,
      type: command.type,
      title: command.title,
      currentVersion: {
        contentMarkdown: command.contentMarkdown,
        metadata: command.metadata,
      },
    });
    expect(created?.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(created?.currentVersionId).toBe(created?.currentVersion.id);
    expect(created?.currentVersion.documentId).toBe(created?.id);
    expect(created?.createdAt).toBeInstanceOf(Date);
    expect(created?.updatedAt).toBeInstanceOf(Date);
    await expect(repository.findById(created?.id ?? '')).resolves.toEqual(created);
  });

  it('rolls back the Document when initial version creation fails', async () => {
    const candidate = await createCandidate();

    await expect(
      repository.create(
        createCommand({ candidateId: candidate.id }, { contentMarkdown: '   ' }),
      ),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    expect(await database.select({ value: count() }).from(schema.documents)).toEqual([
      { value: 0 },
    ]);
  });

  it('returns null without partial writes when the owner is missing', async () => {
    await expect(
      repository.create(
        createCommand({ candidateId: '00000000-0000-4000-8000-000000000000' }),
      ),
    ).resolves.toBeNull();
    expect(await database.select({ value: count() }).from(schema.documents)).toEqual([
      { value: 0 },
    ]);
  });

  it('updates metadata while retaining immutable content history', async () => {
    const application = await createApplication();
    const created = await repository.create(
      createCommand({ applicationId: application.id }),
    );
    const updated = await repository.updateMetadata(created?.id ?? '', {
      type: 'COVER_LETTER',
      title: 'Cover letter for Analytical Engines',
    });

    expect(updated).toMatchObject({
      id: created?.id,
      candidateId: null,
      applicationId: application.id,
      type: 'COVER_LETTER',
      title: 'Cover letter for Analytical Engines',
      currentVersionId: created?.currentVersionId,
      currentVersion: created?.currentVersion,
    });
    await expect(repository.findVersions(created?.id ?? '')).resolves.toHaveLength(1);
  });

  it('appends versions, advances current version, and preserves history', async () => {
    const candidate = await createCandidate();
    const created = await repository.create(createCommand({ candidateId: candidate.id }));
    const original = created?.currentVersion;
    const updated = await repository.createVersion(created?.id ?? '', {
      contentMarkdown: '# Revised strategy',
      metadata: { revision: 2 },
    });

    expect(updated?.currentVersionId).not.toBe(original?.id);
    expect(updated?.currentVersion).toMatchObject({
      documentId: created?.id,
      contentMarkdown: '# Revised strategy',
      metadata: { revision: 2 },
    });
    const versions = await repository.findVersions(created?.id ?? '');
    expect(versions).toHaveLength(2);
    expect(versions?.map(({ id }) => id)).toContain(original?.id);
    expect(versions?.map(({ contentMarkdown }) => contentMarkdown)).toContain(
      original?.contentMarkdown,
    );
  });

  it('returns version history in deterministic newest-first order', async () => {
    const candidate = await createCandidate();
    const created = await repository.create(createCommand({ candidateId: candidate.id }));
    const second = await repository.createVersion(created?.id ?? '', {
      contentMarkdown: '# Second',
      metadata: null,
    });
    const third = await repository.createVersion(created?.id ?? '', {
      contentMarkdown: '# Third',
      metadata: null,
    });

    await database
      .update(schema.documentVersions)
      .set({ createdAt: new Date('2026-08-22T12:00:00.000Z') })
      .where(eq(schema.documentVersions.documentId, created?.id ?? ''));
    const versions = await repository.findVersions(created?.id ?? '');
    const expected = [
      created?.currentVersion.id,
      second?.currentVersion.id,
      third?.currentVersion.id,
    ]
      .filter((id): id is string => id !== undefined)
      .sort()
      .reverse();

    expect(versions?.map(({ id }) => id)).toEqual(expected);
  });

  it('returns null for operations on a missing Document', async () => {
    const missingId = '00000000-0000-4000-8000-000000000000';

    await expect(repository.findById(missingId)).resolves.toBeNull();
    await expect(repository.findVersions(missingId)).resolves.toBeNull();
    await expect(
      repository.updateMetadata(missingId, {
        type: 'MARKDOWN_NOTE',
        title: 'Missing',
      }),
    ).resolves.toBeNull();
    await expect(
      repository.createVersion(missingId, {
        contentMarkdown: '# Missing',
        metadata: null,
      }),
    ).resolves.toBeNull();
  });
});

describe('Document API with PostgreSQL', () => {
  it('creates, reads, versions, and updates metadata through the real stack', async () => {
    const application = await createApplication();
    const app = buildApp({ database });

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/documents',
        payload: createCommand({ applicationId: application.id }),
      });
      expect(created.statusCode).toBe(201);
      const createdBody = created.json();

      const listed = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${application.id}/documents`,
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual({
        documents: [
          {
            id: createdBody.document.id,
            type: createdBody.document.type,
            title: createdBody.document.title,
            currentVersionId: createdBody.document.currentVersionId,
            createdAt: createdBody.document.createdAt,
            updatedAt: createdBody.document.updatedAt,
          },
        ],
      });

      const versioned = await app.inject({
        method: 'POST',
        url: `/api/v1/documents/${createdBody.document.id}/versions`,
        payload: { contentMarkdown: '# Application-specific revision' },
      });
      expect(versioned.statusCode).toBe(201);
      expect(versioned.json()).toMatchObject({
        document: {
          id: createdBody.document.id,
          currentVersion: {
            contentMarkdown: '# Application-specific revision',
            metadata: null,
          },
        },
      });

      const updated = await app.inject({
        method: 'PUT',
        url: `/api/v1/documents/${createdBody.document.id}`,
        payload: { type: 'COVER_LETTER', title: 'Application cover letter' },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        document: {
          type: 'COVER_LETTER',
          title: 'Application cover letter',
          currentVersionId: versioned.json().document.currentVersionId,
        },
      });

      const persisted = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${createdBody.document.id}`,
      });
      expect(persisted.statusCode).toBe(200);
      expect(persisted.json()).toEqual(updated.json());

      const history = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${createdBody.document.id}/versions`,
      });
      expect(history.statusCode).toBe(200);
      expect(history.json().versions).toHaveLength(2);
    } finally {
      await app.close();
    }
  });
});
