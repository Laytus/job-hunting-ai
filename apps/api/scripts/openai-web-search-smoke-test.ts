import { z } from 'zod';
import { defaultLlmModel, loadLlmConfig } from '../src/llm/llm.config.js';
import { LlmProviderError } from '../src/llm/llm.errors.js';
import { OpenAiLlmProvider } from '../src/llm/openai-llm-provider.js';
import {
  generateStructured,
  StructuredLlmError,
} from '../src/llm/structured-llm.js';
import type { LlmExecutor } from '../src/llm/tracked-llm.js';

const smokeJsonSchema = {
  type: 'object',
  properties: {
    company: { type: 'string' },
    homepage: { type: 'string' },
  },
  required: ['company', 'homepage'],
  additionalProperties: false,
} as const;

const smokeRuntimeSchema = z.strictObject({
  company: z.string().min(1),
  homepage: z.string().min(1),
});

async function run(): Promise<void> {
  const config = loadLlmConfig();

  if (config.defaultModel === defaultLlmModel) {
    throw new LlmProviderError(
      'Set LLM_MODEL to a web-search-capable OpenAI Responses API model before running the smoke test.',
    );
  }

  const provider = new OpenAiLlmProvider(config);
  const executor: LlmExecutor = {
    execute: ({ request }) => provider.generate(request),
  };
  const result = await generateStructured(executor, {
    operationName: 'WEB_SEARCH_CAPABILITY_SMOKE',
    request: {
      messages: [
        {
          role: 'system',
          content:
            'Use the web search tool. Return only the requested structured data.',
        },
        {
          role: 'user',
          content: 'Find the official OpenAI company homepage.',
        },
      ],
      tools: [{ type: 'web_search' }],
    },
    responseFormat: {
      type: 'json_schema',
      name: 'web_search_capability_smoke',
      schema: smokeJsonSchema,
      strict: true,
    },
    runtimeSchema: smokeRuntimeSchema,
  });

  const webSources = result.response.webSources;
  if (webSources === undefined || webSources.length === 0) {
    throw new LlmProviderError(
      'OpenAI web-search smoke returned no provider source metadata.',
    );
  }

  const usage = result.response.usage;
  if (
    usage?.inputTokens === undefined ||
    usage.outputTokens === undefined ||
    usage.totalTokens === undefined
  ) {
    throw new LlmProviderError(
      'OpenAI web-search smoke returned no usage metadata.',
    );
  }

  const model = result.response.model;
  if (model === undefined || model.trim() === '') {
    throw new LlmProviderError(
      'OpenAI web-search smoke returned no model metadata.',
    );
  }

  console.log('OpenAI web-search smoke: structured output validated.');
  console.log(`Model: ${model}`);
  console.log(`Provider web sources: ${webSources.length}`);
  console.log(`Total tokens: ${String(usage.totalTokens)}`);
}

try {
  await run();
} catch (error) {
  const message =
    error instanceof LlmProviderError || error instanceof StructuredLlmError
      ? error.message
      : 'OpenAI web-search smoke failed unexpectedly.';
  console.error(message);
  process.exitCode = 1;
}
