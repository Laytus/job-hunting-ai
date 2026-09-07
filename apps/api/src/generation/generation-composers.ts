import type {
  ApplicationBriefGenerationContext,
  CoverLetterGenerationContext,
  GenerationResearchClaimContext,
  InterviewBriefGenerationContext,
} from './generation-context.types.js';
import { GenerationContextError } from './generation.errors.js';
import type {
  ApplicationBriefOutput,
  CoverLetterOutput,
  InterviewBriefOutput,
} from './generation.schema.js';
import type { GenerationWarning } from './generation.types.js';

function section(title: string, content: string): string {
  return `# ${title}\n${content}`;
}

function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function compactLine(value: string): string {
  return value.replaceAll(/\s*\r?\n\s*/g, ' ').trim();
}

const englishMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const frenchMonths = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

function dateParts(date: Date): {
  readonly day: number;
  readonly monthIndex: number;
  readonly year: number;
} {
  if (Number.isNaN(date.getTime())) {
    throw new GenerationContextError('INVALID_SOURCE_CONTEXT');
  }
  return {
    day: date.getUTCDate(),
    monthIndex: date.getUTCMonth(),
    year: date.getUTCFullYear(),
  };
}

function formatUtcDate(
  date: Date,
  style: CoverLetterGenerationContext['specification']['composer']['dateStyle'],
): string {
  const { day, monthIndex, year } = dateParts(date);
  const englishMonth = englishMonths[monthIndex];
  const frenchMonth = frenchMonths[monthIndex];
  if (englishMonth === undefined || frenchMonth === undefined) {
    throw new GenerationContextError('INVALID_SOURCE_CONTEXT');
  }
  switch (style) {
    case 'DAY_MONTH_YEAR_EN':
      return `${day} ${englishMonth} ${year}`;
    case 'MONTH_DAY_YEAR_EN':
      return `${englishMonth} ${day}, ${year}`;
    case 'DAY_MONTH_YEAR_FR':
      return `${day} ${frenchMonth} ${year}`;
  }
}

function candidateHeader(context: CoverLetterGenerationContext): string {
  const lines = [context.candidate.fullName];
  if (context.candidate.location !== null) {
    lines.push(context.candidate.location);
  }
  if (context.candidate.linkedinUrl !== null) {
    lines.push(`LinkedIn: ${context.candidate.linkedinUrl}`);
  }
  if (context.candidate.githubUrl !== null) {
    lines.push(`GitHub: ${context.candidate.githubUrl}`);
  }
  if (context.candidate.portfolioUrl !== null) {
    lines.push(`Portfolio: ${context.candidate.portfolioUrl}`);
  }
  return lines.map(compactLine).join('\n');
}

export interface CoverLetterCompositionInput {
  readonly date: Date;
}

function composeCoverLetterShell(
  context: CoverLetterGenerationContext,
  output: CoverLetterOutput,
  shell: {
    readonly date: string;
    readonly salutation: string;
    readonly closing: string;
  },
): string {
  const english = context.language === 'en';
  const applicationLine = english
    ? `Application for ${context.application.roleTitle}`
    : `Candidature au poste de ${context.application.roleTitle}`;
  const recipient = [context.application.companyName];
  if (context.application.location !== null) {
    recipient.push(context.application.location);
  }
  const body = [
    shell.salutation,
    ...output.paragraphs,
    `${shell.closing}\n${context.candidate.fullName}`,
  ].join('\n\n');

  return [
    section('Title', applicationLine),
    section('Candidate header', candidateHeader(context)),
    section('Recipient', recipient.map(compactLine).join('\n')),
    section('Date', shell.date),
    section('Subject', applicationLine),
    section('Body', body),
  ].join('\n\n');
}

export class CoverLetterComposer {
  compose(
    context: CoverLetterGenerationContext,
    output: CoverLetterOutput,
    input: CoverLetterCompositionInput,
  ): string {
    const shell = context.specification.composer;
    return composeCoverLetterShell(context, output, {
      date: formatUtcDate(input.date, shell.dateStyle),
      salutation: shell.salutation,
      closing: shell.closing,
    });
  }
}

function valueField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string | number | null {
  const field = value[key];
  return typeof field === 'string' || typeof field === 'number' ? field : null;
}

function claimValue(claim: GenerationResearchClaimContext): string {
  if (claim.valueText !== null) {
    return claim.valueText;
  }
  if (claim.valueJson === null) {
    return 'No readable value supplied';
  }
  return JSON.stringify(claim.valueJson);
}

function compensationValue(claim: GenerationResearchClaimContext): string {
  if (claim.valueJson === null) {
    return claimValue(claim);
  }
  const value = claim.valueJson;
  const amount = valueField(value, 'amount');
  const amountMin = valueField(value, 'amountMin');
  const amountMax = valueField(value, 'amountMax');
  const currency = valueField(value, 'currency');
  const period = valueField(value, 'period');
  const amountText =
    amount !== null
      ? String(amount)
      : amountMin !== null && amountMax !== null
        ? `${String(amountMin)}–${String(amountMax)}`
        : claimValue(claim);
  const parts = [amountText];
  if (currency !== null) {
    parts.push(String(currency));
  }
  if (period !== null) {
    parts.push(`per ${String(period).toLowerCase()}`);
  }
  for (const [key, label] of [
    ['role', 'role'],
    ['location', 'location'],
    ['seniority', 'seniority'],
    ['dataYear', 'data year'],
  ] as const) {
    const field = valueField(value, key);
    if (field !== null) {
      parts.push(`${label}: ${String(field)}`);
    }
  }
  return parts.join('; ');
}

function evidenceSummary(claim: GenerationResearchClaimContext): string {
  if (claim.evidence.length === 0) {
    return 'No linked source display metadata.';
  }
  return claim.evidence
    .map((evidence) => {
      const sourceName =
        evidence.source.publisher ?? evidence.source.title ?? 'Unnamed source';
      return `${evidence.relationship} — ${sourceName} (${evidence.source.sourceType}, ${evidence.source.sourceQuality}): ${evidence.evidenceText}`;
    })
    .join(' | ');
}

function researchBullet(claim: GenerationResearchClaimContext): string {
  const value =
    claim.type === 'SALARY_BASE' || claim.type === 'TOTAL_COMPENSATION'
      ? compensationValue(claim)
      : claimValue(claim);
  return `${claim.type}: ${value}. Evidence type: ${claim.evidenceType}; confidence: ${claim.confidence}. Sources: ${evidenceSummary(claim)}`;
}

const warningText: Record<GenerationWarning, string> = {
  NO_ANALYSIS_AVAILABLE: 'No completed Analyze result was available.',
  NO_RESEARCH_AVAILABLE: 'No completed Research result was available.',
  NO_RELIABLE_COMPANY_FACTS:
    'No reliable external company facts were available in the approved context.',
  NO_RELIABLE_INTERVIEW_DATA:
    'No reliable external interview-process information was available.',
  INSUFFICIENT_CANDIDATE_EVIDENCE:
    'Candidate evidence is limited in the current profile.',
  UNRESOLVED_HARD_CONSTRAINT:
    'At least one hard constraint remains unresolved.',
  STALE_ANALYSIS: 'The Analyze result may be stale.',
  STALE_RESEARCH: 'The Research result may be stale.',
  LOW_CONFIDENCE_RESEARCH_INCLUDED:
    'Low-confidence Research is included and should be treated cautiously.',
  OTHER: 'An additional Generation caveat applies.',
};

function caveats(warnings: readonly GenerationWarning[]): string {
  return warnings.length === 0
    ? 'No material context caveats were identified.'
    : bullets(warnings.map((warning) => warningText[warning]));
}

function applicationLines(
  context: ApplicationBriefGenerationContext,
): readonly string[] {
  const lines = [
    `Company: ${context.application.companyName}`,
    `Role: ${context.application.roleTitle}`,
  ];
  if (context.application.location !== null) {
    lines.push(`Location: ${context.application.location}`);
  }
  lines.push(`Status: ${context.application.status}`);
  lines.push(`Priority: ${context.application.priority}`);
  if (context.application.dateFound !== null) {
    lines.push(`Date found: ${context.application.dateFound}`);
  }
  if (context.application.dateApplied !== null) {
    lines.push(`Date applied: ${context.application.dateApplied}`);
  }
  return lines.map(compactLine);
}

export class ApplicationBriefComposer {
  compose(
    context: ApplicationBriefGenerationContext,
    output: ApplicationBriefOutput,
  ): string {
    const research = context.research ?? [];
    const nonCompensation = research.filter(
      (claim) =>
        claim.type !== 'SALARY_BASE' && claim.type !== 'TOTAL_COMPENSATION',
    );
    const compensation = research.filter(
      (claim) =>
        claim.type === 'SALARY_BASE' || claim.type === 'TOTAL_COMPENSATION',
    );
    const unavailableAnalyze = 'Completed Analyze data is unavailable.';
    return [
      section(
        'Title',
        `Application Brief — ${context.application.companyName} — ${context.application.roleTitle}`,
      ),
      section('Application', applicationLines(context).join('\n')),
      section('Executive summary', output.executiveSummary),
      section('Role overview', output.roleOverview),
      section(
        'Key requirements',
        context.analysis === null
          ? unavailableAnalyze
          : bullets(
              context.analysis.requirements.map(
                (item) =>
                  `${item.requirement} (${item.importance}; match: ${item.matchStrength})${item.evidence.length === 0 ? '' : ` — ${item.evidence.join('; ')}`}`,
              ),
            ) || 'No requirements were present in the completed Analyze result.',
      ),
      section(
        'Candidate strengths',
        context.analysis === null
          ? unavailableAnalyze
          : bullets(context.analysis.strengths) ||
              'No strengths were present in the completed Analyze result.',
      ),
      section(
        'Gaps and risks',
        context.analysis === null
          ? unavailableAnalyze
          : bullets(context.analysis.gaps) ||
              'No gaps were present in the completed Analyze result.',
      ),
      section(
        'Relevant research',
        nonCompensation.length === 0
          ? 'No relevant external Research findings are currently available.'
          : bullets(nonCompensation.map(researchBullet)),
      ),
      section(
        'Compensation',
        compensation.length === 0
          ? 'No reliable compensation information is currently available.'
          : bullets(compensation.map(researchBullet)),
      ),
      section('Positioning strategy', output.positioningStrategy),
      section('Points to emphasize', bullets(output.pointsToEmphasize)),
      section('Preparation priorities', bullets(output.preparationPriorities)),
      section('Caveats', caveats(context.warnings)),
    ].join('\n\n');
  }
}

function interviewApplicationLines(
  context: InterviewBriefGenerationContext,
): readonly string[] {
  const lines = [
    `Company: ${context.application.companyName}`,
    `Role: ${context.application.roleTitle}`,
  ];
  if (context.application.location !== null) {
    lines.push(`Location: ${context.application.location}`);
  }
  return lines.map(compactLine);
}

export class InterviewBriefComposer {
  compose(
    context: InterviewBriefGenerationContext,
    output: InterviewBriefOutput,
  ): string {
    const research = context.research ?? [];
    const stages = research.filter((claim) => claim.type === 'INTERVIEW_STAGE');
    const topics = research.filter((claim) => claim.type === 'INTERVIEW_TOPIC');
    const noInterviewData =
      'No reliable external interview-process information is currently available.';
    return [
      section(
        'Title',
        `Interview Brief — ${context.application.companyName} — ${context.application.roleTitle}`,
      ),
      section('Application', interviewApplicationLines(context).join('\n')),
      section('Interview objective', output.interviewObjective),
      section('Candidate positioning', output.candidatePositioning),
      section('Strengths to emphasize', bullets(output.strengthPriorities)),
      section('Gaps to prepare', bullets(output.gapPreparation)),
      section(
        'Reported interview process',
        stages.length === 0 ? noInterviewData : bullets(stages.map(researchBullet)),
      ),
      section(
        'Reported interview topics',
        topics.length === 0 ? noInterviewData : bullets(topics.map(researchBullet)),
      ),
      section('Technical preparation', bullets(output.technicalPreparation)),
      section('Behavioral preparation', bullets(output.behavioralPreparation)),
      section('Practice questions', bullets(output.practiceQuestions)),
      section(
        'Questions to ask the interviewer',
        bullets(output.questionsToAsk),
      ),
      section('Final preparation checklist', bullets(output.finalChecklist)),
      section('Research caveats', caveats(context.warnings)),
    ].join('\n\n');
  }
}
