import type {
  MatchStrength,
  RequirementImportance,
} from './analyze.types.js';

export interface ScorableAnalyzeRequirement {
  readonly importance: RequirementImportance;
  readonly matchStrength: MatchStrength;
}

const importanceWeights: Record<
  Exclude<RequirementImportance, 'UNKNOWN'>,
  number
> = {
  REQUIRED: 3,
  PREFERRED: 1,
  IMPLICIT: 0.5,
};

const matchStrengthWeights: Record<Exclude<MatchStrength, 'UNKNOWN'>, number> = {
  STRONG: 1,
  PARTIAL: 0.65,
  WEAK: 0.3,
  NONE: 0,
};

export function calculateSuggestedScore(
  requirements: readonly ScorableAnalyzeRequirement[],
): number | null {
  let weightedMatch = 0;
  let totalImportance = 0;

  for (const requirement of requirements) {
    if (
      requirement.importance === 'UNKNOWN' ||
      requirement.matchStrength === 'UNKNOWN'
    ) {
      continue;
    }

    const importanceWeight = importanceWeights[requirement.importance];
    weightedMatch +=
      matchStrengthWeights[requirement.matchStrength] * importanceWeight;
    totalImportance += importanceWeight;
  }

  return totalImportance === 0
    ? null
    : Math.round((weightedMatch / totalImportance) * 100);
}
