import { count, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import { JobAnalysisRepository } from '../../src/analyze/job-analysis.repository.js';
import type { AnalyzeOutput } from '../../src/analyze/analyze.schema.js';
import { ApplicationRepository } from '../../src/application/application.repository.js';
import { CandidateProfileRepository } from '../../src/candidate/candidate.repository.js';
import * as schema from '../../src/db/schema.js';
import { DocumentRepository } from '../../src/document/document.repository.js';
import { GenerationService } from '../../src/generation/generation-service.js';
import { JobDescriptionRepository } from '../../src/job-description/job-description.repository.js';
import { AiUsageGuard } from '../../src/llm/ai-usage-guard.js';
import { AiUsageRecorder } from '../../src/llm/ai-usage-recorder.js';
import { AiUsageRepository } from '../../src/llm/ai-usage.repository.js';
import { FakeLlmProvider } from '../../src/llm/fake-llm-provider.js';
import { TrackedLlmExecutor } from '../../src/llm/tracked-llm.js';
import { ResearchRepository } from '../../src/research/research.repository.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

const operationDate = new Date('2026-08-28T12:00:00.000Z');
const analysisOutput: AnalyzeOutput = {
  roleSummary: 'Latest completed role summary.',
  fitSummary: 'Latest completed fit summary.',
  requirements: [],
  candidateEvidence: [],
  strengths: ['TypeScript'],
  gaps: [],
  keywords: ['TypeScript'],
  hardConstraints: [],
  warnings: [],
};

let client: Sql;
let database: TestDatabase;

async function resetState(): Promise<void> {
  await client.unsafe(
    'truncate table candidate_profiles, applications, ai_usage cascade',
  );
}

async function createSources(): Promise<{
  readonly applicationId: string;
  readonly latestAnalysisId: string;
  readonly latestResearchId: string;
}> {
  await database.insert(schema.candidateProfiles).values({
    fullName: 'Ada Lovelace',
    headline: 'Staff Engineer',
    summaryMarkdown: 'Builds reliable TypeScript services.',
  });
  const [application] = await database
    .insert(schema.applications)
    .values({
      companyName: 'Analytical Engines Ltd',
      roleTitle: 'Staff Engineer',
      location: 'Paris, France',
      source: 'CAREER_PAGE',
      status: 'FOUND',
      priority: 'HIGH',
    })
    .returning({ id: schema.applications.id });
  if (application === undefined) {
    throw new Error('Generation fixture Application insert failed.');
  }
  await database.insert(schema.jobDescriptions).values({
    applicationId: application.id,
    title: 'Staff Engineer',
    companyName: 'Analytical Engines Ltd',
    descriptionMarkdown: 'Build reliable TypeScript services.',
  });

  const oldDate = new Date('2026-08-20T10:00:00.000Z');
  const latestDate = new Date('2026-08-21T10:00:00.000Z');
  const newerTerminalDate = new Date('2026-08-22T10:00:00.000Z');
  await database.insert(schema.jobAnalyses).values({
    applicationId: application.id,
    status: 'COMPLETED',
    analysisData: { ...analysisOutput, roleSummary: 'Old completed analysis.' },
    suggestedScore: 50,
    promptVersion: 'analyze-v1',
    startedAt: oldDate,
    completedAt: oldDate,
    createdAt: oldDate,
    updatedAt: oldDate,
  });
  const [latestAnalysis] = await database
    .insert(schema.jobAnalyses)
    .values({
      applicationId: application.id,
      status: 'COMPLETED',
      analysisData: analysisOutput,
      suggestedScore: 90,
      promptVersion: 'analyze-v1',
      startedAt: latestDate,
      completedAt: latestDate,
      createdAt: latestDate,
      updatedAt: latestDate,
    })
    .returning({ id: schema.jobAnalyses.id });
  await database.insert(schema.jobAnalyses).values({
    applicationId: application.id,
    status: 'FAILED',
    analysisData: null,
    suggestedScore: null,
    failureCode: 'OFFLINE_FAILURE',
    failureMessage: 'Offline failure.',
    promptVersion: 'analyze-v1',
    startedAt: newerTerminalDate,
    failedAt: newerTerminalDate,
    createdAt: newerTerminalDate,
    updatedAt: newerTerminalDate,
  });
  await database.insert(schema.jobAnalyses).values({
    applicationId: application.id,
    status: 'RUNNING',
    promptVersion: 'analyze-v1',
    startedAt: new Date('2026-08-23T10:00:00.000Z'),
    createdAt: new Date('2026-08-23T10:00:00.000Z'),
    updatedAt: new Date('2026-08-23T10:00:00.000Z'),
  });

  await database.insert(schema.researches).values({
    applicationId: application.id,
    status: 'COMPLETED',
    summaryMarkdown: null,
    warnings: [],
    promptVersion: 'research-v2',
    researchDate: oldDate,
    startedAt: oldDate,
    completedAt: oldDate,
    createdAt: oldDate,
    updatedAt: oldDate,
  });
  const [latestResearch] = await database
    .insert(schema.researches)
    .values({
      applicationId: application.id,
      status: 'COMPLETED',
      summaryMarkdown: null,
      warnings: [],
      promptVersion: 'research-v2',
      researchDate: latestDate,
      startedAt: latestDate,
      completedAt: latestDate,
      createdAt: latestDate,
      updatedAt: latestDate,
    })
    .returning({ id: schema.researches.id });
  await database.insert(schema.researches).values({
    applicationId: application.id,
    status: 'FAILED',
    summaryMarkdown: null,
    warnings: [],
    promptVersion: 'research-v2',
    researchDate: newerTerminalDate,
    failureCode: 'OFFLINE_FAILURE',
    failureMessage: 'Offline failure.',
    startedAt: newerTerminalDate,
    failedAt: newerTerminalDate,
    createdAt: newerTerminalDate,
    updatedAt: newerTerminalDate,
  });
  await database.insert(schema.researches).values({
    applicationId: application.id,
    status: 'RUNNING',
    warnings: [],
    promptVersion: 'research-v2',
    researchDate: new Date('2026-08-23T10:00:00.000Z'),
    startedAt: new Date('2026-08-23T10:00:00.000Z'),
    createdAt: new Date('2026-08-23T10:00:00.000Z'),
    updatedAt: new Date('2026-08-23T10:00:00.000Z'),
  });

  if (latestAnalysis === undefined || latestResearch === undefined) {
    throw new Error('Latest optional Generation fixture insert failed.');
  }
  return {
    applicationId: application.id,
    latestAnalysisId: latestAnalysis.id,
    latestResearchId: latestResearch.id,
  };
}

function provider(content?: string): FakeLlmProvider {
  return new FakeLlmProvider({
    content:
      content ??
      JSON.stringify({
        paragraphs: ['First paragraph.', 'Second paragraph.', 'Third paragraph.'],
      }),
    model: 'offline-generation-db-model',
    usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 },
  });
}

function service(fakeProvider: FakeLlmProvider): GenerationService {
  const usage = new AiUsageRepository(database);
  return new GenerationService({
    applications: new ApplicationRepository(database),
    candidates: new CandidateProfileRepository(database),
    jobDescriptions: new JobDescriptionRepository(database),
    analyses: new JobAnalysisRepository(database),
    researches: new ResearchRepository(database),
    documents: new DocumentRepository(database),
    executor: new TrackedLlmExecutor(
      fakeProvider,
      new AiUsageGuard(usage),
      new AiUsageRecorder(usage),
    ),
    now: () => new Date(operationDate),
  });
}

beforeAll(async () => {
  const target = getTestDatabaseTarget();
  client = postgres(target.url, { max: 5, onnotice: () => undefined });
  database = drizzle(client, { schema });
  await resetState();
});

afterEach(resetState);

afterAll(async () => {
  await client.end();
});

describe('Generation workflow database persistence', () => {
  it('atomically persists first Generate with latest completed provenance and usage', async () => {
    const sources = await createSources();
    const fakeProvider = provider();
    const result = await service(fakeProvider).generateDocument({
      mode: 'GENERATE',
      applicationId: sources.applicationId,
      documentType: 'COVER_LETTER',
      outputLanguage: 'en',
      market: 'UNITED_KINGDOM',
      sector: 'SOFTWARE_TECH',
    });
    const [documentCount] = await database
      .select({ value: count() })
      .from(schema.documents);
    const [versionCount] = await database
      .select({ value: count() })
      .from(schema.documentVersions);
    const [usageCount] = await database
      .select({ value: count() })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.operationName, 'GENERATE_COVER_LETTER'));

    expect(documentCount?.value).toBe(1);
    expect(versionCount?.value).toBe(1);
    expect(usageCount?.value).toBe(1);
    expect(result.document.currentVersionId).toBe(result.currentVersion.id);
    expect(result.document.title).toBe(
      'Cover Letter — Analytical Engines Ltd — Staff Engineer',
    );
    expect(result.currentVersion.metadata).toMatchObject({
      generation: {
        jobAnalysisId: sources.latestAnalysisId,
        researchId: sources.latestResearchId,
        model: 'offline-generation-db-model',
        contextVersion: 'generation-context-v2',
        promptVersion: 'cover-letter-v4',
        templateVersion: 'cover-letter-en-v2',
        coverLetterMarket: 'UNITED_KINGDOM',
        coverLetterSector: 'SOFTWARE_TECH',
        coverLetterSpecificationVersion: 'cover-letter-spec-v3',
      },
    });
    expect(fakeProvider.requests).toHaveLength(1);
    expect(fakeProvider.requests[0]).not.toHaveProperty('tools');
  });

  it('advances Regenerate currentVersionId while preserving title and history', async () => {
    const sources = await createSources();
    const documents = new DocumentRepository(database);
    const original = await documents.create({
      candidateId: null,
      applicationId: sources.applicationId,
      type: 'COVER_LETTER',
      title: 'Manually retained title',
      contentMarkdown: 'PREVIOUS_MANUAL_DATABASE_TEXT',
      metadata: { origin: 'manual' },
    });
    if (original === null) {
      throw new Error('Generation Regenerate fixture creation failed.');
    }
    const fakeProvider = provider();
    const result = await service(fakeProvider).generateDocument({
      mode: 'REGENERATE',
      applicationId: sources.applicationId,
      documentId: original.id,
      outputLanguage: 'fr',
      market: 'UNITED_STATES',
      sector: 'QUANT_TRADING',
    });
    const history = await documents.findVersions(original.id);

    expect(result.document.id).toBe(original.id);
    expect(result.document.title).toBe('Manually retained title');
    expect(result.document.currentVersionId).not.toBe(original.currentVersionId);
    expect(history).toHaveLength(2);
    expect(history?.some((version) => version.contentMarkdown === 'PREVIOUS_MANUAL_DATABASE_TEXT')).toBe(true);
    expect(JSON.stringify(fakeProvider.requests[0])).not.toContain(
      'PREVIOUS_MANUAL_DATABASE_TEXT',
    );
  });

  it('records billable usage but creates no partial Document for invalid structured output', async () => {
    const sources = await createSources();
    const fakeProvider = provider(JSON.stringify({ paragraphs: ['too short'] }));

    await expect(
      service(fakeProvider).generateDocument({
        mode: 'GENERATE',
        applicationId: sources.applicationId,
        documentType: 'COVER_LETTER',
        outputLanguage: 'en',
        market: 'FRANCE',
        sector: 'GENERAL',
      }),
    ).rejects.toMatchObject({ code: 'SCHEMA_VALIDATION_FAILED' });
    const [documentCount] = await database
      .select({ value: count() })
      .from(schema.documents);
    const [versionCount] = await database
      .select({ value: count() })
      .from(schema.documentVersions);
    const [usageCount] = await database
      .select({ value: count() })
      .from(schema.aiUsage);

    expect(documentCount?.value).toBe(0);
    expect(versionCount?.value).toBe(0);
    expect(usageCount?.value).toBe(1);
  });

  it('rejects an existing logical generated Document without a provider call', async () => {
    const sources = await createSources();
    const documents = new DocumentRepository(database);
    await documents.create({
      candidateId: null,
      applicationId: sources.applicationId,
      type: 'COVER_LETTER',
      title: 'Existing manual Cover Letter',
      contentMarkdown: 'Existing content.',
      metadata: null,
    });
    const fakeProvider = provider();

    await expect(
      service(fakeProvider).generateDocument({
        mode: 'GENERATE',
        applicationId: sources.applicationId,
        documentType: 'COVER_LETTER',
        outputLanguage: 'en',
        market: 'FRANCE',
        sector: 'GENERAL',
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_ALREADY_EXISTS' });
    expect(fakeProvider.requests).toHaveLength(0);
    const [documentCount] = await database
      .select({ value: count() })
      .from(schema.documents);
    expect(documentCount?.value).toBe(1);
  });
});
