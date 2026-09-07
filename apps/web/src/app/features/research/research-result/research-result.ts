import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { MarkdownContent } from '../../../shared/markdown-content/markdown-content';
import type {
  ResearchClaim,
  ResearchClaimType,
  ResearchConfidence,
  ResearchDetail,
  ResearchEvidenceType,
  ResearchInterviewFrequency,
  ResearchRelationship,
  ResearchRelationshipType,
  ResearchSource,
  ResearchSourceQuality,
  ResearchSourceType,
  ResearchStructuredValuePeriod,
  ResearchWarningCode,
} from '../research.models';

interface ClaimGroup {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly claims: readonly ResearchClaim[];
}

interface EvidenceItem {
  readonly relationship: ResearchRelationship;
  readonly source: ResearchSource | null;
}

const claimLabels: Record<ResearchClaimType, string> = {
  COMPANY_DESCRIPTION: 'Company description',
  BUSINESS_AREA: 'Business area',
  PARIS_PRESENCE: 'Paris presence',
  ROLE_INFORMATION: 'Role information',
  SALARY_BASE: 'Base salary',
  TOTAL_COMPENSATION: 'Total compensation',
  INTERVIEW_STAGE: 'Interview stage',
  INTERVIEW_TOPIC: 'Interview topic',
  TECHNOLOGY: 'Technology',
  CULTURE: 'Culture',
  OTHER: 'Other finding',
};

const warningLabels: Record<ResearchWarningCode, string> = {
  NO_RELIABLE_COMPENSATION_DATA: 'No reliable compensation data found.',
  CONFLICTING_SALARY_DATA:
    'Conflicting compensation information was found.',
  OUTDATED_INTERVIEW_REPORTS: 'Interview information may be outdated.',
  INSUFFICIENT_ROLE_SPECIFIC_DATA:
    'Limited role-specific public information was found.',
  AMBIGUOUS_COMPANY_MATCH:
    'The company identity could not be fully disambiguated.',
  LOW_SOURCE_QUALITY: 'Some findings rely on lower-quality sources.',
  OTHER: 'Other research limitations were identified.',
};

const confidenceLabels: Record<ResearchConfidence, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
};

const evidenceTypeLabels: Record<ResearchEvidenceType, string> = {
  FACT: 'Verified fact',
  REPORTED: 'Reported information',
  INFERRED: 'Inferred',
};

const sourceTypeLabels: Record<ResearchSourceType, string> = {
  OFFICIAL: 'Official source',
  NEWS: 'News',
  SALARY_DATABASE: 'Salary database',
  INTERVIEW_REPORT: 'Interview report',
  FORUM: 'Forum',
  OTHER: 'Other source',
};

const sourceQualityLabels: Record<ResearchSourceQuality, string> = {
  HIGH: 'High quality',
  MEDIUM: 'Medium quality',
  LOW: 'Low quality',
};

const periodLabels: Record<ResearchStructuredValuePeriod, string> = {
  HOUR: 'Per hour',
  MONTH: 'Per month',
  YEAR: 'Per year',
  OTHER: 'Other period',
};

const frequencyLabels: Record<ResearchInterviewFrequency, string> = {
  SINGLE_REPORT: 'Single report',
  MULTIPLE_REPORTS: 'Multiple reports',
  COMMON: 'Commonly reported',
  UNKNOWN: 'Frequency unknown',
};

const groupDefinitions: readonly {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly types: readonly ResearchClaimType[];
}[] = [
  {
    id: 'company-role',
    title: 'Company & role',
    description: null,
    types: [
      'COMPANY_DESCRIPTION',
      'BUSINESS_AREA',
      'PARIS_PRESENCE',
      'ROLE_INFORMATION',
    ],
  },
  {
    id: 'compensation',
    title: 'Compensation',
    description: null,
    types: ['SALARY_BASE', 'TOTAL_COMPENSATION'],
  },
  {
    id: 'interview-process',
    title: 'Interview process',
    description:
      'Reported interview experiences describe past observations and do not guarantee a future process.',
    types: ['INTERVIEW_STAGE', 'INTERVIEW_TOPIC'],
  },
  {
    id: 'technology-culture',
    title: 'Technology & culture',
    description: null,
    types: ['TECHNOLOGY', 'CULTURE', 'OTHER'],
  },
];

function fallbackLabel(value: string): string {
  const label = value.toLowerCase().replaceAll('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

@Component({
  selector: 'app-research-result',
  imports: [DatePipe, MarkdownContent],
  templateUrl: './research-result.html',
  styleUrl: './research-result.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResearchResult {
  readonly research = input.required<ResearchDetail>();
  readonly historical = input(false);

  readonly claimGroups = computed<readonly ClaimGroup[]>(() =>
    groupDefinitions
      .map((group) => ({
        id: group.id,
        title: group.title,
        description: group.description,
        claims: this.research().claims.filter((claim) =>
          group.types.includes(claim.type),
        ),
      }))
      .filter((group) => group.claims.length > 0),
  );

  private readonly sourceLookup = computed(
    () => new Map(this.research().sources.map((source) => [source.id, source])),
  );

  claimLabel(value: ResearchClaimType): string {
    return claimLabels[value] ?? fallbackLabel(value);
  }

  warningLabel(value: string): string {
    return warningLabels[value as ResearchWarningCode] ?? fallbackLabel(value);
  }

  confidenceLabel(value: ResearchConfidence): string {
    return confidenceLabels[value] ?? fallbackLabel(value);
  }

  evidenceTypeLabel(value: ResearchEvidenceType): string {
    return evidenceTypeLabels[value] ?? fallbackLabel(value);
  }

  sourceTypeLabel(value: ResearchSourceType): string {
    return sourceTypeLabels[value] ?? fallbackLabel(value);
  }

  sourceQualityLabel(value: ResearchSourceQuality): string {
    return sourceQualityLabels[value] ?? fallbackLabel(value);
  }

  periodLabel(value: ResearchStructuredValuePeriod): string {
    return periodLabels[value] ?? fallbackLabel(value);
  }

  frequencyLabel(value: ResearchInterviewFrequency): string {
    return frequencyLabels[value] ?? fallbackLabel(value);
  }

  isCompensationClaim(claim: ResearchClaim): boolean {
    return claim.type === 'SALARY_BASE' || claim.type === 'TOTAL_COMPENSATION';
  }

  isInterviewClaim(claim: ResearchClaim): boolean {
    return claim.type === 'INTERVIEW_STAGE' || claim.type === 'INTERVIEW_TOPIC';
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(amount);
  }

  compensationAmount(claim: ResearchClaim): string | null {
    const value = claim.valueJson;
    if (value === null) {
      return null;
    }

    let amount: string | null = null;
    if (value.amount !== null) {
      amount = this.formatAmount(value.amount);
    } else if (value.amountMin != null && value.amountMax != null) {
      amount = `${this.formatAmount(value.amountMin)}–${this.formatAmount(
        value.amountMax,
      )}`;
    }

    return amount === null
      ? null
      : `${amount}${value.currency === null ? '' : ` ${value.currency}`}`;
  }

  evidenceFor(
    claimId: string,
    relationshipType: ResearchRelationshipType,
  ): readonly EvidenceItem[] {
    return this.research().relationships
      .filter(
        (relationship) =>
          relationship.claimId === claimId &&
          relationship.relationship === relationshipType,
      )
      .map((relationship) => ({
        relationship,
        source: this.sourceLookup().get(relationship.sourceId) ?? null,
      }));
  }

  sourceName(source: ResearchSource): string {
    return source.title ?? source.publisher ?? 'Open source';
  }

  relevantTimestamp(research: ResearchDetail): string {
    return research.completedAt ?? research.failedAt ?? research.startedAt;
  }
}
