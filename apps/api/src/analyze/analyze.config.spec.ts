import { describe, expect, it } from 'vitest';
import {
  defaultAnalyzeRunStaleAfterMs,
  loadAnalyzeConfig,
} from './analyze.config.js';

describe('Analyze configuration', () => {
  it('uses the ten-minute stale-run default', () => {
    expect(loadAnalyzeConfig({})).toEqual({
      staleRunAfterMs: defaultAnalyzeRunStaleAfterMs,
    });
    expect(defaultAnalyzeRunStaleAfterMs).toBe(600_000);
  });

  it('loads a positive safe integer override', () => {
    expect(
      loadAnalyzeConfig({ ANALYZE_RUN_STALE_AFTER_MS: ' 120000 ' }),
    ).toEqual({ staleRunAfterMs: 120_000 });
  });

  it.each([
    '',
    'abc',
    '0',
    '-1',
    '1.5',
    '1e3',
    'Infinity',
    String(Number.MAX_SAFE_INTEGER + 1),
  ])('rejects invalid stale-run threshold %j', (value) => {
    expect(() =>
      loadAnalyzeConfig({ ANALYZE_RUN_STALE_AFTER_MS: value }),
    ).toThrow(
      'ANALYZE_RUN_STALE_AFTER_MS must be a positive safe integer.',
    );
  });
});
