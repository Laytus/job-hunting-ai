import { describe, expect, it } from 'vitest';
import {
  defaultLlmModel,
  defaultLlmTimeoutMs,
  loadLlmConfig,
} from './llm.config.js';

describe('LLM configuration', () => {
  it('uses a 90-second global default timeout', () => {
    expect(defaultLlmTimeoutMs).toBe(90_000);
    expect(loadLlmConfig({}).timeoutMs).toBe(90_000);
  });

  it('uses provider-independent defaults without environment variables', () => {
    expect(loadLlmConfig({})).toEqual({
      defaultModel: defaultLlmModel,
      timeoutMs: defaultLlmTimeoutMs,
    });
  });

  it('loads custom model, timeout, and token limit values', () => {
    expect(
      loadLlmConfig({
        LLM_MODEL: 'custom-model',
        LLM_TIMEOUT_MS: '5000',
        LLM_MAX_TOKENS: '2048',
      }),
    ).toEqual({
      defaultModel: 'custom-model',
      timeoutMs: 5000,
      maxTokens: 2048,
    });
  });

  it('trims a configured model identifier', () => {
    expect(loadLlmConfig({ LLM_MODEL: '  custom-model  ' }).defaultModel).toBe(
      'custom-model',
    );
  });

  it.each(['', 'abc', '0', '-100', '1.5', '1e3', '0x10', 'Infinity'])(
    'rejects invalid LLM_TIMEOUT_MS value %j',
    (value) => {
      expect(() => loadLlmConfig({ LLM_TIMEOUT_MS: value })).toThrow(
        'LLM_TIMEOUT_MS must be a positive integer.',
      );
    },
  );

  it.each(['', 'abc', '0', '-1', '1.5', '1e3', '0x10', 'Infinity'])(
    'rejects invalid LLM_MAX_TOKENS value %j',
    (value) => {
      expect(() => loadLlmConfig({ LLM_MAX_TOKENS: value })).toThrow(
        'LLM_MAX_TOKENS must be a positive integer.',
      );
    },
  );

  it('rejects a blank model identifier', () => {
    expect(() => loadLlmConfig({ LLM_MODEL: '   ' })).toThrow(
      'LLM_MODEL must be a non-empty string.',
    );
  });
});
