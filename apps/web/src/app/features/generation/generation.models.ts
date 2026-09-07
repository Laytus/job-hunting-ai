import type {
  Document,
  DocumentMetadata,
  DocumentVersion,
} from '../document/document.models';
import type { CoverLetterGenerationProfile } from './cover-letter-profile.models';

export {
  coverLetterMarketSuggestionSources,
  coverLetterMarkets,
  coverLetterSectorSuggestionSources,
  coverLetterSectors,
  generationOutputLanguages,
  isCoverLetterMarket,
  isCoverLetterSector,
  isCompleteCoverLetterProfile,
  isGenerationOutputLanguage,
} from './cover-letter-profile.models';
export type {
  CoverLetterGenerationProfile,
  CoverLetterMarket,
  CoverLetterMarketSuggestionSource,
  CoverLetterProfileSuggestion,
  CoverLetterProfileSuggestionResponse,
  CoverLetterSector,
  CoverLetterSectorSuggestionSource,
  CoverLetterVersionProfile,
  GenerationOutputLanguage,
} from './cover-letter-profile.models';

export const generationDocumentTypes = [
  'COVER_LETTER',
  'APPLICATION_BRIEF',
  'INTERVIEW_BRIEF',
] as const;

export type GenerationDocumentType =
  (typeof generationDocumentTypes)[number];

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

export type GenerateDocumentRequest =
  | ({
      readonly documentType: 'COVER_LETTER';
    } & CoverLetterGenerationProfile)
  | {
      readonly documentType: 'APPLICATION_BRIEF' | 'INTERVIEW_BRIEF';
    };

export type RegenerateDocumentRequest =
  | CoverLetterGenerationProfile
  | {
      readonly outputLanguage?: 'en';
      readonly market?: never;
      readonly sector?: never;
    };

export interface GenerationResponse {
  readonly document: Document;
  readonly currentVersion: DocumentVersion;
  readonly warnings: readonly GenerationWarning[];
}

export interface GenerationApiResponse {
  readonly document: DocumentMetadata;
  readonly currentVersion: DocumentVersion & { readonly metadata?: unknown };
  readonly warnings: readonly GenerationWarning[];
}

const generationWarningMessages: Record<GenerationWarning, string> = {
  NO_ANALYSIS_AVAILABLE: 'Generated without Analyze context.',
  NO_RESEARCH_AVAILABLE: 'Generated without external Research.',
  NO_RELIABLE_COMPANY_FACTS:
    'No reliable external company facts were available.',
  NO_RELIABLE_INTERVIEW_DATA:
    'No reliable company-specific interview-process information was available.',
  INSUFFICIENT_CANDIDATE_EVIDENCE:
    'Candidate evidence was limited for some recommendations.',
  UNRESOLVED_HARD_CONSTRAINT:
    'One or more application constraints remain unresolved.',
  STALE_ANALYSIS: 'The available Analyze context may be outdated.',
  STALE_RESEARCH: 'The available Research context may be outdated.',
  LOW_CONFIDENCE_RESEARCH_INCLUDED:
    'Some internal research findings have low confidence.',
  OTHER: 'Generation completed with an additional limitation.',
};

export function generationWarningMessage(
  warning: GenerationWarning,
): string {
  return generationWarningMessages[warning];
}

export function isGenerationDocumentType(
  type: string,
): type is GenerationDocumentType {
  return generationDocumentTypes.some((candidate) => candidate === type);
}
