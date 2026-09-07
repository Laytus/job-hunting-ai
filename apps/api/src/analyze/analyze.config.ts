export interface AnalyzeConfig {
  readonly staleRunAfterMs: number;
}

export const defaultAnalyzeRunStaleAfterMs = 600_000;

function parsePositiveSafeInteger(
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
    throw new Error(`${variableName} must be a positive safe integer.`);
  }

  return parsed;
}

export function loadAnalyzeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AnalyzeConfig {
  return {
    staleRunAfterMs:
      parsePositiveSafeInteger(
        environment['ANALYZE_RUN_STALE_AFTER_MS'],
        'ANALYZE_RUN_STALE_AFTER_MS',
      ) ?? defaultAnalyzeRunStaleAfterMs,
  };
}
