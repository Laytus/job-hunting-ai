import { count, eq } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getTestDatabaseTarget } from '../../scripts/test-database-url.js';
import { buildApp } from '../../src/app.js';
import { AnalyzeContextBuilder } from '../../src/analyze/analyze-context-builder.js';
import { AnalyzePromptBuilder } from '../../src/analyze/analyze-prompt.js';
import type { AnalyzeOutput } from '../../src/analyze/analyze.schema.js';
import { AnalyzeService } from '../../src/analyze/analyze-service.js';
import { JobAnalysisRepository } from '../../src/analyze/job-analysis.repository.js';
import { ApplicationRepository } from '../../src/application/application.repository.js';
import { CandidateProfileRepository } from '../../src/candidate/candidate.repository.js';
import * as schema from '../../src/db/schema.js';
import { JobDescriptionRepository } from '../../src/job-description/job-description.repository.js';
import { AiUsageGuard } from '../../src/llm/ai-usage-guard.js';
import { AiUsageRecorder } from '../../src/llm/ai-usage-recorder.js';
import { AiUsageRepository } from '../../src/llm/ai-usage.repository.js';
import { FakeLlmProvider } from '../../src/llm/fake-llm-provider.js';
import { LlmProviderError } from '../../src/llm/llm.errors.js';
import { TrackedLlmExecutor } from '../../src/llm/tracked-llm.js';

type TestDatabase = PostgresJsDatabase<typeof schema>;

const workflowNow = new Date('2026-08-25T12:00:00.000Z');
const validOutput: AnalyzeOutput = {
  roleSummary: 'Build backend systems.',
  fitSummary: 'Strong fit with a partial preferred match.',
  requirements: [
    {
      requirement: 'TypeScript',
      importance: 'REQUIRED',
      matchStrength: 'STRONG',
      evidence: ['Candidate summary states TypeScript delivery.'],
    },
    {
      requirement: 'PostgreSQL',
      importance: 'PREFERRED',
      matchStrength: 'PARTIAL',
      evidence: ['Candidate summary includes PostgreSQL.'],
    },
  ],
  candidateEvidence: [
    {
      claim: 'Backend delivery experience',
      evidence: ['Candidate summary describes backend delivery.'],
    },
  ],
  strengths: ['TypeScript'],
  gaps: ['Limited PostgreSQL detail'],
  keywords: ['TypeScript', 'PostgreSQL'],
  hardConstraints: [],
  warnings: [],
};

let client: Sql;
let database: TestDatabase;

async function resetState(): Promise<void> {
  await client.unsafe('truncate table candidate_profiles cascade');
  await client.unsafe('truncate table applications cascade');
  await client.unsafe('truncate table ai_usage');
}

async function createSources(): Promise<string> {
  await database.insert(schema.candidateProfiles).values({
    fullName: 'Ada Lovelace',
    headline: 'Backend Engineer',
    summaryMarkdown: 'Delivers TypeScript and PostgreSQL services.',
  });
  const [application] = await database
    .insert(schema.applications)
    .values({
      companyName: 'Analytical Engines Ltd',
      roleTitle: 'Backend Engineer',
      source: 'CAREER_PAGE',
      status: 'FOUND',
      priority: 'MEDIUM',
    })
    .returning({ id: schema.applications.id });

  if (application === undefined) {
    throw new Error('Application fixture insert did not return a row.');
  }

  await database.insert(schema.jobDescriptions).values({
    applicationId: application.id,
    title: 'Backend Engineer',
    companyName: 'Analytical Engines Ltd',
    descriptionMarkdown: 'Build reliable TypeScript services.',
    requirementsMarkdown: 'TypeScript required. PostgreSQL preferred.',
  });
  return application.id;
}

function createService(
  provider: FakeLlmProvider,
  analyses = new JobAnalysisRepository(database),
): AnalyzeService {
  const usage = new AiUsageRepository(database);
  return new AnalyzeService({
    applications: new ApplicationRepository(database),
    candidates: new CandidateProfileRepository(database),
    jobDescriptions: new JobDescriptionRepository(database),
    analyses,
    contextBuilder: new AnalyzeContextBuilder(),
    promptBuilder: new AnalyzePromptBuilder(),
    executor: new TrackedLlmExecutor(
      provider,
      new AiUsageGuard(usage),
      new AiUsageRecorder(usage),
    ),
    config: { staleRunAfterMs: 600_000 },
    now: () => new Date(workflowNow),
  });
}

function successfulProvider(): FakeLlmProvider {
  return new FakeLlmProvider({
    content: JSON.stringify(validOutput),
    model: 'offline-analyze-model',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
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

describe('Analyze workflow persistence', () => {
  it('persists RUNNING to COMPLETED with validated output, score, version, and usage', async () => {
    const applicationId = await createSources();
    const provider = successfulProvider();
    const service = createService(provider);

    const result = await service.analyzeApplication(applicationId);
    const repository = new JobAnalysisRepository(database);
    const persisted = await repository.findById(result.analysisId);
    const [usageCount] = await database
      .select({ count: count() })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.operationName, 'ANALYZE_APPLICATION'));

    expect(result).toMatchObject({
      applicationId,
      status: 'COMPLETED',
      output: validOutput,
      suggestedScore: 91,
      promptVersion: 'analyze-v1',
    });
    expect(persisted).toMatchObject({
      status: 'COMPLETED',
      analysisData: validOutput,
      suggestedScore: 91,
      promptVersion: 'analyze-v1',
      startedAt: workflowNow,
      completedAt: workflowNow,
      failedAt: null,
    });
    expect(provider.requests).toHaveLength(1);
    expect(usageCount?.count).toBe(1);
  });

  it('persists RUNNING to FAILED when the provider fails without completed data or usage', async () => {
    const applicationId = await createSources();
    const provider = successfulProvider();
    const providerError = new LlmProviderError('offline provider failure');
    provider.setError(providerError);
    const service = createService(provider);

    await expect(service.analyzeApplication(applicationId)).rejects.toBe(
      providerError,
    );

    const [persisted] = await new JobAnalysisRepository(database).listByApplicationId(
      applicationId,
    );
    const [usageCount] = await database.select({ count: count() }).from(schema.aiUsage);

    expect(persisted).toMatchObject({
      status: 'FAILED',
      analysisData: null,
      suggestedScore: null,
      failureCode: 'LLM_PROVIDER_FAILED',
      completedAt: null,
      failedAt: workflowNow,
    });
    expect(provider.requests).toHaveLength(1);
    expect(usageCount?.count).toBe(0);
  });

  it('preserves stale history and completes one new run at the threshold boundary', async () => {
    const applicationId = await createSources();
    const repository = new JobAnalysisRepository(database);
    const stale = await repository.createRunning({
      applicationId,
      promptVersion: 'analyze-v1',
      startedAt: new Date(workflowNow.getTime() - 600_000),
    });
    const provider = successfulProvider();
    const service = createService(provider, repository);

    const result = await service.analyzeApplication(applicationId);
    const history = await repository.listByApplicationId(applicationId);
    const stalePersisted = await repository.findById(stale.id);

    expect(result.status).toBe('COMPLETED');
    expect(history).toHaveLength(2);
    expect(stalePersisted).toMatchObject({
      status: 'FAILED',
      failureCode: 'STALE_RUN_RECOVERED',
      analysisData: null,
      suggestedScore: null,
      failedAt: workflowNow,
    });
    expect(provider.requests).toHaveLength(1);
  });

  it('exposes persisted Analyze execution and reads through the real Fastify stack', async () => {
    const applicationId = await createSources();
    const provider = successfulProvider();
    const service = createService(provider);
    const app = buildApp({ database, analyzeService: service });

    try {
      const executed = await app.inject({
        method: 'POST',
        url: `/api/v1/applications/${applicationId}/analyze`,
      });
      expect(executed.statusCode).toBe(201);
      const executedBody = executed.json<{
        id: string;
        status: string;
        analysisData: AnalyzeOutput;
      }>();
      expect(executedBody).toMatchObject({
        status: 'COMPLETED',
        analysisData: validOutput,
      });

      const history = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${applicationId}/analyses`,
      });
      expect(history.statusCode).toBe(200);
      expect(history.json()).toMatchObject({
        items: [{ id: executedBody.id, status: 'COMPLETED' }],
      });
      expect(history.json().items[0]).not.toHaveProperty('analysisData');

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${applicationId}/analyses/${executedBody.id}`,
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json()).toMatchObject({
        id: executedBody.id,
        analysisData: validOutput,
      });

      const latest = await app.inject({
        method: 'GET',
        url: `/api/v1/applications/${applicationId}/analyses/latest-completed`,
      });
      expect(latest.statusCode).toBe(200);
      expect(latest.json()).toMatchObject({
        id: executedBody.id,
        analysisData: validOutput,
      });
      expect(provider.requests).toHaveLength(1);
    } finally {
      await app.close();
    }

    const originalApiKey = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    const productionReadApp = buildApp({ database });
    try {
      const historyWithoutProviderConfig = await productionReadApp.inject({
        method: 'GET',
        url: `/api/v1/applications/${applicationId}/analyses`,
      });
      expect(historyWithoutProviderConfig.statusCode).toBe(200);
      expect(historyWithoutProviderConfig.json()).toMatchObject({
        items: [{ status: 'COMPLETED' }],
      });
    } finally {
      await productionReadApp.close();
      if (originalApiKey === undefined) delete process.env['OPENAI_API_KEY'];
      else process.env['OPENAI_API_KEY'] = originalApiKey;
    }
  });
});
