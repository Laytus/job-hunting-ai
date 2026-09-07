import { describe, expect, it } from 'vitest';
import type { Application } from '../application/application.types.js';
import type { JobAnalysis } from '../analyze/analyze.types.js';
import type { CandidateAggregate } from '../candidate/candidate.types.js';
import type {
  CreateDocumentCommand,
  CreateDocumentVersionCommand,
  DocumentVersion,
  DocumentWithCurrentVersion,
} from '../document/document.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { AiUsageGuard } from '../llm/ai-usage-guard.js';
import { AiUsageRecorder } from '../llm/ai-usage-recorder.js';
import type {
  AiUsage,
  AiUsageGuardState,
  CreateAiUsageCommand,
} from '../llm/ai-usage.types.js';
import { FakeLlmProvider } from '../llm/fake-llm-provider.js';
import { LlmProviderError } from '../llm/llm.errors.js';
import type { LlmExecutionOptions, LlmExecutor } from '../llm/tracked-llm.js';
import { TrackedLlmExecutor } from '../llm/tracked-llm.js';
import type { LlmResponse } from '../llm/llm.types.js';
import type { ResearchAggregate } from '../research/research.types.js';
import {
  GenerationService,
  type GenerationDocumentPersistence,
  type GenerationServiceDependencies,
} from './generation-service.js';
import type {
  GenerationDocumentRequest,
  GenerationDocumentType,
  GenerationLanguage,
} from './generation.types.js';

const now = new Date('2026-08-28T23:30:00.000Z');
const appId = 'application-1';
const otherAppId = 'application-2';

function application(id = appId): Application {
  return {
    id,
    companyName: id === appId ? 'Example Corp' : 'Other Corp',
    roleTitle: 'Staff Engineer',
    location: 'Paris, France',
    jobUrl: null,
    source: 'CAREER_PAGE',
    status: 'INTERVIEW',
    priority: 'HIGH',
    dateFound: null,
    dateApplied: null,
    notesMarkdown: 'NEVER_PROMPT_APPLICATION_NOTES',
    createdAt: now,
    updatedAt: now,
  };
}

function candidate(): CandidateAggregate {
  return {
    id: 'candidate-1',
    fullName: 'Ada Lovelace',
    headline: 'Staff engineer',
    summaryMarkdown: 'Builds reliable TypeScript systems.',
    linkedinUrl: null,
    githubUrl: null,
    portfolioUrl: null,
    location: 'Paris, France',
    targetRoles: ['Staff Engineer'],
    targetLocations: ['Paris'],
    careerGoalsMarkdown: null,
    cvMarkdown: 'NEVER_PROMPT_CV',
    additionalContext: null,
    createdAt: now,
    updatedAt: now,
    experiences: [],
    education: [],
    projects: [],
    skills: [
      {
        id: 'skill-1',
        name: 'TypeScript',
        category: 'PROGRAMMING_LANGUAGE',
        level: 'EXPERT',
        notes: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
    languages: [],
  };
}

function jobDescription(applicationId = appId) {
  return {
    id: `job-description-${applicationId}`,
    applicationId,
    title: 'Staff Engineer',
    companyName: 'Example Corp',
    descriptionMarkdown: 'Build reliable TypeScript systems.',
    requirementsMarkdown: 'TypeScript is required.',
    responsibilitiesMarkdown: 'Lead reliability work.',
    structuredData: null,
    sourceUrl: null,
    createdAt: now,
    updatedAt: now,
  };
}

function analysis(): JobAnalysis {
  return {
    id: 'analysis-latest',
    applicationId: appId,
    status: 'COMPLETED',
    analysisData: {
      roleSummary: 'Reliability leadership role.',
      fitSummary: 'Strong TypeScript alignment.',
      requirements: [
        {
          requirement: 'TypeScript',
          importance: 'REQUIRED',
          matchStrength: 'STRONG',
          evidence: ['Canonical TypeScript skill.'],
        },
      ],
      candidateEvidence: [],
      strengths: ['TypeScript'],
      gaps: [],
      keywords: ['TypeScript'],
      hardConstraints: [],
      warnings: [],
    },
    suggestedScore: 100,
    failureCode: null,
    failureMessage: null,
    promptVersion: 'analyze-v1',
    startedAt: now,
    completedAt: now,
    failedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function research(
  applicationId = appId,
  withCompensation = false,
): ResearchAggregate {
  const base = {
    id: 'research-latest',
    applicationId,
    status: 'COMPLETED' as const,
    summaryMarkdown: null,
    warnings: [],
    promptVersion: 'research-v2',
    researchDate: now,
    failureCode: null,
    failureMessage: null,
    startedAt: now,
    completedAt: now,
    failedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  if (!withCompensation) {
    return { ...base, sources: [], claims: [], relationships: [] };
  }
  return {
    ...base,
    sources: [
      {
        id: 'research-source-1',
        researchId: base.id,
        url: 'https://salary.example/range',
        normalizedUrl: 'https://salary.example/range',
        title: 'Salary report',
        publisher: 'Salary Source',
        sourceType: 'SALARY_DATABASE',
        sourceQuality: 'MEDIUM',
        publishedAt: '2026-08-01',
        retrievedAt: now,
        notes: null,
        createdAt: now,
      },
      {
        id: 'research-source-2',
        researchId: base.id,
        url: 'https://interview.example/report',
        normalizedUrl: 'https://interview.example/report',
        title: 'Interview report',
        publisher: 'Interview Source',
        sourceType: 'INTERVIEW_REPORT',
        sourceQuality: 'MEDIUM',
        publishedAt: '2026-08-01',
        retrievedAt: now,
        notes: null,
        createdAt: now,
      },
    ],
    claims: [
      {
        id: 'claim-salary',
        researchId: base.id,
        type: 'SALARY_BASE',
        valueText: null,
        valueJson: {
          amount: null,
          amountMin: 123456,
          amountMax: 145678,
          currency: 'EUR',
          period: 'YEAR',
          role: 'Staff Engineer',
          location: 'Paris',
          seniority: 'Staff',
          dataYear: 2026,
        },
        evidenceType: 'REPORTED',
        confidence: 'MEDIUM',
        notes: null,
        createdAt: now,
      },
      {
        id: 'claim-interview',
        researchId: base.id,
        type: 'INTERVIEW_TOPIC',
        valueText: 'REPORTED_SYSTEM_DESIGN_TOPIC',
        valueJson: null,
        evidenceType: 'REPORTED',
        confidence: 'MEDIUM',
        notes: null,
        createdAt: now,
      },
    ],
    relationships: [
      {
        researchId: base.id,
        claimId: 'claim-salary',
        sourceId: 'research-source-1',
        relationship: 'SUPPORTS',
        evidenceText: 'Reported range.',
      },
      {
        researchId: base.id,
        claimId: 'claim-interview',
        sourceId: 'research-source-2',
        relationship: 'SUPPORTS',
        evidenceText: 'Reported topic.',
      },
    ],
  };
}

function outputFor(type: GenerationDocumentType): Readonly<Record<string, unknown>> {
  if (type === 'COVER_LETTER') {
    return { paragraphs: ['First paragraph.', 'Second paragraph.', 'Third paragraph.'] };
  }
  if (type === 'APPLICATION_BRIEF') {
    return {
      executiveSummary: 'Executive summary.',
      roleOverview: 'Role overview.',
      positioningStrategy: 'Positioning strategy.',
      pointsToEmphasize: ['TypeScript'],
      preparationPriorities: ['System design'],
    };
  }
  return {
    interviewObjective: 'Interview objective.',
    candidatePositioning: 'Candidate positioning.',
    strengthPriorities: ['TypeScript'],
    gapPreparation: ['Domain depth'],
    technicalPreparation: ['System design'],
    behavioralPreparation: ['Leadership example'],
    practiceQuestions: ['Design a reliable service.'],
    questionsToAsk: ['How is reliability measured?'],
    finalChecklist: ['Review examples'],
  };
}

function responseFor(type: GenerationDocumentType): LlmResponse {
  return {
    content: JSON.stringify(outputFor(type)),
    model: 'offline-generation-model',
    usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
  };
}

class UsageStore {
  readonly commands: CreateAiUsageCommand[] = [];

  async getUsageForGuard(operationName: string): Promise<AiUsageGuardState> {
    return {
      recordedCalls: this.commands.filter(
        (command) => command.operationName === operationName,
      ).length,
    };
  }

  async recordUsage(command: CreateAiUsageCommand): Promise<AiUsage> {
    this.commands.push(command);
    return {
      id: `usage-${this.commands.length}`,
      ...command,
      createdAt: now,
    };
  }
}

class MemoryDocuments implements GenerationDocumentPersistence {
  private sequence = 0;
  readonly documents = new Map<string, DocumentWithCurrentVersion>();
  readonly histories = new Map<string, DocumentVersion[]>();
  failCreate = false;
  failCreateVersion = false;

  async findByApplicationIdAndType(
    applicationId: string,
    type: GenerationDocumentType,
  ): Promise<DocumentWithCurrentVersion | null> {
    return (
      [...this.documents.values()].find(
        (document) =>
          document.applicationId === applicationId && document.type === type,
      ) ?? null
    );
  }

  async findById(id: string): Promise<DocumentWithCurrentVersion | null> {
    return this.documents.get(id) ?? null;
  }

  async create(
    command: CreateDocumentCommand,
  ): Promise<DocumentWithCurrentVersion | null> {
    if (this.failCreate) {
      throw new Error('Simulated create failure.');
    }
    this.sequence += 1;
    const id = `document-${this.sequence}`;
    const version = this.version(id, command.contentMarkdown, command.metadata);
    const document: DocumentWithCurrentVersion = {
      id,
      candidateId: command.candidateId,
      applicationId: command.applicationId,
      type: command.type,
      title: command.title,
      currentVersionId: version.id,
      currentVersion: version,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(id, document);
    this.histories.set(id, [version]);
    return document;
  }

  async createVersion(
    id: string,
    command: CreateDocumentVersionCommand,
  ): Promise<DocumentWithCurrentVersion | null> {
    if (this.failCreateVersion) {
      throw new Error('Simulated version failure.');
    }
    const current = this.documents.get(id);
    if (current === undefined) {
      return null;
    }
    const version = this.version(id, command.contentMarkdown, command.metadata);
    const updated = {
      ...current,
      currentVersionId: version.id,
      currentVersion: version,
    };
    this.documents.set(id, updated);
    this.histories.get(id)?.push(version);
    return updated;
  }

  seed(options: {
    readonly applicationId: string;
    readonly type: GenerationDocumentType | 'MARKDOWN_NOTE';
    readonly title?: string;
    readonly content?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }): DocumentWithCurrentVersion {
    this.sequence += 1;
    const id = `document-${this.sequence}`;
    const version = this.version(
      id,
      options.content ?? 'PREVIOUS_MANUAL_TEXT_SECRET',
      options.metadata ?? { origin: 'manual' },
    );
    const document: DocumentWithCurrentVersion = {
      id,
      candidateId: null,
      applicationId: options.applicationId,
      type: options.type,
      title: options.title ?? 'Existing custom title',
      currentVersionId: version.id,
      currentVersion: version,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(id, document);
    this.histories.set(id, [version]);
    return document;
  }

  private version(
    documentId: string,
    contentMarkdown: string,
    metadata: Readonly<Record<string, unknown>> | null,
  ): DocumentVersion {
    return {
      id: `${documentId}-version-${(this.histories.get(documentId)?.length ?? 0) + 1}`,
      documentId,
      contentMarkdown,
      metadata,
      createdAt: now,
    };
  }
}

interface HarnessOptions {
  readonly documentType?: GenerationDocumentType;
  readonly applicationValue?: Application | null;
  readonly candidateValue?: CandidateAggregate | null;
  readonly jobDescriptionApplicationId?: string | null;
  readonly jobDescriptionValue?: JobDescription | null;
  readonly analysisValue?: JobAnalysis | null;
  readonly researchValue?: ResearchAggregate | null;
  readonly documents?: MemoryDocuments;
  readonly executor?: LlmExecutor;
}

function harness(options: HarnessOptions = {}) {
  const type = options.documentType ?? 'COVER_LETTER';
  const provider = new FakeLlmProvider(responseFor(type));
  const usage = new UsageStore();
  const documents = options.documents ?? new MemoryDocuments();
  const researchValue =
    options.researchValue === undefined ? research() : options.researchValue;
  const dependencies: GenerationServiceDependencies = {
    applications: {
      findById: async (id) =>
        options.applicationValue === undefined
          ? application(id)
          : options.applicationValue,
    },
    candidates: {
      loadAggregate: async () =>
        options.candidateValue === undefined
          ? candidate()
          : options.candidateValue,
    },
    jobDescriptions: {
      findByApplicationId: async (id) =>
        options.jobDescriptionValue !== undefined
          ? options.jobDescriptionValue
          : options.jobDescriptionApplicationId === null
            ? null
            : jobDescription(options.jobDescriptionApplicationId ?? id),
    },
    analyses: {
      findLatestCompletedByApplicationId: async () =>
        options.analysisValue === undefined ? analysis() : options.analysisValue,
    },
    researches: {
      findLatestCompletedByApplicationId: async () => researchValue,
      findById: async () => researchValue,
    },
    documents,
    executor:
      options.executor ??
      new TrackedLlmExecutor(
        provider,
        new AiUsageGuard(usage),
        new AiUsageRecorder(usage),
      ),
    now: () => new Date(now),
  };
  return {
    service: new GenerationService(dependencies),
    provider,
    usage,
    documents,
  };
}

function request(
  documentType: GenerationDocumentType,
  outputLanguage: GenerationLanguage = 'en',
  applicationId = appId,
): GenerationDocumentRequest {
  return documentType === 'COVER_LETTER'
    ? {
        mode: 'GENERATE',
        applicationId,
        documentType,
        outputLanguage,
        market: 'FRANCE',
        sector: 'SOFTWARE_TECH',
      }
    : {
        mode: 'GENERATE',
        applicationId,
        documentType,
        outputLanguage: outputLanguage as 'en',
      };
}

describe('GenerationService Cover Letter profile suggestions', () => {
  it.each([
    ['Paris', null, 'FRANCE', 'APPLICATION_LOCATION'],
    ['London', null, 'UNITED_KINGDOM', 'APPLICATION_LOCATION'],
    ['New York', null, 'UNITED_STATES', 'APPLICATION_LOCATION'],
    ['Remote — Paris or London', null, null, 'AMBIGUOUS'],
    [null, null, null, 'NONE'],
    [
      null,
      'This role is based in London and works with the local team.',
      'UNITED_KINGDOM',
      'JOB_DESCRIPTION',
    ],
  ] as const)(
    'suggests market from location %s and bounded fallback data',
    async (location, descriptionMarkdown, value, source) => {
      const applicationValue = {
        ...application(),
        location,
        roleTitle: 'Unclassified Specialist',
      };
      const jobDescriptionValue =
        descriptionMarkdown === null
          ? null
          : {
              ...jobDescription(),
              title: null,
              descriptionMarkdown,
              requirementsMarkdown: null,
              responsibilitiesMarkdown: null,
              sourceUrl: null,
            };
      const testHarness = harness({
        applicationValue,
        jobDescriptionValue,
      });

      await expect(
        testHarness.service.suggestCoverLetterProfile(appId),
      ).resolves.toMatchObject({ market: { value, source } });
      expect(testHarness.provider.requests).toHaveLength(0);
      expect(testHarness.usage.commands).toHaveLength(0);
      expect(testHarness.documents.documents).toHaveLength(0);
    },
  );

  it('uses the frozen hostname fallback without requiring a Job Description', async () => {
    const testHarness = harness({
      applicationValue: {
        ...application(),
        roleTitle: 'Unclassified Specialist',
        location: null,
        jobUrl: 'https://careers.example.fr/open-role',
      },
      jobDescriptionValue: null,
    });

    await expect(
      testHarness.service.suggestCoverLetterProfile(appId),
    ).resolves.toMatchObject({
      market: { value: 'FRANCE', source: 'JOB_URL_DOMAIN' },
    });
    expect(testHarness.provider.requests).toHaveLength(0);
  });

  it.each([
    ['Quantitative Researcher', 'Example Corp', 'QUANT_TRADING'],
    ['Investment Banking Analyst', 'Example Corp', 'INVESTMENT_BANKING'],
    ['Asset Management Analyst', 'Example Corp', 'ASSET_MANAGEMENT'],
    ['Software Engineer', 'Example Corp', 'SOFTWARE_TECH'],
    ['Management Consultant', 'Example Corp', 'CONSULTING'],
    ['Unclassified Specialist', 'Example Corp', 'GENERAL'],
    ['Software Engineer', 'Hedge Fund Name Only', 'SOFTWARE_TECH'],
  ] as const)(
    'suggests sector %s from role-first canonical data',
    async (roleTitle, companyName, expectedSector) => {
      const testHarness = harness({
        applicationValue: {
          ...application(),
          roleTitle,
          companyName,
          location: null,
        },
        jobDescriptionValue: null,
      });

      await expect(
        testHarness.service.suggestCoverLetterProfile(appId),
      ).resolves.toMatchObject({ sector: { value: expectedSector } });
      expect(testHarness.provider.requests).toHaveLength(0);
      expect(testHarness.documents.documents).toHaveLength(0);
    },
  );

  it('uses Job Description duties only after role-title sector signals are absent', async () => {
    const testHarness = harness({
      applicationValue: {
        ...application(),
        roleTitle: 'Unclassified Specialist',
        location: null,
      },
      jobDescriptionValue: {
        ...jobDescription(),
        title: null,
        descriptionMarkdown: 'Build and operate distributed systems.',
        requirementsMarkdown: null,
        responsibilitiesMarkdown: 'Own platform engineering reliability.',
      },
    });

    await expect(
      testHarness.service.suggestCoverLetterProfile(appId),
    ).resolves.toMatchObject({
      sector: { value: 'SOFTWARE_TECH', source: 'JOB_DESCRIPTION' },
    });
    expect(testHarness.provider.requests).toHaveLength(0);
  });

  it('fails safely for a missing Application without reading generation sources', async () => {
    const testHarness = harness({
      applicationValue: null,
      jobDescriptionValue: null,
    });

    await expect(
      testHarness.service.suggestCoverLetterProfile(appId),
    ).rejects.toMatchObject({ code: 'APPLICATION_UNAVAILABLE' });
    expect(testHarness.provider.requests).toHaveLength(0);
    expect(testHarness.documents.documents).toHaveLength(0);
  });
});

describe('GenerationService preflight and dispatch', () => {
  it('fails every required-source or request precondition before provider execution', async () => {
    const cases: readonly {
      readonly setup: HarnessOptions;
      readonly request: GenerationDocumentRequest;
      readonly code: string;
    }[] = [
      {
        setup: { applicationValue: null },
        request: request('COVER_LETTER'),
        code: 'APPLICATION_UNAVAILABLE',
      },
      {
        setup: { candidateValue: null },
        request: request('COVER_LETTER'),
        code: 'CANDIDATE_UNAVAILABLE',
      },
      {
        setup: { jobDescriptionApplicationId: null },
        request: request('COVER_LETTER'),
        code: 'JOB_DESCRIPTION_UNAVAILABLE',
      },
      {
        setup: { jobDescriptionApplicationId: otherAppId },
        request: request('COVER_LETTER'),
        code: 'INVALID_GENERATION_REQUEST',
      },
      {
        setup: {},
        request: request('MARKDOWN_NOTE' as GenerationDocumentType),
        code: 'INVALID_DOCUMENT_TYPE',
      },
      {
        setup: {},
        request: request('APPLICATION_BRIEF', 'fr'),
        code: 'INVALID_OUTPUT_LANGUAGE',
      },
      {
        setup: {},
        request: request('COVER_LETTER', 'de' as GenerationLanguage),
        code: 'INVALID_OUTPUT_LANGUAGE',
      },
      {
        setup: {},
        request: {
          mode: 'GENERATE',
          applicationId: appId,
          documentType: 'COVER_LETTER',
          outputLanguage: 'en',
          sector: 'GENERAL',
        } as unknown as GenerationDocumentRequest,
        code: 'INVALID_GENERATION_REQUEST',
      },
      {
        setup: {},
        request: {
          mode: 'GENERATE',
          applicationId: appId,
          documentType: 'COVER_LETTER',
          outputLanguage: 'en',
          market: 'FRANCE',
        } as unknown as GenerationDocumentRequest,
        code: 'INVALID_GENERATION_REQUEST',
      },
      {
        setup: {},
        request: {
          mode: 'GENERATE',
          applicationId: appId,
          documentType: 'COVER_LETTER',
          outputLanguage: 'en',
          market: 'CANADA',
          sector: 'GENERAL',
        } as unknown as GenerationDocumentRequest,
        code: 'INVALID_GENERATION_REQUEST',
      },
    ];

    for (const testCase of cases) {
      const testHarness = harness(testCase.setup);
      await expect(
        testHarness.service.generateDocument(testCase.request),
      ).rejects.toMatchObject({ code: testCase.code });
      expect(testHarness.provider.requests).toHaveLength(0);
    }
  });

  it.each([
    {
      language: 'en',
      market: 'UNITED_KINGDOM',
      sector: 'QUANT_TRADING',
      expectedDate: '28 August 2026',
      expectedSalutation: 'Dear Hiring Manager,',
      expectedClosing: 'Yours faithfully,',
    },
    {
      language: 'fr',
      market: 'UNITED_STATES',
      sector: 'QUANT_TRADING',
      expectedDate: '28 août 2026',
      expectedSalutation: 'Madame, Monsieur,',
      expectedClosing: 'Cordialement,',
    },
  ] as const)(
    'generates and persists an adaptive $market/$language Cover Letter',
    async ({
      language,
      market,
      sector,
      expectedDate,
      expectedSalutation,
      expectedClosing,
    }) => {
      const testHarness = harness({ documentType: 'COVER_LETTER' });
      const result = await testHarness.service.generateDocument({
        mode: 'GENERATE',
        applicationId: appId,
        documentType: 'COVER_LETTER',
        outputLanguage: language,
        market,
        sector,
      });

      expect(result.document).toMatchObject({
        type: 'COVER_LETTER',
        title: 'Cover Letter — Example Corp — Staff Engineer',
        applicationId: appId,
      });
      expect(result.currentVersion.contentMarkdown).toContain(expectedDate);
      expect(result.currentVersion.contentMarkdown).toContain(
        expectedSalutation,
      );
      expect(result.currentVersion.contentMarkdown).toContain(expectedClosing);
      expect(result.currentVersion.metadata).toMatchObject({
        generation: {
          contextVersion: 'generation-context-v2',
          documentType: 'COVER_LETTER',
          outputLanguage: language,
          promptVersion: 'cover-letter-v4',
          templateVersion: `cover-letter-${language}-v2`,
          coverLetterMarket: market,
          coverLetterSector: sector,
          coverLetterSpecificationVersion: 'cover-letter-spec-v3',
          model: 'offline-generation-model',
          jobDescriptionId: `job-description-${appId}`,
          jobAnalysisId: 'analysis-latest',
          researchId: 'research-latest',
        },
      });
      const serializedMetadata = JSON.stringify(result.currentVersion.metadata);
      expect(serializedMetadata).not.toContain('First paragraph.');
      expect(serializedMetadata).not.toContain('messages');
      expect(serializedMetadata).not.toContain('inputTokens');
      expect(serializedMetadata).not.toContain('NEVER_PROMPT');
      expect(testHarness.provider.requests).toHaveLength(1);
      expect(testHarness.provider.requests[0]).not.toHaveProperty('tools');
      const serializedRequest = JSON.stringify(
        testHarness.provider.requests[0],
      );
      const userMessage = testHarness.provider.requests[0]?.messages[1]?.content;
      expect(serializedRequest).toContain('generation-context-v2');
      expect(userMessage).toContain(`"market": "${market}"`);
      expect(userMessage).toContain(`"sector": "${sector}"`);
      expect(serializedRequest).not.toContain('dateStyle');
      expect(testHarness.usage.commands).toEqual([
        {
          operationName: 'GENERATE_COVER_LETTER',
          model: 'offline-generation-model',
          inputTokens: 120,
          outputTokens: 80,
          totalTokens: 200,
        },
      ]);
    },
  );

  it('persists Application Brief compensation semantics and operation metadata', async () => {
    const testHarness = harness({
      documentType: 'APPLICATION_BRIEF',
      researchValue: research(appId, true),
    });
    const result = await testHarness.service.generateDocument(
      request('APPLICATION_BRIEF'),
    );

    expect(result.currentVersion.contentMarkdown).toContain(
      '123456–145678; EUR; per year; role: Staff Engineer; location: Paris; seniority: Staff; data year: 2026',
    );
    expect(result.currentVersion.metadata).toMatchObject({
      generation: {
        promptVersion: 'application-brief-v1',
        templateVersion: 'application-brief-en-v1',
        contextResearchClaimIds: ['claim-salary', 'claim-interview'],
      },
    });
    expect(testHarness.usage.commands[0]?.operationName).toBe(
      'GENERATE_APPLICATION_BRIEF',
    );
  });

  it('keeps reported Interview evidence distinct and compensation absent', async () => {
    const testHarness = harness({
      documentType: 'INTERVIEW_BRIEF',
      researchValue: research(appId, true),
    });
    const result = await testHarness.service.generateDocument(
      request('INTERVIEW_BRIEF'),
    );
    const markdown = result.currentVersion.contentMarkdown;

    expect(markdown).toContain('# Reported interview topics');
    expect(markdown).toContain('REPORTED_SYSTEM_DESIGN_TOPIC');
    expect(markdown).toContain('# Practice questions');
    expect(markdown).not.toContain('123456');
    expect(testHarness.provider.requests).toHaveLength(1);
    expect(testHarness.usage.commands[0]?.operationName).toBe(
      'GENERATE_INTERVIEW_BRIEF',
    );
  });

  it('generates with absent Analyze/Research and distinguishes sparse Research', async () => {
    const absentHarness = harness({ analysisValue: null, researchValue: null });
    const absent = await absentHarness.service.generateDocument(
      request('COVER_LETTER'),
    );
    expect(absent.warnings).toEqual([
      'NO_ANALYSIS_AVAILABLE',
      'NO_RESEARCH_AVAILABLE',
      'NO_RELIABLE_COMPANY_FACTS',
    ]);

    const sparseHarness = harness({
      documentType: 'APPLICATION_BRIEF',
      analysisValue: null,
      researchValue: research(),
    });
    const sparse = await sparseHarness.service.generateDocument(
      request('APPLICATION_BRIEF'),
    );
    expect(sparse.warnings).toEqual([
      'NO_ANALYSIS_AVAILABLE',
      'NO_RELIABLE_COMPANY_FACTS',
    ]);
  });
});

describe('GenerationService Generate and Regenerate semantics', () => {
  it('rejects an occupied logical slot before provider execution', async () => {
    const documents = new MemoryDocuments();
    documents.seed({ applicationId: appId, type: 'COVER_LETTER' });
    const testHarness = harness({ documents });

    await expect(
      testHarness.service.generateDocument(request('COVER_LETTER')),
    ).rejects.toMatchObject({ code: 'DOCUMENT_ALREADY_EXISTS' });
    expect(testHarness.provider.requests).toHaveLength(0);
    expect(documents.documents).toHaveLength(1);
  });

  it('validates Regenerate target existence, ownership, and type before execution', async () => {
    const cases = [
      {
        seed: null,
        documentId: 'missing',
        code: 'DOCUMENT_NOT_FOUND',
      },
      {
        seed: { applicationId: otherAppId, type: 'COVER_LETTER' as const },
        documentId: 'seed',
        code: 'DOCUMENT_NOT_FOUND',
      },
      {
        seed: { applicationId: appId, type: 'MARKDOWN_NOTE' as const },
        documentId: 'seed',
        code: 'INVALID_GENERATION_TARGET',
      },
    ];

    for (const testCase of cases) {
      const documents = new MemoryDocuments();
      const seeded =
        testCase.seed === null ? null : documents.seed(testCase.seed);
      const testHarness = harness({ documents });
      await expect(
        testHarness.service.generateDocument({
          mode: 'REGENERATE',
          applicationId: appId,
          documentId: seeded?.id ?? testCase.documentId,
          outputLanguage: 'en',
          market: 'FRANCE',
          sector: 'SOFTWARE_TECH',
        }),
      ).rejects.toMatchObject({ code: testCase.code });
      expect(testHarness.provider.requests).toHaveLength(0);
    }
  });

  it('regenerates from current upstream context without previous text or title changes', async () => {
    const documents = new MemoryDocuments();
    const original = documents.seed({
      applicationId: appId,
      type: 'COVER_LETTER',
      title: 'My manually curated title',
      metadata: {
        generation: {
          contextVersion: 'generation-context-v2',
          documentType: 'COVER_LETTER',
          outputLanguage: 'en',
          promptVersion: 'cover-letter-v3',
          templateVersion: 'cover-letter-en-v2',
          coverLetterMarket: 'UNITED_KINGDOM',
          coverLetterSector: 'SOFTWARE_TECH',
          coverLetterSpecificationVersion: 'cover-letter-spec-v2',
        },
      },
    });
    const previousVersionId = original.currentVersionId;
    const testHarness = harness({ documents });
    const result = await testHarness.service.generateDocument({
      mode: 'REGENERATE',
      applicationId: appId,
      documentId: original.id,
      outputLanguage: 'fr',
      market: 'UNITED_STATES',
      sector: 'QUANT_TRADING',
    });

    expect(result.document.id).toBe(original.id);
    expect(result.document.title).toBe('My manually curated title');
    expect(result.document.currentVersionId).not.toBe(previousVersionId);
    expect(documents.histories.get(original.id)).toHaveLength(2);
    expect(documents.histories.get(original.id)?.[0]?.contentMarkdown).toBe(
      'PREVIOUS_MANUAL_TEXT_SECRET',
    );
    expect(documents.histories.get(original.id)?.[0]?.metadata).toMatchObject({
      generation: {
        outputLanguage: 'en',
        promptVersion: 'cover-letter-v3',
        templateVersion: 'cover-letter-en-v2',
        coverLetterMarket: 'UNITED_KINGDOM',
        coverLetterSector: 'SOFTWARE_TECH',
        coverLetterSpecificationVersion: 'cover-letter-spec-v2',
      },
    });
    expect(result.currentVersion.metadata).toMatchObject({
      generation: {
        contextVersion: 'generation-context-v2',
        outputLanguage: 'fr',
        coverLetterMarket: 'UNITED_STATES',
        coverLetterSector: 'QUANT_TRADING',
        coverLetterSpecificationVersion: 'cover-letter-spec-v3',
        promptVersion: 'cover-letter-v4',
        templateVersion: 'cover-letter-fr-v2',
      },
    });
    expect(JSON.stringify(testHarness.provider.requests[0])).not.toContain(
      'PREVIOUS_MANUAL_TEXT_SECRET',
    );
    expect(testHarness.provider.requests).toHaveLength(1);
  });

  it('derives fixed-English brief semantics from the Regenerate target', async () => {
    const documents = new MemoryDocuments();
    const original = documents.seed({
      applicationId: appId,
      type: 'APPLICATION_BRIEF',
    });
    const testHarness = harness({
      documents,
      documentType: 'APPLICATION_BRIEF',
    });

    const result = await testHarness.service.generateDocument({
      mode: 'REGENERATE',
      applicationId: appId,
      documentId: original.id,
    });

    expect(result.document.type).toBe('APPLICATION_BRIEF');
    expect(result.currentVersion.metadata).toMatchObject({
      generation: { outputLanguage: 'en' },
    });
    expect(testHarness.provider.requests).toHaveLength(1);
  });

  it('requires an explicit language when the Regenerate target is a Cover Letter', async () => {
    const documents = new MemoryDocuments();
    const original = documents.seed({
      applicationId: appId,
      type: 'COVER_LETTER',
    });
    const testHarness = harness({ documents });

    await expect(
      testHarness.service.generateDocument({
        mode: 'REGENERATE',
        applicationId: appId,
        documentId: original.id,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_OUTPUT_LANGUAGE' });
    expect(testHarness.provider.requests).toHaveLength(0);
  });

  it.each([
    { outputLanguage: 'en' },
    { outputLanguage: 'en', market: 'FRANCE' },
    { outputLanguage: 'en', sector: 'GENERAL' },
  ])(
    'requires a complete current profile for Cover Letter Regenerate',
    async (profile) => {
      const documents = new MemoryDocuments();
      const original = documents.seed({
        applicationId: appId,
        type: 'COVER_LETTER',
      });
      const testHarness = harness({ documents });

      await expect(
        testHarness.service.generateDocument({
          mode: 'REGENERATE',
          applicationId: appId,
          documentId: original.id,
          ...profile,
        } as unknown as GenerationDocumentRequest),
      ).rejects.toMatchObject({ code: 'INVALID_GENERATION_REQUEST' });
      expect(testHarness.provider.requests).toHaveLength(0);
    },
  );

  it.each(['APPLICATION_BRIEF', 'INTERVIEW_BRIEF'] as const)(
    'rejects French when the Regenerate target is an English-only %s',
    async (documentType) => {
      const documents = new MemoryDocuments();
      const original = documents.seed({
        applicationId: appId,
        type: documentType,
      });
      const testHarness = harness({ documents, documentType });

      await expect(
        testHarness.service.generateDocument({
          mode: 'REGENERATE',
          applicationId: appId,
          documentId: original.id,
          outputLanguage: 'fr' as 'en',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_OUTPUT_LANGUAGE' });
      expect(testHarness.provider.requests).toHaveLength(0);
    },
  );

  it.each(['APPLICATION_BRIEF', 'INTERVIEW_BRIEF'] as const)(
    'rejects Cover Letter profile fields for a %s Regenerate target',
    async (documentType) => {
      const documents = new MemoryDocuments();
      const original = documents.seed({
        applicationId: appId,
        type: documentType,
      });
      const testHarness = harness({ documents, documentType });

      await expect(
        testHarness.service.generateDocument({
          mode: 'REGENERATE',
          applicationId: appId,
          documentId: original.id,
          outputLanguage: 'en',
          market: 'FRANCE',
          sector: 'GENERAL',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_GENERATION_REQUEST' });
      expect(testHarness.provider.requests).toHaveLength(0);
    },
  );
});

describe('GenerationService failure safety', () => {
  it('keeps recorded usage but persists no Document after structured validation failure', async () => {
    const testHarness = harness();
    testHarness.provider.setResponse({
      content: JSON.stringify({ paragraphs: ['too few'] }),
      model: 'offline-generation-model',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });

    await expect(
      testHarness.service.generateDocument(request('COVER_LETTER')),
    ).rejects.toMatchObject({ code: 'SCHEMA_VALIDATION_FAILED' });
    expect(testHarness.provider.requests).toHaveLength(1);
    expect(testHarness.usage.commands).toHaveLength(1);
    expect(testHarness.documents.documents).toHaveLength(0);
  });

  it('persists no Document or usage after provider failure', async () => {
    const testHarness = harness();
    const providerError = new LlmProviderError('offline provider secret');
    testHarness.provider.setError(providerError);

    await expect(
      testHarness.service.generateDocument(request('COVER_LETTER')),
    ).rejects.toBe(providerError);
    expect(testHarness.usage.commands).toHaveLength(0);
    expect(testHarness.documents.documents).toHaveLength(0);
  });

  it('wraps first persistence failure without a partial in-memory aggregate', async () => {
    const documents = new MemoryDocuments();
    documents.failCreate = true;
    const testHarness = harness({ documents });

    await expect(
      testHarness.service.generateDocument(request('COVER_LETTER')),
    ).rejects.toMatchObject({ code: 'GENERATION_PERSISTENCE_FAILED' });
    expect(testHarness.provider.requests).toHaveLength(1);
    expect(testHarness.usage.commands).toHaveLength(1);
    expect(documents.documents).toHaveLength(0);
  });

  it('leaves the prior current version unchanged when regeneration persistence fails', async () => {
    const documents = new MemoryDocuments();
    const original = documents.seed({
      applicationId: appId,
      type: 'COVER_LETTER',
    });
    documents.failCreateVersion = true;
    const testHarness = harness({ documents });

    await expect(
      testHarness.service.generateDocument({
        mode: 'REGENERATE',
        applicationId: appId,
        documentId: original.id,
        outputLanguage: 'en',
        market: 'FRANCE',
        sector: 'SOFTWARE_TECH',
      }),
    ).rejects.toMatchObject({ code: 'GENERATION_PERSISTENCE_FAILED' });
    expect(documents.documents.get(original.id)?.currentVersionId).toBe(
      original.currentVersionId,
    );
    expect(documents.histories.get(original.id)).toHaveLength(1);
    expect(testHarness.usage.commands).toHaveLength(1);
  });

  it('reports composition failure after usage without persisting a Document', async () => {
    const base = harness();
    const service = new GenerationService({
      applications: { findById: async () => application() },
      candidates: { loadAggregate: async () => candidate() },
      jobDescriptions: {
        findByApplicationId: async () => jobDescription(),
      },
      analyses: { findLatestCompletedByApplicationId: async () => analysis() },
      researches: {
        findLatestCompletedByApplicationId: async () => research(),
        findById: async () => research(),
      },
      documents: base.documents,
      executor: new TrackedLlmExecutor(
        base.provider,
        new AiUsageGuard(base.usage),
        new AiUsageRecorder(base.usage),
      ),
      now: () => new Date(Number.NaN),
    });

    await expect(
      service.generateDocument(request('COVER_LETTER')),
    ).rejects.toMatchObject({ code: 'GENERATION_COMPOSITION_FAILED' });
    expect(base.provider.requests).toHaveLength(1);
    expect(base.usage.commands).toHaveLength(1);
    expect(base.documents.documents.size).toBe(0);
  });
});

class DeferredExecutor implements LlmExecutor {
  readonly executions: LlmExecutionOptions[] = [];
  private releases: (() => void)[] = [];
  private rejectNext: Error | null = null;

  async execute(options: LlmExecutionOptions): Promise<LlmResponse> {
    this.executions.push(options);
    await new Promise<void>((resolve, reject) => {
      if (this.rejectNext !== null) {
        const error = this.rejectNext;
        this.rejectNext = null;
        reject(error);
        return;
      }
      this.releases.push(resolve);
    });
    return responseFor(options.operationName.endsWith('COVER_LETTER')
      ? 'COVER_LETTER'
      : options.operationName.endsWith('APPLICATION_BRIEF')
        ? 'APPLICATION_BRIEF'
        : 'INTERVIEW_BRIEF');
  }

  releaseAll(): void {
    const releases = this.releases;
    this.releases = [];
    for (const release of releases) {
      release();
    }
  }

  failNext(error: Error): void {
    this.rejectNext = error;
  }
}

async function waitForExecutions(
  executor: DeferredExecutor,
  expected: number,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (executor.executions.length >= expected) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting for ${expected} deferred executions.`);
}

describe('GenerationService keyed concurrency', () => {
  it('fails overlapping same-key work immediately and permits different keys', async () => {
    const executor = new DeferredExecutor();
    const testHarness = harness({ executor });
    const first = testHarness.service.generateDocument(request('COVER_LETTER'));
    await waitForExecutions(executor, 1);

    await expect(
      testHarness.service.generateDocument(request('COVER_LETTER')),
    ).rejects.toMatchObject({ code: 'GENERATION_ALREADY_RUNNING' });
    const different = testHarness.service.generateDocument(
      request('APPLICATION_BRIEF'),
    );
    await waitForExecutions(executor, 2);
    expect(executor.executions).toHaveLength(2);
    executor.releaseAll();
    await expect(first).resolves.toBeDefined();
    await expect(different).resolves.toBeDefined();
  });

  it('releases a key after failure so a later request can execute', async () => {
    const executor = new DeferredExecutor();
    executor.failNext(new LlmProviderError('offline failure'));
    const testHarness = harness({ executor });

    await expect(
      testHarness.service.generateDocument(request('COVER_LETTER')),
    ).rejects.toBeInstanceOf(LlmProviderError);
    const retry = testHarness.service.generateDocument(request('COVER_LETTER'));
    await waitForExecutions(executor, 2);
    expect(executor.executions).toHaveLength(2);
    executor.releaseAll();
    await expect(retry).resolves.toBeDefined();
  });
});
