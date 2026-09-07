import { count, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import { buildApp } from '../../src/app.js';
import { ApplicationRepository } from '../../src/application/application.repository.js';
import * as schema from '../../src/db/schema.js';
import { JobDescriptionRepository } from '../../src/job-description/job-description.repository.js';
import { AiUsageGuard } from '../../src/llm/ai-usage-guard.js';
import { AiUsageRecorder } from '../../src/llm/ai-usage-recorder.js';
import { AiUsageRepository } from '../../src/llm/ai-usage.repository.js';
import { FakeLlmProvider } from '../../src/llm/fake-llm-provider.js';
import { TrackedLlmExecutor } from '../../src/llm/tracked-llm.js';
import { ResearchContextBuilder } from '../../src/research/research-context-builder.js';
import { ResearchGraphValidator } from '../../src/research/research-graph-validator.js';
import { ResearchPromptBuilder } from '../../src/research/research-prompt.js';
import { ResearchRepository } from '../../src/research/research.repository.js';
import type { ResearchOutput } from '../../src/research/research.schema.js';
import { ResearchService } from '../../src/research/research-service.js';
import { RESEARCH_OPERATION_NAME } from '../../src/research/research.types.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

const workflowNow = new Date('2026-08-26T12:00:00.000Z');
const officialUrl = 'https://analytical-engines.example/about';
const salaryUrl = 'https://salary.example/analytical-engines/research-engineer';

const emptyStructuredValue = {
  amount: null,
  amountMin: null,
  amountMax: null,
  currency: null,
  period: null,
  location: null,
  role: null,
  seniority: null,
  dataYear: null,
  stageOrder: null,
  frequency: null,
} as const;

const validOutput: ResearchOutput = {
  summaryMarkdown:
    '## Findings\n\nAnalytical Engines builds computing systems and reports a Paris salary range.',
  sources: [
    {
      id: 'official',
      url: `${officialUrl}/`,
      title: 'About Analytical Engines',
      publisher: 'Analytical Engines',
      sourceType: 'OFFICIAL',
      sourceQuality: 'HIGH',
      publishedAt: '2026-08-01',
    },
    {
      id: 'salary',
      url: salaryUrl,
      title: 'Research Engineer compensation',
      publisher: 'Salary Example',
      sourceType: 'SALARY_DATABASE',
      sourceQuality: 'MEDIUM',
      publishedAt: '2026-07-15',
    },
  ],
  claims: [
    {
      id: 'company',
      type: 'COMPANY_DESCRIPTION',
      valueText: 'Analytical Engines builds computing systems.',
      valueJson: emptyStructuredValue,
      evidenceType: 'FACT',
      sourceLinks: [
        {
          sourceId: 'official',
          relationship: 'SUPPORTS',
          evidenceText: 'The official page describes its computing products.',
        },
      ],
    },
    {
      id: 'salary-base',
      type: 'SALARY_BASE',
      valueText: null,
      valueJson: {
        amount: 85_000,
        amountMin: null,
        amountMax: null,
        currency: 'eur',
        period: 'YEAR',
        location: 'Paris',
        role: 'Research Engineer',
        seniority: null,
        dataYear: 2026,
        stageOrder: null,
        frequency: null,
      },
      evidenceType: 'REPORTED',
      sourceLinks: [
        {
          sourceId: 'official',
          relationship: 'SUPPORTS',
          evidenceText: 'The official posting discloses the salary range.',
        },
        {
          sourceId: 'salary',
          relationship: 'SUPPORTS',
          evidenceText: 'The database reports role-specific Paris compensation.',
        },
      ],
    },
  ],
  warnings: [],
};

let client: Sql;
let database: TestDatabase;

async function resetState(): Promise<void> {
  await client.unsafe('truncate table applications cascade');
  await client.unsafe('truncate table ai_usage');
}

async function createSources(): Promise<string> {
  const application = await new ApplicationRepository(database).create({
    companyName: 'Analytical Engines Ltd',
    roleTitle: 'Research Engineer',
    location: 'Paris',
    jobUrl: 'https://jobs.example/research-engineer',
    source: 'CAREER_PAGE',
    status: 'FOUND',
    priority: 'MEDIUM',
    dateFound: '2026-08-20',
    dateApplied: null,
    notesMarkdown: null,
  });
  const jobDescription = await new JobDescriptionRepository(
    database,
  ).replaceForApplication(application.id, {
    title: 'Research Engineer',
    companyName: 'Analytical Engines Ltd',
    descriptionMarkdown: 'Research and build computing systems in Paris.',
    requirementsMarkdown: 'Systems research and TypeScript.',
    responsibilitiesMarkdown: null,
    structuredData: null,
    sourceUrl: 'https://jobs.example/research-engineer',
  });
  if (jobDescription === null) {
    throw new Error('Job Description fixture could not be persisted.');
  }
  return application.id;
}

function successfulProvider(): FakeLlmProvider {
  return new FakeLlmProvider({
    content: JSON.stringify(validOutput),
    model: 'offline-research-model',
    usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
    webSources: [{ url: officialUrl }, { url: salaryUrl }],
  });
}

function createService(
  provider: FakeLlmProvider,
  researches = new ResearchRepository(database),
): ResearchService {
  const usage = new AiUsageRepository(database);
  return new ResearchService({
    applications: new ApplicationRepository(database),
    jobDescriptions: new JobDescriptionRepository(database),
    researches,
    contextBuilder: new ResearchContextBuilder(),
    promptBuilder: new ResearchPromptBuilder(),
    executor: new TrackedLlmExecutor(
      provider,
      new AiUsageGuard(usage),
      new AiUsageRecorder(usage),
    ),
    validator: new ResearchGraphValidator(),
    now: () => new Date(workflowNow),
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

describe('Research workflow persistence', () => {
  it('persists one validated execution from RUNNING to a canonical COMPLETED graph', async () => {
    const applicationId = await createSources();
    const provider = successfulProvider();
    const service = createService(provider);

    const completed = await service.researchApplication(applicationId);
    const repository = new ResearchRepository(database);
    const persisted = await repository.findById(completed.id);
    const latest = await repository.findLatestCompletedByApplicationId(
      applicationId,
    );
    const running = await repository.findRunningByApplicationId(applicationId);
    const [usageCount] = await database
      .select({ value: count() })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.operationName, RESEARCH_OPERATION_NAME));

    expect(completed).toEqual(persisted);
    expect(completed).toMatchObject({
      applicationId,
      status: 'COMPLETED',
      summaryMarkdown: expect.stringContaining('**SALARY BASE:** 85000'),
      promptVersion: 'research-v2',
      researchDate: workflowNow,
      completedAt: workflowNow,
    });
    expect(completed.warnings).toEqual([]);
    expect(completed.sources).toHaveLength(2);
    expect(completed.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: `${officialUrl}/`,
          normalizedUrl: officialUrl,
          retrievedAt: workflowNow,
        }),
      ]),
    );
    expect(completed.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'COMPANY_DESCRIPTION',
          confidence: 'HIGH',
        }),
        expect.objectContaining({
          type: 'SALARY_BASE',
          confidence: 'HIGH',
          valueJson: expect.objectContaining({ currency: 'EUR' }),
        }),
      ]),
    );
    expect(completed.relationships).toHaveLength(3);
    expect(completed.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relationship: 'SUPPORTS' }),
      ]),
    );
    expect(latest?.id).toBe(completed.id);
    expect(running).toBeNull();
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.tools).toEqual([{ type: 'web_search' }]);
    expect(usageCount?.value).toBe(1);
  });

  it('persists a sparse COMPLETED result without graph rows or a lingering RUNNING row', async () => {
    const applicationId = await createSources();
    const sparseOutput: ResearchOutput = {
      summaryMarkdown: 'Unsupported model-authored detail.',
      sources: [],
      claims: [],
      warnings: [],
    };
    const provider = new FakeLlmProvider({
      content: JSON.stringify(sparseOutput),
      model: 'offline-research-model',
      usage: { inputTokens: 60, outputTokens: 20, totalTokens: 80 },
      webSources: [],
    });
    const completed = await createService(provider).researchApplication(
      applicationId,
    );
    const repository = new ResearchRepository(database);
    const latest = await repository.findLatestCompletedByApplicationId(
      applicationId,
    );
    const running = await repository.findRunningByApplicationId(applicationId);
    const [usageCount] = await database
      .select({ value: count() })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.operationName, RESEARCH_OPERATION_NAME));

    expect(completed).toMatchObject({
      status: 'COMPLETED',
      promptVersion: 'research-v2',
      summaryMarkdown:
        'No reliable external Research findings were available for this opportunity.',
      warnings: [
        'NO_RELIABLE_COMPENSATION_DATA',
        'INSUFFICIENT_ROLE_SPECIFIC_DATA',
      ],
      sources: [],
      claims: [],
      relationships: [],
    });
    expect(latest?.id).toBe(completed.id);
    expect(running).toBeNull();
    expect(provider.requests).toHaveLength(1);
    expect(usageCount?.value).toBe(1);
  });

  it('projects an unmatched proposal to COMPLETED without graph rows', async () => {
    const applicationId = await createSources();
    const provider = successfulProvider();
    provider.setResponse({
      content: JSON.stringify(validOutput),
      model: 'offline-research-model',
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
      webSources: [{ url: 'https://unrelated.example/page' }],
    });
    const completed = await createService(provider).researchApplication(
      applicationId,
    );

    const [persisted] = await new ResearchRepository(database).listByApplicationId(
      applicationId,
    );
    const [sourceCount] = await database
      .select({ value: count() })
      .from(schema.researchSources);
    const [claimCount] = await database
      .select({ value: count() })
      .from(schema.researchClaims);
    const [relationshipCount] = await database
      .select({ value: count() })
      .from(schema.researchClaimSources);

    expect(completed).toMatchObject({
      status: 'COMPLETED',
      summaryMarkdown:
        'No reliable external Research findings were available for this opportunity.',
      sources: [],
      claims: [],
      relationships: [],
    });
    expect(persisted).toMatchObject({
      id: completed.id,
      status: 'COMPLETED',
      failureCode: null,
      failureMessage: null,
      failedAt: null,
    });
    expect(sourceCount?.value).toBe(0);
    expect(claimCount?.value).toBe(0);
    expect(relationshipCount?.value).toBe(0);
    expect(provider.requests).toHaveLength(1);
  });

  it('recovers stale history at the exact boundary and completes one new run', async () => {
    const applicationId = await createSources();
    const repository = new ResearchRepository(database);
    const stale = await repository.createRunning({
      applicationId,
      researchDate: new Date(workflowNow.getTime() - 600_000),
      startedAt: new Date(workflowNow.getTime() - 600_000),
      promptVersion: 'research-v1',
    });
    const provider = successfulProvider();
    const service = createService(provider, repository);

    const completed = await service.researchApplication(applicationId);
    const stalePersisted = await repository.findById(stale.id);
    const history = await repository.listByApplicationId(applicationId);

    expect(completed.status).toBe('COMPLETED');
    expect(stalePersisted).toMatchObject({
      status: 'FAILED',
      failureCode: 'STALE_RUN_RECOVERED',
      failedAt: workflowNow,
      sources: [],
      claims: [],
      relationships: [],
    });
    expect(history).toHaveLength(2);
    expect(provider.requests).toHaveLength(1);
  });

  it('serves history, owned detail, and latest-completed without OpenAI configuration', async () => {
    const applicationId = await createSources();
    const otherApplicationId = await createSources();
    const provider = successfulProvider();
    const completed = await createService(provider).researchApplication(
      applicationId,
    );
    const repository = new ResearchRepository(database);
    await repository.createRunning({
      applicationId,
      researchDate: new Date(workflowNow.getTime() + 60_000),
      startedAt: new Date(workflowNow.getTime() + 60_000),
      promptVersion: 'research-v1',
    });

    const originalApiKey = process.env['OPENAI_API_KEY'];
    const originalModel = process.env['LLM_MODEL'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['LLM_MODEL'];
    const app = buildApp({ database });

    try {
      const history = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${applicationId}/researches`,
      });
      expect(history.statusCode).toBe(200);
      expect(history.json().items).toHaveLength(2);
      expect(history.json().items[0]).not.toHaveProperty('sources');

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${applicationId}/researches/${completed.id}`,
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        id: completed.id,
        status: 'COMPLETED',
        summaryMarkdown: expect.stringContaining('**COMPANY DESCRIPTION:**'),
      });
      expect(detail.json().sources).toHaveLength(2);
      expect(detail.json().claims).toHaveLength(2);
      expect(detail.json().relationships).toHaveLength(3);
      expect(detail.json().sources[0]).not.toHaveProperty('normalizedUrl');

      const latest = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${applicationId}/researches/latest-completed`,
      });
      expect(latest.statusCode).toBe(200);
      expect(latest.json().id).toBe(completed.id);

      const crossApplication = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${otherApplicationId}/researches/${completed.id}`,
      });
      expect(crossApplication.statusCode).toBe(404);
      expect(crossApplication.json()).toMatchObject({
        error: { code: 'RESEARCH_NOT_FOUND' },
      });
    } finally {
      await app.close();
      if (originalApiKey === undefined) delete process.env['OPENAI_API_KEY'];
      else process.env['OPENAI_API_KEY'] = originalApiKey;
      if (originalModel === undefined) delete process.env['LLM_MODEL'];
      else process.env['LLM_MODEL'] = originalModel;
    }

    expect(provider.requests).toHaveLength(1);
  });
});
