import { count, desc, eq } from 'drizzle-orm';
import { ApplicationRepository } from '../src/application/application.repository.js';
import { closeDatabase, getDatabase } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';
import { JobDescriptionRepository } from '../src/job-description/job-description.repository.js';
import { AiUsageError } from '../src/llm/ai-usage.errors.js';
import { AiUsageGuard } from '../src/llm/ai-usage-guard.js';
import { AiUsageRecorder } from '../src/llm/ai-usage-recorder.js';
import { AiUsageRepository } from '../src/llm/ai-usage.repository.js';
import { defaultLlmModel, loadLlmConfig } from '../src/llm/llm.config.js';
import { LlmProviderError } from '../src/llm/llm.errors.js';
import type { LlmProvider } from '../src/llm/llm-provider.js';
import type { LlmRequest, LlmResponse } from '../src/llm/llm.types.js';
import { OpenAiLlmProvider } from '../src/llm/openai-llm-provider.js';
import { StructuredLlmError } from '../src/llm/structured-llm.js';
import { TrackedLlmExecutor } from '../src/llm/tracked-llm.js';
import { ResearchContextBuilder } from '../src/research/research-context-builder.js';
import { ResearchContextError } from '../src/research/research-context.errors.js';
import {
  ResearchValidationError,
  ResearchWorkflowError,
} from '../src/research/research.errors.js';
import { ResearchGraphValidator } from '../src/research/research-graph-validator.js';
import { ResearchPromptBuilder } from '../src/research/research-prompt.js';
import { ResearchRepository } from '../src/research/research.repository.js';
import { ResearchService } from '../src/research/research-service.js';
import {
  RESEARCH_OPERATION_NAME,
  researchConfidences,
} from '../src/research/research.types.js';

class CountingProvider implements LlmProvider {
  calls = 0;
  webSourceCount = 0;

  constructor(private readonly provider: LlmProvider) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    const response = await this.provider.generate(request);
    this.webSourceCount = response.webSources?.length ?? 0;
    return response;
  }
}

async function run(): Promise<void> {
  const llmConfig = loadLlmConfig();
  if (llmConfig.defaultModel === defaultLlmModel) {
    throw new LlmProviderError(
      'Set LLM_MODEL to an OpenAI Responses API model before running the Research smoke test.',
    );
  }

  const database = getDatabase();
  const requestedApplicationId = process.env['RESEARCH_SMOKE_APPLICATION_ID'];
  if (
    requestedApplicationId === undefined ||
    requestedApplicationId.trim() === ''
  ) {
    throw new ResearchContextError('APPLICATION_UNAVAILABLE');
  }
  const applicationId = requestedApplicationId.trim();
  const usageRepository = new AiUsageRepository(database);
  const applicationRepository = new ApplicationRepository(database);
  const jobDescriptionRepository = new JobDescriptionRepository(database);
  const researchRepository = new ResearchRepository(database);
  const previousLatest =
    await researchRepository.findLatestCompletedByApplicationId(applicationId);
  const historyBefore =
    await researchRepository.listByApplicationId(applicationId);
  const [usageBefore] = await database
    .select({ value: count() })
    .from(schema.aiUsage)
    .where(eq(schema.aiUsage.operationName, RESEARCH_OPERATION_NAME));
  const provider = new CountingProvider(new OpenAiLlmProvider(llmConfig));
  try {
    const service = new ResearchService({
      applications: applicationRepository,
      jobDescriptions: jobDescriptionRepository,
      researches: researchRepository,
      contextBuilder: new ResearchContextBuilder(),
      promptBuilder: new ResearchPromptBuilder(),
      executor: new TrackedLlmExecutor(
        provider,
        new AiUsageGuard(usageRepository),
        new AiUsageRecorder(usageRepository),
      ),
      validator: new ResearchGraphValidator(),
    });

    const completed = await service.researchApplication(applicationId);
    const running = await researchRepository.findRunningByApplicationId(
      applicationId,
    );
    const latest =
      await researchRepository.findLatestCompletedByApplicationId(applicationId);
    const historyAfter =
      await researchRepository.listByApplicationId(applicationId);
    const [usageAfter] = await database
      .select({ value: count() })
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.operationName, RESEARCH_OPERATION_NAME));
    const [usage] = await database
      .select()
      .from(schema.aiUsage)
      .where(eq(schema.aiUsage.operationName, RESEARCH_OPERATION_NAME))
      .orderBy(desc(schema.aiUsage.createdAt), desc(schema.aiUsage.id))
      .limit(1);

    const sourceCount = completed.sources.length;
    const claimCount = completed.claims.length;
    const relationshipCount = completed.relationships.length;
    const confidenceCounts = Object.fromEntries(
      researchConfidences.map((confidence) => [
        confidence,
        completed.claims.filter((claim) => claim.confidence === confidence).length,
      ]),
    );
    const usageDelta = (usageAfter?.value ?? 0) - (usageBefore?.value ?? 0);
    const validConfidences = completed.claims.every((claim) =>
      researchConfidences.includes(claim.confidence),
    );
    const referencedSourceIds = new Set(
      completed.relationships.map(({ sourceId }) => sourceId),
    );
    const allSourcesReferenced = completed.sources.every(({ id }) =>
      referencedSourceIds.has(id),
    );
    const allClaimsSupported = completed.claims.every(({ id }) =>
      completed.relationships.some(
        ({ claimId, relationship }) =>
          claimId === id && relationship === 'SUPPORTS',
      ),
    );

    if (
      completed.status !== 'COMPLETED' ||
      provider.calls !== 1 ||
      provider.webSourceCount === 0 ||
      sourceCount < 1 ||
      sourceCount > 20 ||
      claimCount === 0 ||
      relationshipCount === 0 ||
      !validConfidences ||
      !allSourcesReferenced ||
      !allClaimsSupported ||
      completed.summaryMarkdown === null ||
      completed.summaryMarkdown.trim() === '' ||
      usageDelta !== 1 ||
      usage === undefined ||
      running !== null ||
      latest?.id !== completed.id ||
      historyAfter.length !== historyBefore.length + 1 ||
      (previousLatest !== null &&
        !historyAfter.some(({ id }) => id === previousLatest.id))
    ) {
      throw new Error('The Research smoke assertions did not pass.');
    }

    console.log(`Research ID: ${completed.id}`);
    console.log(`Previous latest Research ID: ${previousLatest?.id ?? 'none'}`);
    console.log(`Status: ${completed.status}`);
    console.log(`Model: ${usage.model}`);
    console.log(`Provider calls: ${provider.calls}`);
    console.log(`Provider web sources: ${provider.webSourceCount}`);
    console.log(`Sources: ${sourceCount}`);
    console.log(`Claims: ${claimCount}`);
    console.log(`Relationships: ${relationshipCount}`);
    console.log(`All sources referenced: ${allSourcesReferenced}`);
    console.log(`All claims supported: ${allClaimsSupported}`);
    console.log(`Warnings: ${completed.warnings.join(',') || 'none'}`);
    console.log(`Confidence counts: ${JSON.stringify(confidenceCounts)}`);
    console.log(
      `Token usage: input=${usage.inputTokens} output=${usage.outputTokens} total=${usage.totalTokens}`,
    );
    for (const source of completed.sources) {
      console.log(`Source: ${source.url}`);
    }
  } finally {
    console.log(`Total provider calls: ${provider.calls}`);
  }
}

try {
  await run();
} catch (error) {
  if (error instanceof ResearchValidationError) {
    console.error(`Validation: ${error.code}/${error.reason}`);
  }
  const message =
    error instanceof ResearchWorkflowError ||
    error instanceof ResearchContextError ||
    error instanceof ResearchValidationError ||
    error instanceof AiUsageError ||
    error instanceof LlmProviderError ||
    error instanceof StructuredLlmError
      ? error.message
      : 'Research smoke test failed unexpectedly.';
  console.error(message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
