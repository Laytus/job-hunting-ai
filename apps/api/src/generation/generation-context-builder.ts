import type { Application } from '../application/application.types.js';
import type { JobAnalysis } from '../analyze/analyze.types.js';
import type { CandidateAggregate } from '../candidate/candidate.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import {
  researchClaimTypes,
  type ResearchAggregate,
  type ResearchClaim,
  type ResearchClaimType,
  type ResearchJsonValue,
  type ResearchSource,
} from '../research/research.types.js';
import type {
  ApplicationBriefGenerationContext,
  CoverLetterResearchClaimContext,
  CoverLetterGenerationContext,
  GenerationAnalysisContext,
  GenerationCandidateContext,
  GenerationContextProvenance,
  GenerationJobDescriptionContext,
  GenerationResearchClaimContext,
  InterviewBriefGenerationContext,
  InterviewBriefResearchClaimType,
} from './generation-context.types.js';
import { GenerationContextError } from './generation.errors.js';
import {
  generationWarnings,
  type CoverLetterSpecification,
  type GenerationWarning,
} from './generation.types.js';

export interface GenerationContextSources {
  readonly candidate: CandidateAggregate | null | undefined;
  readonly application: Application | null | undefined;
  readonly jobDescription: JobDescription | null | undefined;
  readonly analysis: JobAnalysis | null;
  readonly research: ResearchAggregate | null;
}

const coverLetterResearchTypes = new Set<ResearchClaimType>([
  'COMPANY_DESCRIPTION',
  'BUSINESS_AREA',
  'PARIS_PRESENCE',
  'ROLE_INFORMATION',
  'TECHNOLOGY',
]);

const interviewBriefResearchTypes = new Set<ResearchClaimType>([
  'COMPANY_DESCRIPTION',
  'BUSINESS_AREA',
  'ROLE_INFORMATION',
  'TECHNOLOGY',
  'INTERVIEW_STAGE',
  'INTERVIEW_TOPIC',
  'CULTURE',
]);

const companyFactTypes = new Set<ResearchClaimType>([
  'COMPANY_DESCRIPTION',
  'BUSINESS_AREA',
  'PARIS_PRESENCE',
]);

const researchTypeOrder = new Map(
  researchClaimTypes.map((type, index) => [type, index]),
);

function nullable(value: string | null | undefined): string | null {
  return value ?? null;
}

function compareStrings(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function compareNullableStrings(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return compareStrings(left, right);
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, cloneJsonValue(nested)]),
    );
  }
  return value;
}

function cloneResearchValue(value: ResearchJsonValue | null): ResearchJsonValue | null {
  return value === null
    ? null
    : (cloneJsonValue(value) as Readonly<Record<string, unknown>>);
}

function deriveCandidateContextUpdatedAt(candidate: CandidateAggregate): string {
  let latest = candidate.updatedAt.getTime();
  for (const collection of [
    candidate.experiences,
    candidate.education,
    candidate.projects,
    candidate.skills,
    candidate.languages,
  ]) {
    for (const item of collection) {
      latest = Math.max(latest, item.updatedAt.getTime());
    }
  }
  return new Date(latest).toISOString();
}

function buildCandidate(candidate: CandidateAggregate): GenerationCandidateContext {
  return {
    fullName: candidate.fullName,
    headline: nullable(candidate.headline),
    summaryMarkdown: nullable(candidate.summaryMarkdown),
    location: nullable(candidate.location),
    linkedinUrl: nullable(candidate.linkedinUrl),
    githubUrl: nullable(candidate.githubUrl),
    portfolioUrl: nullable(candidate.portfolioUrl),
    targetRoles: [...candidate.targetRoles],
    targetLocations: [...candidate.targetLocations],
    careerGoalsMarkdown: nullable(candidate.careerGoalsMarkdown),
    additionalContext: nullable(candidate.additionalContext),
    experiences: [...candidate.experiences]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          compareStrings(right.startDate, left.startDate) ||
          compareStrings(left.id, right.id),
      )
      .map((item) => ({
        organization: item.organization,
        role: item.role,
        location: nullable(item.location),
        startDate: item.startDate,
        endDate: nullable(item.endDate),
        descriptionMarkdown: nullable(item.descriptionMarkdown),
      })),
    education: [...candidate.education]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          compareStrings(right.startDate, left.startDate) ||
          compareStrings(left.id, right.id),
      )
      .map((item) => ({
        institution: item.institution,
        degree: item.degree,
        fieldOfStudy: nullable(item.fieldOfStudy),
        location: nullable(item.location),
        startDate: item.startDate,
        endDate: nullable(item.endDate),
        descriptionMarkdown: nullable(item.descriptionMarkdown),
      })),
    projects: [...candidate.projects]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || compareStrings(left.id, right.id),
      )
      .map((item) => ({
        name: item.name,
        role: nullable(item.role),
        descriptionMarkdown: nullable(item.descriptionMarkdown),
        projectUrl: nullable(item.projectUrl),
        repositoryUrl: nullable(item.repositoryUrl),
        startDate: nullable(item.startDate),
        endDate: nullable(item.endDate),
        technologies: [...item.technologies],
      })),
    skills: [...candidate.skills]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          compareStrings(left.category, right.category) ||
          compareStrings(left.name, right.name) ||
          compareStrings(left.id, right.id),
      )
      .map((item) => ({
        name: item.name,
        category: item.category,
        level: item.level,
        notes: nullable(item.notes),
      })),
    languages: [...candidate.languages]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          compareStrings(left.language, right.language) ||
          compareStrings(left.id, right.id),
      )
      .map((item) => ({
        language: item.language,
        level: item.level,
        certification: nullable(item.certification),
        notes: nullable(item.notes),
      })),
  };
}

function buildJobDescription(
  jobDescription: JobDescription,
): GenerationJobDescriptionContext {
  return {
    title: nullable(jobDescription.title),
    companyName: nullable(jobDescription.companyName),
    descriptionMarkdown: jobDescription.descriptionMarkdown,
    requirementsMarkdown: nullable(jobDescription.requirementsMarkdown),
    responsibilitiesMarkdown: nullable(jobDescription.responsibilitiesMarkdown),
    sourceUrl: nullable(jobDescription.sourceUrl),
  };
}

function buildAnalysis(analysis: JobAnalysis | null): GenerationAnalysisContext | null {
  if (analysis === null) {
    return null;
  }
  if (analysis.status !== 'COMPLETED' || analysis.analysisData === null) {
    throw new GenerationContextError('INVALID_SOURCE_CONTEXT');
  }
  const output = analysis.analysisData;
  return {
    roleSummary: output.roleSummary,
    fitSummary: output.fitSummary,
    requirements: output.requirements.map((item) => ({
      requirement: item.requirement,
      importance: item.importance,
      matchStrength: item.matchStrength,
      evidence: [...item.evidence],
    })),
    candidateEvidence: output.candidateEvidence.map((item) => ({
      claim: item.claim,
      evidence: [...item.evidence],
    })),
    strengths: [...output.strengths],
    gaps: [...output.gaps],
    keywords: [...output.keywords],
    hardConstraints: output.hardConstraints.map((item) => ({
      constraint: item.constraint,
      satisfied: item.satisfied,
      evidence: [...item.evidence],
    })),
  };
}

function validateResearchGraph(research: ResearchAggregate): void {
  const sourceIds = new Set(research.sources.map((source) => source.id));
  const claimIds = new Set(research.claims.map((claim) => claim.id));
  if (
    research.status !== 'COMPLETED' ||
    sourceIds.size !== research.sources.length ||
    claimIds.size !== research.claims.length ||
    research.sources.some((source) => source.researchId !== research.id) ||
    research.claims.some((claim) => claim.researchId !== research.id) ||
    research.relationships.some(
      (relationship) =>
        relationship.researchId !== research.id ||
        !sourceIds.has(relationship.sourceId) ||
        !claimIds.has(relationship.claimId),
    )
  ) {
    throw new GenerationContextError('INVALID_SOURCE_CONTEXT');
  }
}

function compareClaims(left: ResearchClaim, right: ResearchClaim): number {
  return (
    (researchTypeOrder.get(left.type) ?? Number.MAX_SAFE_INTEGER) -
      (researchTypeOrder.get(right.type) ?? Number.MAX_SAFE_INTEGER) ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    compareStrings(left.id, right.id)
  );
}

function compareSources(left: ResearchSource, right: ResearchSource): number {
  return (
    compareNullableStrings(left.publisher, right.publisher) ||
    compareNullableStrings(left.title, right.title) ||
    compareStrings(left.id, right.id)
  );
}

function selectResearchClaims(
  research: ResearchAggregate | null,
  include: (claim: ResearchClaim) => boolean,
): {
  readonly claims: readonly GenerationResearchClaimContext[] | null;
  readonly claimIds: readonly string[];
} {
  if (research === null) {
    return { claims: null, claimIds: [] };
  }
  validateResearchGraph(research);
  const sources = new Map(research.sources.map((source) => [source.id, source]));
  const selected = [...research.claims].filter(include).sort(compareClaims);

  return {
    claims: selected.map((claim) => ({
      type: claim.type,
      valueText: nullable(claim.valueText),
      valueJson: cloneResearchValue(claim.valueJson),
      evidenceType: claim.evidenceType,
      confidence: claim.confidence,
      evidence: research.relationships
        .filter((relationship) => relationship.claimId === claim.id)
        .map((relationship) => ({
          relationship,
          source: sources.get(relationship.sourceId),
        }))
        .filter(
          (
            entry,
          ): entry is {
            relationship: (typeof research.relationships)[number];
            source: ResearchSource;
          } => entry.source !== undefined,
        )
        .sort(
          (left, right) =>
            compareStrings(left.relationship.relationship, right.relationship.relationship) ||
            compareSources(left.source, right.source),
        )
        .map(({ relationship, source }) => ({
          relationship: relationship.relationship,
          evidenceText: relationship.evidenceText,
          source: {
            title: nullable(source.title),
            publisher: nullable(source.publisher),
            sourceType: source.sourceType,
            sourceQuality: source.sourceQuality,
            publishedAt: nullable(source.publishedAt),
          },
        })),
    })),
    claimIds: selected.map((claim) => claim.id),
  };
}

function hasCandidateEvidence(candidate: CandidateAggregate): boolean {
  return (
    candidate.experiences.length > 0 ||
    candidate.education.length > 0 ||
    candidate.projects.length > 0 ||
    candidate.skills.length > 0 ||
    candidate.summaryMarkdown !== null ||
    candidate.headline !== null
  );
}

function deriveWarnings(options: {
  readonly candidate: CandidateAggregate;
  readonly analysis: GenerationAnalysisContext | null;
  readonly researchWasProvided: boolean;
  readonly claims: readonly GenerationResearchClaimContext[];
  readonly interviewBrief: boolean;
}): readonly GenerationWarning[] {
  const warnings = new Set<GenerationWarning>();
  if (options.analysis === null) {
    warnings.add('NO_ANALYSIS_AVAILABLE');
  }
  if (!options.researchWasProvided) {
    warnings.add('NO_RESEARCH_AVAILABLE');
  }
  if (
    !options.claims.some(
      (claim) =>
        companyFactTypes.has(claim.type) &&
        claim.evidenceType === 'FACT' &&
        claim.confidence !== 'LOW' &&
        claim.evidence.some((item) => item.relationship === 'SUPPORTS') &&
        claim.evidence.every((item) => item.relationship !== 'CONTRADICTS'),
    )
  ) {
    warnings.add('NO_RELIABLE_COMPANY_FACTS');
  }
  if (
    options.interviewBrief &&
    !options.claims.some(
      (claim) =>
        (claim.type === 'INTERVIEW_STAGE' ||
          claim.type === 'INTERVIEW_TOPIC') &&
        claim.confidence !== 'LOW' &&
        claim.evidence.some((item) => item.relationship === 'SUPPORTS') &&
        claim.evidence.every((item) => item.relationship !== 'CONTRADICTS'),
    )
  ) {
    warnings.add('NO_RELIABLE_INTERVIEW_DATA');
  }
  if (!hasCandidateEvidence(options.candidate)) {
    warnings.add('INSUFFICIENT_CANDIDATE_EVIDENCE');
  }
  if (
    options.analysis?.hardConstraints.some(
      (constraint) => constraint.satisfied === null,
    ) === true
  ) {
    warnings.add('UNRESOLVED_HARD_CONSTRAINT');
  }
  if (options.claims.some((claim) => claim.confidence === 'LOW')) {
    warnings.add('LOW_CONFIDENCE_RESEARCH_INCLUDED');
  }
  return generationWarnings.filter((warning) => warnings.has(warning));
}

interface ValidatedSources {
  readonly candidate: CandidateAggregate;
  readonly application: Application;
  readonly jobDescription: JobDescription;
  readonly jobAnalysisId: string | null;
  readonly analysis: GenerationAnalysisContext | null;
  readonly research: ResearchAggregate | null;
}

function validateSources(sources: GenerationContextSources): ValidatedSources {
  const { candidate, application, jobDescription, analysis, research } = sources;
  if (candidate == null) {
    throw new GenerationContextError('CANDIDATE_PROFILE_UNAVAILABLE');
  }
  if (application == null) {
    throw new GenerationContextError('APPLICATION_UNAVAILABLE');
  }
  if (jobDescription == null) {
    throw new GenerationContextError('JOB_DESCRIPTION_UNAVAILABLE');
  }
  if (
    jobDescription.applicationId !== application.id ||
    (analysis !== null && analysis.applicationId !== application.id) ||
    (research !== null && research.applicationId !== application.id)
  ) {
    throw new GenerationContextError('INVALID_SOURCE_CONTEXT');
  }
  if (research !== null) {
    validateResearchGraph(research);
  }
  return {
    candidate,
    application,
    jobDescription,
    jobAnalysisId: analysis?.id ?? null,
    analysis: buildAnalysis(analysis),
    research,
  };
}

function buildProvenance(
  sources: ValidatedSources,
  claimIds: readonly string[],
): GenerationContextProvenance {
  return {
    jobDescriptionId: sources.jobDescription.id,
    jobAnalysisId: sources.jobAnalysisId,
    researchId: sources.research?.id ?? null,
    candidateContextUpdatedAt: deriveCandidateContextUpdatedAt(sources.candidate),
    researchClaimIds: [...claimIds],
  };
}

export class GenerationContextBuilder {
  private buildCoverLetterBase(rawSources: GenerationContextSources) {
    const sources = validateSources(rawSources);
    const selected = selectResearchClaims(sources.research, (claim) => {
      const relationships = sources.research?.relationships.filter(
        (relationship) => relationship.claimId === claim.id,
      );
      return (
        coverLetterResearchTypes.has(claim.type) &&
        claim.evidenceType === 'FACT' &&
        claim.confidence !== 'LOW' &&
        relationships?.some(
          (relationship) => relationship.relationship === 'SUPPORTS',
        ) === true &&
        relationships.every(
          (relationship) => relationship.relationship !== 'CONTRADICTS',
        )
      );
    });
    const claims = selected.claims ?? [];
    return {
      candidate: buildCandidate(sources.candidate),
      application: {
        companyName: sources.application.companyName,
        roleTitle: sources.application.roleTitle,
        location: nullable(sources.application.location),
      },
      jobDescription: buildJobDescription(sources.jobDescription),
      analysis: sources.analysis,
      research:
        selected.claims?.map((claim) => ({
          type: claim.type,
          valueText: claim.valueText,
          valueJson: claim.valueJson,
          evidence: claim.evidence.map((evidence) => ({
            evidenceText: evidence.evidenceText,
            sourceTitle: evidence.source.title,
            publisher: evidence.source.publisher,
            publishedAt: evidence.source.publishedAt,
          })),
        })) as readonly CoverLetterResearchClaimContext[] | null,
      warnings: deriveWarnings({
        candidate: sources.candidate,
        analysis: sources.analysis,
        researchWasProvided: sources.research !== null,
        claims,
        interviewBrief: false,
      }),
      provenance: buildProvenance(sources, selected.claimIds),
    };
  }

  buildCoverLetter(
    rawSources: GenerationContextSources,
    specification: CoverLetterSpecification,
  ): CoverLetterGenerationContext {
    return {
      contextVersion: 'generation-context-v2',
      documentType: 'COVER_LETTER',
      language: specification.profile.language,
      ...this.buildCoverLetterBase(rawSources),
      specification: {
        version: specification.version,
        profile: { ...specification.profile },
        writing: {
          targetWords: { ...specification.writing.targetWords },
          paragraphStrategy: {
            ...specification.writing.paragraphStrategy,
            instructions: [
              ...specification.writing.paragraphStrategy.instructions,
            ],
          },
          toneInstructions: [...specification.writing.toneInstructions],
          argumentInstructions: [...specification.writing.argumentInstructions],
          evidenceInstructions: [...specification.writing.evidenceInstructions],
          personalizationInstructions: [
            ...specification.writing.personalizationInstructions,
          ],
          sectorEmphasis: [...specification.writing.sectorEmphasis],
          languageInstructions: [...specification.writing.languageInstructions],
          antiGenericInstructions: [
            ...specification.writing.antiGenericInstructions,
          ],
        },
        composer: { ...specification.composer },
      },
    };
  }

  buildApplicationBrief(
    rawSources: GenerationContextSources,
  ): ApplicationBriefGenerationContext {
    const sources = validateSources(rawSources);
    const selected = selectResearchClaims(sources.research, () => true);
    const claims = selected.claims ?? [];
    return {
      contextVersion: 'generation-context-v1',
      documentType: 'APPLICATION_BRIEF',
      language: 'en',
      candidate: buildCandidate(sources.candidate),
      application: {
        companyName: sources.application.companyName,
        roleTitle: sources.application.roleTitle,
        location: nullable(sources.application.location),
        source: sources.application.source,
        jobUrl: nullable(sources.application.jobUrl),
        status: sources.application.status,
        priority: sources.application.priority,
        dateFound: nullable(sources.application.dateFound),
        dateApplied: nullable(sources.application.dateApplied),
      },
      jobDescription: buildJobDescription(sources.jobDescription),
      analysis: sources.analysis,
      research: selected.claims,
      warnings: deriveWarnings({
        candidate: sources.candidate,
        analysis: sources.analysis,
        researchWasProvided: sources.research !== null,
        claims,
        interviewBrief: false,
      }),
      provenance: {
        ...buildProvenance(sources, selected.claimIds),
      },
    };
  }

  buildInterviewBrief(
    rawSources: GenerationContextSources,
  ): InterviewBriefGenerationContext {
    const sources = validateSources(rawSources);
    const selected = selectResearchClaims(sources.research, (claim) =>
      interviewBriefResearchTypes.has(claim.type),
    );
    const claims = selected.claims ?? [];
    return {
      contextVersion: 'generation-context-v1',
      documentType: 'INTERVIEW_BRIEF',
      language: 'en',
      candidate: buildCandidate(sources.candidate),
      application: {
        companyName: sources.application.companyName,
        roleTitle: sources.application.roleTitle,
        location: nullable(sources.application.location),
      },
      jobDescription: buildJobDescription(sources.jobDescription),
      analysis: sources.analysis,
      research: selected.claims as
        | readonly GenerationResearchClaimContext<InterviewBriefResearchClaimType>[]
        | null,
      warnings: deriveWarnings({
        candidate: sources.candidate,
        analysis: sources.analysis,
        researchWasProvided: sources.research !== null,
        claims,
        interviewBrief: true,
      }),
      provenance: {
        ...buildProvenance(sources, selected.claimIds),
      },
    };
  }
}
