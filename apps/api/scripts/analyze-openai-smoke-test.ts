import { AnalyzeContextBuilder } from '../src/analyze/analyze-context-builder.js';
import { AnalyzeContextError } from '../src/analyze/analyze-context.errors.js';
import { loadAnalyzeConfig } from '../src/analyze/analyze.config.js';
import { AnalyzeWorkflowError } from '../src/analyze/analyze.errors.js';
import { AnalyzePromptBuilder } from '../src/analyze/analyze-prompt.js';
import { AnalyzeService } from '../src/analyze/analyze-service.js';
import { JobAnalysisRepository } from '../src/analyze/job-analysis.repository.js';
import { ApplicationRepository } from '../src/application/application.repository.js';
import { CandidateProfileRepository } from '../src/candidate/candidate.repository.js';
import { closeDatabase, getDatabase } from '../src/db/client.js';
import { JobDescriptionRepository } from '../src/job-description/job-description.repository.js';
import { AiUsageError } from '../src/llm/ai-usage.errors.js';
import { AiUsageGuard } from '../src/llm/ai-usage-guard.js';
import { AiUsageRecorder } from '../src/llm/ai-usage-recorder.js';
import { AiUsageRepository } from '../src/llm/ai-usage.repository.js';
import { defaultLlmModel, loadLlmConfig } from '../src/llm/llm.config.js';
import { LlmProviderError } from '../src/llm/llm.errors.js';
import { OpenAiLlmProvider } from '../src/llm/openai-llm-provider.js';
import { StructuredLlmError } from '../src/llm/structured-llm.js';
import { TrackedLlmExecutor } from '../src/llm/tracked-llm.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

class AnalyzeSmokeInputError extends Error {}

async function run(): Promise<void> {
  const applicationId = process.env['ANALYZE_SMOKE_APPLICATION_ID']?.trim();
  if (applicationId === undefined || !uuidPattern.test(applicationId)) {
    throw new AnalyzeSmokeInputError(
      'ANALYZE_SMOKE_APPLICATION_ID must be a valid UUID.',
    );
  }

  const llmConfig = loadLlmConfig();
  if (llmConfig.defaultModel === defaultLlmModel) {
    throw new LlmProviderError(
      'Set LLM_MODEL to an OpenAI Responses API model before running the Analyze smoke test.',
    );
  }

  const database = getDatabase();
  const usage = new AiUsageRepository(database);
  const service = new AnalyzeService({
    applications: new ApplicationRepository(database),
    candidates: new CandidateProfileRepository(database),
    jobDescriptions: new JobDescriptionRepository(database),
    analyses: new JobAnalysisRepository(database),
    contextBuilder: new AnalyzeContextBuilder(),
    promptBuilder: new AnalyzePromptBuilder(),
    executor: new TrackedLlmExecutor(
      new OpenAiLlmProvider(llmConfig),
      new AiUsageGuard(usage),
      new AiUsageRecorder(usage),
    ),
    config: loadAnalyzeConfig(),
  });

  const result = await service.analyzeApplication(applicationId);
  console.log(
    `Analyze smoke test completed: status=${result.status} score=${result.suggestedScore ?? 'null'} promptVersion=${result.promptVersion}`,
  );
}

try {
  await run();
} catch (error) {
  const message =
    error instanceof AnalyzeSmokeInputError ||
    error instanceof AnalyzeWorkflowError ||
    error instanceof AnalyzeContextError ||
    error instanceof AiUsageError ||
    error instanceof LlmProviderError ||
    error instanceof StructuredLlmError
      ? error.message
      : 'Analyze smoke test failed unexpectedly.';
  console.error(message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
