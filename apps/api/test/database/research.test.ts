import { count, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import * as schema from '../../src/db/schema.js';
import { ResearchRunningConflictError } from '../../src/research/research.errors.js';
import { ResearchRepository } from '../../src/research/research.repository.js';
import type {
  CompleteResearchGraphCommand,
} from '../../src/research/research.types.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

const startedAt = new Date('2026-08-26T10:00:00.000Z');
const researchDate = new Date('2026-08-26T10:00:00.000Z');
const completedAt = new Date('2026-08-26T10:05:00.000Z');

let client: Sql;
let database: TestDatabase;
let repository: ResearchRepository;

async function resetApplicationState(): Promise<void> {
  await client.unsafe('truncate table applications cascade');
}

async function createApplication(companyName = 'Analytical Engines Ltd'): Promise<string> {
  const [application] = await database
    .insert(schema.applications)
    .values({
      companyName,
      roleTitle: 'Research Engineer',
      source: 'CAREER_PAGE',
      status: 'FOUND',
      priority: 'MEDIUM',
    })
    .returning({ id: schema.applications.id });

  if (application === undefined) {
    throw new Error('Application fixture insert did not return a row.');
  }

  return application.id;
}

async function createRunning(
  applicationId: string,
  overrides: Partial<{
    readonly researchDate: Date;
    readonly startedAt: Date;
    readonly promptVersion: string | null;
  }> = {},
) {
  return repository.createRunning({
    applicationId,
    researchDate: overrides.researchDate ?? researchDate,
    startedAt: overrides.startedAt ?? startedAt,
    promptVersion: overrides.promptVersion ?? null,
  });
}

function completeCommand(
  overrides: Partial<CompleteResearchGraphCommand> = {},
): CompleteResearchGraphCommand {
  return {
    summaryMarkdown: '## Company\n\nAnalytical Engines builds computing systems.',
    warnings: ['NO_RELIABLE_COMPENSATION_DATA'],
    promptVersion: 'research-v1',
    completedAt,
    sources: [
      {
        key: 'source-official',
        url: 'https://example.com/about',
        normalizedUrl: 'https://example.com/about',
        title: 'About Analytical Engines',
        publisher: 'Analytical Engines',
        sourceType: 'OFFICIAL',
        sourceQuality: 'HIGH',
        publishedAt: '2026-08-01',
        retrievedAt: researchDate,
        notes: null,
      },
      {
        key: 'source-report',
        url: 'https://news.example.com/analytical-engines',
        normalizedUrl: 'https://news.example.com/analytical-engines',
        title: 'Analytical Engines expands',
        publisher: 'Example News',
        sourceType: 'NEWS',
        sourceQuality: 'MEDIUM',
        publishedAt: null,
        retrievedAt: researchDate,
        notes: 'Independent report.',
      },
    ],
    claims: [
      {
        key: 'claim-company',
        type: 'COMPANY_DESCRIPTION',
        valueText: 'The company builds computing systems.',
        valueJson: null,
        evidenceType: 'FACT',
        confidence: 'HIGH',
        notes: null,
      },
      {
        key: 'claim-compensation',
        type: 'SALARY_BASE',
        valueText: null,
        valueJson: {
          amount: 70_000,
          currency: 'EUR',
          period: 'YEAR',
        },
        evidenceType: 'REPORTED',
        confidence: 'MEDIUM',
        notes: 'One reported range.',
      },
    ],
    relationships: [
      {
        claimKey: 'claim-company',
        sourceKey: 'source-official',
        relationship: 'SUPPORTS',
        evidenceText: 'The official page describes its computing products.',
      },
      {
        claimKey: 'claim-compensation',
        sourceKey: 'source-report',
        relationship: 'CONTRADICTS',
        evidenceText: 'The report describes a materially different range.',
      },
    ],
    ...overrides,
  };
}

async function graphCounts(researchId: string) {
  const [sources] = await database
    .select({ value: count() })
    .from(schema.researchSources)
    .where(eq(schema.researchSources.researchId, researchId));
  const [claims] = await database
    .select({ value: count() })
    .from(schema.researchClaims)
    .where(eq(schema.researchClaims.researchId, researchId));
  const [relationships] = await database
    .select({ value: count() })
    .from(schema.researchClaimSources)
    .where(eq(schema.researchClaimSources.researchId, researchId));

  return {
    sources: sources?.value ?? -1,
    claims: claims?.value ?? -1,
    relationships: relationships?.value ?? -1,
  };
}

async function expectCompletionRollback(
  researchId: string,
  command: CompleteResearchGraphCommand,
): Promise<void> {
  await expect(repository.persistCompletedGraph(researchId, command)).rejects.toThrow();
  await expect(graphCounts(researchId)).resolves.toEqual({
    sources: 0,
    claims: 0,
    relationships: 0,
  });
  await expect(repository.findById(researchId)).resolves.toMatchObject({
    id: researchId,
    status: 'RUNNING',
    sources: [],
    claims: [],
    relationships: [],
  });
}

beforeAll(async () => {
  const target = getTestDatabaseTarget();
  client = postgres(target.url, { max: 5, onnotice: () => undefined });
  database = drizzle(client, { schema });
  repository = new ResearchRepository(database);
  await resetApplicationState();
});

afterEach(resetApplicationState);

afterAll(async () => {
  await client.end();
});

describe('Research persistence schema', () => {
  it('creates the aggregate tables, exact enums, and active-run index', async () => {
    const tables = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'researches',
          'research_sources',
          'research_claims',
          'research_claim_sources'
        )
      order by table_name
    `;
    const enums = await client<{ enum_name: string; values: string[] }[]>`
      select pg_type.typname as enum_name,
             array_agg(pg_enum.enumlabel order by pg_enum.enumsortorder) as values
      from pg_enum
      join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname like 'research_%'
      group by pg_type.typname
      order by pg_type.typname
    `;
    const [runningIndex] = await client<{ indexdef: string }[]>`
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'researches_application_running_uq'
    `;

    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'research_claim_sources',
      'research_claims',
      'research_sources',
      'researches',
    ]);
    expect(Object.fromEntries(enums.map(({ enum_name, values }) => [enum_name, values])))
      .toEqual({
        research_claim_source_relationship: ['SUPPORTS', 'CONTRADICTS'],
        research_claim_type: [
          'COMPANY_DESCRIPTION',
          'BUSINESS_AREA',
          'PARIS_PRESENCE',
          'ROLE_INFORMATION',
          'SALARY_BASE',
          'TOTAL_COMPENSATION',
          'INTERVIEW_STAGE',
          'INTERVIEW_TOPIC',
          'TECHNOLOGY',
          'CULTURE',
          'OTHER',
        ],
        research_confidence: ['LOW', 'MEDIUM', 'HIGH'],
        research_evidence_type: ['FACT', 'REPORTED', 'INFERRED'],
        research_source_quality: ['HIGH', 'MEDIUM', 'LOW'],
        research_source_type: [
          'OFFICIAL',
          'NEWS',
          'SALARY_DATABASE',
          'INTERVIEW_REPORT',
          'FORUM',
          'OTHER',
        ],
        research_status: ['RUNNING', 'COMPLETED', 'FAILED'],
      });
    expect(runningIndex?.indexdef).toContain('UNIQUE INDEX');
    expect(runningIndex?.indexdef).toContain(
      "WHERE (status = 'RUNNING'::research_status)",
    );
  });

  it('declares database-enforced same-Research relationship ownership', async () => {
    const constraints = await client<
      { constraint_name: string; definition: string }[]
    >`
      select conname as constraint_name, pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname in (
        'research_claim_sources_claim_ownership_fk',
        'research_claim_sources_source_ownership_fk'
      )
      order by conname
    `;

    expect(constraints).toEqual([
      {
        constraint_name: 'research_claim_sources_claim_ownership_fk',
        definition: expect.stringContaining(
          'FOREIGN KEY (research_id, claim_id) REFERENCES research_claims(research_id, id)',
        ),
      },
      {
        constraint_name: 'research_claim_sources_source_ownership_fk',
        definition: expect.stringContaining(
          'FOREIGN KEY (research_id, source_id) REFERENCES research_sources(research_id, id)',
        ),
      },
    ]);
  });

  it('enforces Application ownership and cascades a complete Research graph', async () => {
    await expect(
      createRunning('00000000-0000-4000-8000-000000000000'),
    ).rejects.toMatchObject({ cause: { code: '23503' } });

    const applicationId = await createApplication();
    const running = await createRunning(applicationId);
    await repository.persistCompletedGraph(running.id, completeCommand());

    await database
      .delete(schema.applications)
      .where(eq(schema.applications.id, applicationId));

    await expect(graphCounts(running.id)).resolves.toEqual({
      sources: 0,
      claims: 0,
      relationships: 0,
    });
    await expect(repository.findById(running.id)).resolves.toBeNull();
  });

  it('rejects invalid lifecycle state, timestamp, warning, and blank-safe fields', async () => {
    const applicationId = await createApplication();

    await expect(
      database.insert(schema.researches).values({
        applicationId,
        status: 'RUNNING',
        summaryMarkdown: 'Premature result',
        researchDate,
        startedAt,
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });

    await expect(
      database.insert(schema.researches).values({
        applicationId,
        status: 'FAILED',
        researchDate,
        startedAt,
        failedAt: new Date('2026-08-26T09:59:00.000Z'),
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });

    await expect(
      database.insert(schema.researches).values({
        applicationId,
        status: 'FAILED',
        researchDate,
        startedAt,
        failedAt: completedAt,
        failureCode: '   ',
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });

    await expect(
      database.insert(schema.researches).values({
        applicationId,
        status: 'RUNNING',
        warnings: { invalid: true } as unknown as string[],
        researchDate,
        startedAt,
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('accepts text, JSON, or both claim values and rejects both absent', async () => {
    const applicationId = await createApplication();
    const running = await createRunning(applicationId);

    await expect(
      database.insert(schema.researchClaims).values([
        {
          researchId: running.id,
          type: 'COMPANY_DESCRIPTION',
          valueText: 'Computing systems company.',
          valueJson: null,
          evidenceType: 'FACT',
          confidence: 'HIGH',
        },
        {
          researchId: running.id,
          type: 'SALARY_BASE',
          valueText: null,
          valueJson: { amount: 70_000, currency: 'EUR' },
          evidenceType: 'REPORTED',
          confidence: 'MEDIUM',
        },
        {
          researchId: running.id,
          type: 'TOTAL_COMPENSATION',
          valueText: 'Reported total compensation.',
          valueJson: { amount: 85_000, currency: 'EUR' },
          evidenceType: 'REPORTED',
          confidence: 'LOW',
        },
      ]),
    ).resolves.not.toThrow();

    await expect(
      database.insert(schema.researchClaims).values({
        researchId: running.id,
        type: 'OTHER',
        valueText: null,
        valueJson: null,
        evidenceType: 'INFERRED',
        confidence: 'LOW',
      }),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('rejects duplicate normalized URLs only within one Research', async () => {
    const firstApplicationId = await createApplication('First Company');
    const secondApplicationId = await createApplication('Second Company');
    const first = await createRunning(firstApplicationId);
    const second = await createRunning(secondApplicationId);
    const source = {
      url: 'https://example.com/about',
      normalizedUrl: 'https://example.com/about',
      sourceType: 'OFFICIAL' as const,
      sourceQuality: 'HIGH' as const,
      retrievedAt: researchDate,
    };

    await database.insert(schema.researchSources).values({
      researchId: first.id,
      ...source,
    });
    await expect(
      database.insert(schema.researchSources).values({
        researchId: first.id,
        ...source,
        url: 'https://example.com/about#duplicate',
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    await expect(
      database.insert(schema.researchSources).values({
        researchId: second.id,
        ...source,
      }),
    ).resolves.not.toThrow();
  });

  it('accepts both relationships, rejects duplicates, and rejects cross-Research links', async () => {
    const firstApplicationId = await createApplication('First Company');
    const secondApplicationId = await createApplication('Second Company');
    const first = await createRunning(firstApplicationId);
    const second = await createRunning(secondApplicationId);
    const [firstSource, secondSource] = await database
      .insert(schema.researchSources)
      .values([
        {
          researchId: first.id,
          url: 'https://first.example.com',
          normalizedUrl: 'https://first.example.com',
          sourceType: 'OFFICIAL',
          sourceQuality: 'HIGH',
          retrievedAt: researchDate,
        },
        {
          researchId: second.id,
          url: 'https://second.example.com',
          normalizedUrl: 'https://second.example.com',
          sourceType: 'NEWS',
          sourceQuality: 'MEDIUM',
          retrievedAt: researchDate,
        },
      ])
      .returning();
    const [firstClaim, secondClaim] = await database
      .insert(schema.researchClaims)
      .values([
        {
          researchId: first.id,
          type: 'BUSINESS_AREA',
          valueText: 'Computing',
          evidenceType: 'FACT',
          confidence: 'HIGH',
        },
        {
          researchId: second.id,
          type: 'CULTURE',
          valueText: 'Collaborative',
          evidenceType: 'REPORTED',
          confidence: 'LOW',
        },
      ])
      .returning();

    if (
      firstSource === undefined ||
      secondSource === undefined ||
      firstClaim === undefined ||
      secondClaim === undefined
    ) {
      throw new Error('Relationship fixtures were not inserted.');
    }

    await database.insert(schema.researchClaimSources).values([
      {
        researchId: first.id,
        claimId: firstClaim.id,
        sourceId: firstSource.id,
        relationship: 'SUPPORTS',
        evidenceText: 'Direct official statement.',
      },
      {
        researchId: second.id,
        claimId: secondClaim.id,
        sourceId: secondSource.id,
        relationship: 'CONTRADICTS',
        evidenceText: 'A report describes a different experience.',
      },
    ]);

    await expect(
      database.insert(schema.researchClaimSources).values({
        researchId: first.id,
        claimId: firstClaim.id,
        sourceId: firstSource.id,
        relationship: 'CONTRADICTS',
        evidenceText: 'Duplicate pair.',
      }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });

    await expect(
      database.insert(schema.researchClaimSources).values({
        researchId: first.id,
        claimId: secondClaim.id,
        sourceId: firstSource.id,
        relationship: 'SUPPORTS',
        evidenceText: 'Cross-Research relationship.',
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });
});

describe('ResearchRepository', () => {
  it('creates and maps a RUNNING Research with explicit reference time', async () => {
    const applicationId = await createApplication();
    const research = await createRunning(applicationId, {
      promptVersion: 'research-v1',
    });

    expect(research).toMatchObject({
      applicationId,
      status: 'RUNNING',
      summaryMarkdown: null,
      warnings: [],
      promptVersion: 'research-v1',
      researchDate,
      failureCode: null,
      failureMessage: null,
      startedAt,
      completedAt: null,
      failedAt: null,
    });
    expect(research.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(research.createdAt).toBeInstanceOf(Date);
    expect(research.updatedAt).toBeInstanceOf(Date);
  });

  it('maps the database active-run conflict and allows terminal history', async () => {
    const applicationId = await createApplication();
    const first = await createRunning(applicationId);

    await expect(createRunning(applicationId)).rejects.toBeInstanceOf(
      ResearchRunningConflictError,
    );

    await repository.markFailed(first.id, {
      failureCode: 'SAFE_FAILURE',
      failureMessage: 'Research could not be completed.',
      failedAt: completedAt,
    });
    const second = await createRunning(applicationId);
    await repository.persistCompletedGraph(second.id, completeCommand());
    await expect(createRunning(applicationId)).resolves.toMatchObject({
      status: 'RUNNING',
    });
  });

  it('transitions only an explicit RUNNING row to FAILED', async () => {
    const applicationId = await createApplication();
    const running = await createRunning(applicationId);

    const failed = await repository.markFailed(running.id, {
      failureCode: 'PROVIDER_FAILURE',
      failureMessage: 'Research could not be completed.',
      failedAt: completedAt,
    });

    expect(failed).toMatchObject({
      id: running.id,
      status: 'FAILED',
      summaryMarkdown: null,
      warnings: [],
      failureCode: 'PROVIDER_FAILURE',
      failureMessage: 'Research could not be completed.',
      completedAt: null,
      failedAt: completedAt,
    });
    await expect(
      repository.markFailed(running.id, {
        failureCode: null,
        failureMessage: null,
        failedAt: completedAt,
      }),
    ).resolves.toBeNull();
    await expect(
      repository.persistCompletedGraph(running.id, completeCommand()),
    ).resolves.toBeNull();
    await expect(
      repository.markFailed(running.id, {
        failureCode: 'LATE_FAILURE',
        failureMessage: 'A terminal row cannot fail again.',
        failedAt: new Date('2026-08-26T10:06:00.000Z'),
      }),
    ).resolves.toBeNull();
  });

  it('persists and loads one completed aggregate graph atomically', async () => {
    const applicationId = await createApplication();
    const running = await createRunning(applicationId);

    const aggregate = await repository.persistCompletedGraph(
      running.id,
      completeCommand(),
    );

    expect(aggregate).toMatchObject({
      id: running.id,
      applicationId,
      status: 'COMPLETED',
      summaryMarkdown: '## Company\n\nAnalytical Engines builds computing systems.',
      warnings: ['NO_RELIABLE_COMPENSATION_DATA'],
      promptVersion: 'research-v1',
      completedAt,
      failedAt: null,
    });
    expect(aggregate?.sources).toHaveLength(2);
    expect(aggregate?.claims).toHaveLength(2);
    expect(aggregate?.relationships).toHaveLength(2);
    expect(aggregate?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          researchId: running.id,
          normalizedUrl: 'https://example.com/about',
          publishedAt: '2026-08-01',
        }),
      ]),
    );
    expect(aggregate?.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          researchId: running.id,
          type: 'SALARY_BASE',
          valueJson: { amount: 70_000, currency: 'EUR', period: 'YEAR' },
        }),
      ]),
    );
    expect(new Set(aggregate?.relationships.map(({ relationship }) => relationship)))
      .toEqual(new Set(['SUPPORTS', 'CONTRADICTS']));
    expect(
      aggregate?.sources.every(({ id }) => !['source-official', 'source-report'].includes(id)),
    ).toBe(true);
    expect(
      aggregate?.claims.every(({ id }) => !['claim-company', 'claim-compensation'].includes(id)),
    ).toBe(true);

    await expect(repository.findById(running.id)).resolves.toEqual(aggregate);
    await expect(
      repository.persistCompletedGraph(running.id, completeCommand()),
    ).resolves.toBeNull();
  });

  it('completes valid empty evidence graphs without inventing data', async () => {
    const applicationId = await createApplication();
    const running = await createRunning(applicationId);

    const aggregate = await repository.persistCompletedGraph(
      running.id,
      completeCommand({
        summaryMarkdown: null,
        warnings: ['INSUFFICIENT_ROLE_SPECIFIC_DATA'],
        sources: [],
        claims: [],
        relationships: [],
      }),
    );

    expect(aggregate).toMatchObject({
      status: 'COMPLETED',
      summaryMarkdown: null,
      warnings: ['INSUFFICIENT_ROLE_SPECIFIC_DATA'],
      sources: [],
      claims: [],
      relationships: [],
    });
  });

  it('preserves deterministic history and explicit latest-completed semantics', async () => {
    const applicationId = await createApplication();
    const tiedCreatedAt = new Date('2026-08-26T09:00:00.000Z');
    const olderCompletedId = '10000000-0000-4000-8000-000000000000';
    const newerCompletedId = '20000000-0000-4000-8000-000000000000';
    const failedId = '30000000-0000-4000-8000-000000000000';
    const runningId = '40000000-0000-4000-8000-000000000000';

    await database.insert(schema.researches).values([
      {
        id: olderCompletedId,
        applicationId,
        status: 'COMPLETED',
        researchDate,
        startedAt,
        completedAt,
        createdAt: tiedCreatedAt,
        updatedAt: completedAt,
      },
      {
        id: newerCompletedId,
        applicationId,
        status: 'COMPLETED',
        researchDate,
        startedAt,
        completedAt,
        createdAt: tiedCreatedAt,
        updatedAt: completedAt,
      },
      {
        id: failedId,
        applicationId,
        status: 'FAILED',
        researchDate,
        failureCode: 'SAFE_FAILURE',
        startedAt,
        failedAt: new Date('2026-08-26T11:00:00.000Z'),
        createdAt: new Date('2026-08-26T11:00:00.000Z'),
        updatedAt: new Date('2026-08-26T11:00:00.000Z'),
      },
      {
        id: runningId,
        applicationId,
        status: 'RUNNING',
        researchDate,
        startedAt: new Date('2026-08-26T12:00:00.000Z'),
        createdAt: new Date('2026-08-26T12:00:00.000Z'),
        updatedAt: new Date('2026-08-26T12:00:00.000Z'),
      },
    ]);

    await expect(repository.findLatestByApplicationId(applicationId)).resolves.toMatchObject({
      id: runningId,
    });
    await expect(
      repository.findLatestCompletedByApplicationId(applicationId),
    ).resolves.toMatchObject({ id: newerCompletedId });
    await expect(
      repository.findRunningByApplicationId(applicationId),
    ).resolves.toMatchObject({ id: runningId });
    expect((await repository.listByApplicationId(applicationId)).map(({ id }) => id))
      .toEqual([runningId, failedId, newerCompletedId, olderCompletedId]);
  });

  it('returns null and empty history for absent Research data', async () => {
    const applicationId = await createApplication();

    await expect(repository.findById('00000000-0000-4000-8000-000000000000'))
      .resolves.toBeNull();
    await expect(repository.findRunningByApplicationId(applicationId)).resolves.toBeNull();
    await expect(repository.findLatestByApplicationId(applicationId)).resolves.toBeNull();
    await expect(
      repository.findLatestCompletedByApplicationId(applicationId),
    ).resolves.toBeNull();
    await expect(repository.listByApplicationId(applicationId)).resolves.toEqual([]);
  });

  it('rolls back all graph rows when source insertion fails', async () => {
    const applicationId = await createApplication();
    const running = await createRunning(applicationId);
    const command = completeCommand();

    await expectCompletionRollback(
      running.id,
      completeCommand({
        sources: [
          ...command.sources,
          {
            ...command.sources[0]!,
            key: 'source-duplicate-url',
            url: 'https://example.com/about#duplicate',
          },
        ],
      }),
    );
  });

  it('rolls back all graph rows when claim insertion fails', async () => {
    const applicationId = await createApplication();
    const running = await createRunning(applicationId);

    await expectCompletionRollback(
      running.id,
      completeCommand({
        claims: [
          {
            key: 'claim-invalid',
            type: 'OTHER',
            valueText: null,
            valueJson: null,
            evidenceType: 'INFERRED',
            confidence: 'LOW',
            notes: null,
          },
        ],
        relationships: [],
      }),
    );
  });

  it('rolls back all graph rows when relationship insertion fails', async () => {
    const applicationId = await createApplication();
    const running = await createRunning(applicationId);
    const command = completeCommand();

    await expectCompletionRollback(
      running.id,
      completeCommand({
        relationships: [command.relationships[0]!, command.relationships[0]!],
      }),
    );
  });

  it('rejects unresolved temporary graph references before persistence', async () => {
    const applicationId = await createApplication();
    const running = await createRunning(applicationId);

    await expect(
      repository.persistCompletedGraph(
        running.id,
        completeCommand({
          relationships: [
            {
              claimKey: 'claim-not-present',
              sourceKey: 'source-official',
              relationship: 'SUPPORTS',
              evidenceText: 'Invalid temporary reference.',
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'CLAIM_KEY_NOT_FOUND' });
    await expect(graphCounts(running.id)).resolves.toEqual({
      sources: 0,
      claims: 0,
      relationships: 0,
    });
  });

  it('rolls back all graph rows when the terminal Research update fails', async () => {
    const applicationId = await createApplication();
    const running = await createRunning(applicationId);

    await expectCompletionRollback(
      running.id,
      completeCommand({
        completedAt: new Date('2026-08-26T09:59:59.000Z'),
      }),
    );
  });
});
