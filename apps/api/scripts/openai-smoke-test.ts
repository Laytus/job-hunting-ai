import { defaultLlmModel, loadLlmConfig } from '../src/llm/llm.config.js';
import { LlmProviderError } from '../src/llm/llm.errors.js';
import { OpenAiLlmProvider } from '../src/llm/openai-llm-provider.js';

async function run(): Promise<void> {
  const config = loadLlmConfig();

  if (config.defaultModel === defaultLlmModel) {
    throw new LlmProviderError(
      'Set LLM_MODEL to an OpenAI Responses API model before running the smoke test.',
    );
  }

  const provider = new OpenAiLlmProvider(config);
  const response = await provider.generate({
    messages: [
      {
        role: 'system',
        content: 'Reply with only the lowercase word ok.',
      },
      { role: 'user', content: 'Confirm connectivity.' },
    ],
  });

  console.log(`OpenAI smoke test response: ${response.content}`);
}

try {
  await run();
} catch (error) {
  const message =
    error instanceof LlmProviderError
      ? error.message
      : 'OpenAI smoke test failed unexpectedly.';
  console.error(message);
  process.exitCode = 1;
}
