import { describe, expect, it } from 'vitest';
import { calculateSuggestedScore } from './analyze-scoring.js';

describe('calculateSuggestedScore', () => {
  it('returns 100 for a perfect fit', () => {
    expect(
      calculateSuggestedScore([
        { importance: 'REQUIRED', matchStrength: 'STRONG' },
        { importance: 'PREFERRED', matchStrength: 'STRONG' },
        { importance: 'IMPLICIT', matchStrength: 'STRONG' },
      ]),
    ).toBe(100);
  });

  it('returns 0 when every evaluable requirement has no match', () => {
    expect(
      calculateSuggestedScore([
        { importance: 'REQUIRED', matchStrength: 'NONE' },
        { importance: 'PREFERRED', matchStrength: 'NONE' },
      ]),
    ).toBe(0);
  });

  it('applies importance and match-strength weights with deterministic rounding', () => {
    expect(
      calculateSuggestedScore([
        { importance: 'REQUIRED', matchStrength: 'STRONG' },
        { importance: 'PREFERRED', matchStrength: 'PARTIAL' },
      ]),
    ).toBe(91);
  });

  it('excludes requirements with unknown importance or match strength', () => {
    expect(
      calculateSuggestedScore([
        { importance: 'REQUIRED', matchStrength: 'PARTIAL' },
        { importance: 'UNKNOWN', matchStrength: 'STRONG' },
        { importance: 'PREFERRED', matchStrength: 'UNKNOWN' },
      ]),
    ).toBe(65);
  });

  it('returns null when no requirement is evaluable', () => {
    expect(calculateSuggestedScore([])).toBeNull();
    expect(
      calculateSuggestedScore([
        { importance: 'UNKNOWN', matchStrength: 'STRONG' },
        { importance: 'REQUIRED', matchStrength: 'UNKNOWN' },
      ]),
    ).toBeNull();
  });
});
