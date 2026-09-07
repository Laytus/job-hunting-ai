export const generationDocumentTypes = [
  'COVER_LETTER',
  'APPLICATION_BRIEF',
  'INTERVIEW_BRIEF',
] as const;

export type GenerationDocumentType = (typeof generationDocumentTypes)[number];

export const generationLanguages = ['en', 'fr'] as const;

export type GenerationLanguage = (typeof generationLanguages)[number];

export const coverLetterMarkets = [
  'FRANCE',
  'UNITED_KINGDOM',
  'UNITED_STATES',
] as const;

export type CoverLetterMarket = (typeof coverLetterMarkets)[number];

export const coverLetterSectors = [
  'QUANT_TRADING',
  'INVESTMENT_BANKING',
  'ASSET_MANAGEMENT',
  'SOFTWARE_TECH',
  'CONSULTING',
  'GENERAL_FINANCE',
  'GENERAL',
] as const;

export type CoverLetterSector = (typeof coverLetterSectors)[number];

export interface CoverLetterProfile {
  readonly market: CoverLetterMarket;
  readonly sector: CoverLetterSector;
  readonly language: GenerationLanguage;
}

export const coverLetterSpecificationVersions = [
  'cover-letter-spec-v1',
  'cover-letter-spec-v2',
  'cover-letter-spec-v3',
] as const;

export type CoverLetterSpecificationVersion =
  (typeof coverLetterSpecificationVersions)[number];

export interface CoverLetterSpecification {
  readonly version: 'cover-letter-spec-v3';
  readonly profile: CoverLetterProfile;
  readonly writing: {
    readonly targetWords: {
      readonly minimum: number;
      readonly maximum: number;
      readonly approximateCeiling: number;
    };
    readonly paragraphStrategy: {
      readonly minimum: 3;
      readonly maximum: 5;
      readonly preferred: 4;
      readonly instructions: readonly string[];
    };
    readonly toneInstructions: readonly string[];
    readonly argumentInstructions: readonly string[];
    readonly evidenceInstructions: readonly string[];
    readonly personalizationInstructions: readonly string[];
    readonly sectorEmphasis: readonly string[];
    readonly languageInstructions: readonly string[];
    readonly antiGenericInstructions: readonly string[];
  };
  readonly composer: {
    readonly dateStyle:
      | 'DAY_MONTH_YEAR_EN'
      | 'MONTH_DAY_YEAR_EN'
      | 'DAY_MONTH_YEAR_FR';
    readonly salutation: string;
    readonly closing: string;
  };
}

export const coverLetterMarketSuggestionSources = [
  'APPLICATION_LOCATION',
  'JOB_DESCRIPTION',
  'JOB_URL_DOMAIN',
  'AMBIGUOUS',
  'NONE',
] as const;

export type CoverLetterMarketSuggestionSource =
  (typeof coverLetterMarketSuggestionSources)[number];

export interface CoverLetterMarketSuggestion {
  readonly value: CoverLetterMarket | null;
  readonly source: CoverLetterMarketSuggestionSource;
}

export const coverLetterSectorSuggestionSources = [
  'ROLE_TITLE',
  'JOB_DESCRIPTION',
  'DEFAULT_GENERAL',
  'AMBIGUOUS',
] as const;

export type CoverLetterSectorSuggestionSource =
  (typeof coverLetterSectorSuggestionSources)[number];

export interface CoverLetterSectorSuggestion {
  readonly value: CoverLetterSector;
  readonly source: CoverLetterSectorSuggestionSource;
}

export interface CoverLetterProfileSuggestion {
  readonly market: CoverLetterMarketSuggestion;
  readonly sector: CoverLetterSectorSuggestion;
}

export const generationWarnings = [
  'NO_ANALYSIS_AVAILABLE',
  'NO_RESEARCH_AVAILABLE',
  'NO_RELIABLE_COMPANY_FACTS',
  'NO_RELIABLE_INTERVIEW_DATA',
  'INSUFFICIENT_CANDIDATE_EVIDENCE',
  'UNRESOLVED_HARD_CONSTRAINT',
  'STALE_ANALYSIS',
  'STALE_RESEARCH',
  'LOW_CONFIDENCE_RESEARCH_INCLUDED',
  'OTHER',
] as const;

export type GenerationWarning = (typeof generationWarnings)[number];

export const generationPromptVersions = [
  'cover-letter-v1',
  'cover-letter-v2',
  'cover-letter-v3',
  'cover-letter-v4',
  'application-brief-v1',
  'interview-brief-v2',
] as const;

export type GenerationPromptVersion =
  (typeof generationPromptVersions)[number];

export const COVER_LETTER_PROMPT_VERSION = 'cover-letter-v4';
export const APPLICATION_BRIEF_PROMPT_VERSION = 'application-brief-v1';
export const INTERVIEW_BRIEF_PROMPT_VERSION = 'interview-brief-v2';

export const generationOperationNames = [
  'GENERATE_COVER_LETTER',
  'GENERATE_APPLICATION_BRIEF',
  'GENERATE_INTERVIEW_BRIEF',
] as const;

export type GenerationOperationName =
  (typeof generationOperationNames)[number];

export interface CoverLetterGenerationProfileFields {
  readonly outputLanguage: GenerationLanguage;
  readonly market: CoverLetterMarket;
  readonly sector: CoverLetterSector;
}

export type GenerateDocumentRequest =
  | ({
      readonly mode: 'GENERATE';
      readonly applicationId: string;
      readonly documentType: 'COVER_LETTER';
    } & CoverLetterGenerationProfileFields)
  | {
      readonly mode: 'GENERATE';
      readonly applicationId: string;
      readonly documentType: Exclude<
        GenerationDocumentType,
        'COVER_LETTER'
      >;
      readonly outputLanguage: 'en';
    };

export type RegenerateDocumentRequest =
  | ({
      readonly mode: 'REGENERATE';
      readonly applicationId: string;
      readonly documentId: string;
    } & CoverLetterGenerationProfileFields)
  | {
      readonly mode: 'REGENERATE';
      readonly applicationId: string;
      readonly documentId: string;
      readonly outputLanguage?: 'en';
      readonly market?: never;
      readonly sector?: never;
    };

export type GenerationDocumentRequest =
  | GenerateDocumentRequest
  | RegenerateDocumentRequest;

export const generationContextVersions = [
  'generation-context-v1',
  'generation-context-v2',
] as const;

export type GenerationContextVersion =
  (typeof generationContextVersions)[number];

export const generationTemplateIds = [
  'cover-letter-en-v1',
  'cover-letter-en-v2',
  'cover-letter-fr-v1',
  'cover-letter-fr-v2',
  'application-brief-en-v1',
  'interview-brief-en-v1',
] as const;

export type GenerationTemplateId = (typeof generationTemplateIds)[number];

export interface GenerationTemplateDescriptor {
  readonly id: GenerationTemplateId;
  readonly documentType: GenerationDocumentType;
  readonly language: GenerationLanguage;
  readonly version: 'v1' | 'v2';
  readonly relativePath: string;
}

export interface LoadedGenerationTemplate extends GenerationTemplateDescriptor {
  readonly content: string;
}
