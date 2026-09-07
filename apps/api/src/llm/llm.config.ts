export interface LlmConfig {
  readonly defaultModel: string;
  readonly timeoutMs: number;
  readonly maxTokens?: number;
}

export const defaultLlmModel = 'default';
export const defaultLlmTimeoutMs = 90_000;

function parsePositiveInteger(
  value: string | undefined,
  variableName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  const parsed = Number(normalized);
  if (
    !/^\d+$/u.test(normalized) ||
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(`${variableName} must be a positive integer.`);
  }

  return parsed;
}

function parseModel(value: string | undefined): string {
  if (value === undefined) {
    return defaultLlmModel;
  }

  const model = value.trim();
  if (model === '') {
    throw new Error('LLM_MODEL must be a non-empty string.');
  }

  return model;
}

export function loadLlmConfig(
  environment: NodeJS.ProcessEnv = process.env,
): LlmConfig {
  const maxTokens = parsePositiveInteger(
    environment['LLM_MAX_TOKENS'],
    'LLM_MAX_TOKENS',
  );

  return {
    defaultModel: parseModel(environment['LLM_MODEL']),
    timeoutMs:
      parsePositiveInteger(environment['LLM_TIMEOUT_MS'], 'LLM_TIMEOUT_MS') ??
      defaultLlmTimeoutMs,
    ...(maxTokens === undefined ? {} : { maxTokens }),
  };
}
