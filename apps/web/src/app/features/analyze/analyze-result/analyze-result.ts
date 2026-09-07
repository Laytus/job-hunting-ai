import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import type {
  JobAnalysisDetail,
  MatchStrength,
  RequirementImportance,
} from '../analyze.models';

const importanceLabels: Record<RequirementImportance, string> = {
  REQUIRED: 'Required',
  PREFERRED: 'Preferred',
  IMPLICIT: 'Implicit',
  UNKNOWN: 'Unknown',
};

const matchStrengthLabels: Record<MatchStrength, string> = {
  STRONG: 'Strong',
  PARTIAL: 'Partial',
  WEAK: 'Weak',
  NONE: 'None',
  UNKNOWN: 'Unknown',
};

@Component({
  selector: 'app-analyze-result',
  imports: [DatePipe],
  templateUrl: './analyze-result.html',
  styleUrl: './analyze-result.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyzeResult {
  readonly analysis = input.required<JobAnalysisDetail>();
  readonly historical = input(false);

  importanceLabel(value: RequirementImportance): string {
    return importanceLabels[value];
  }

  matchStrengthLabel(value: MatchStrength): string {
    return matchStrengthLabels[value];
  }

  constraintStatus(value: boolean | null): string {
    if (value === true) return 'Satisfied';
    if (value === false) return 'Not satisfied';
    return 'Unknown';
  }

  relevantTimestamp(analysis: JobAnalysisDetail): string {
    return (
      analysis.completedAt ?? analysis.failedAt ?? analysis.startedAt
    );
  }
}
