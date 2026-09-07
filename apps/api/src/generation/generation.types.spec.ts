import { describe, expect, it } from 'vitest';
import {
  coverLetterMarkets,
  coverLetterMarketSuggestionSources,
  coverLetterSectors,
  coverLetterSectorSuggestionSources,
  coverLetterSpecificationVersions,
  generationContextVersions,
  generationDocumentTypes,
  generationLanguages,
  generationPromptVersions,
  generationTemplateIds,
  generationWarnings,
} from './generation.types.js';

describe('Generation foundation contract', () => {
  it('freezes the supported Generation document types and languages', () => {
    expect(generationDocumentTypes).toEqual([
      'COVER_LETTER',
      'APPLICATION_BRIEF',
      'INTERVIEW_BRIEF',
    ]);
    expect(generationLanguages).toEqual(['en', 'fr']);
  });

  it('freezes the adaptive Cover Letter profile vocabulary', () => {
    expect(coverLetterMarkets).toEqual([
      'FRANCE',
      'UNITED_KINGDOM',
      'UNITED_STATES',
    ]);
    expect(coverLetterSectors).toEqual([
      'QUANT_TRADING',
      'INVESTMENT_BANKING',
      'ASSET_MANAGEMENT',
      'SOFTWARE_TECH',
      'CONSULTING',
      'GENERAL_FINANCE',
      'GENERAL',
    ]);
    expect(coverLetterSpecificationVersions).toEqual([
      'cover-letter-spec-v1',
      'cover-letter-spec-v2',
      'cover-letter-spec-v3',
    ]);
    expect(coverLetterMarketSuggestionSources).toEqual([
      'APPLICATION_LOCATION',
      'JOB_DESCRIPTION',
      'JOB_URL_DOMAIN',
      'AMBIGUOUS',
      'NONE',
    ]);
    expect(coverLetterSectorSuggestionSources).toEqual([
      'ROLE_TITLE',
      'JOB_DESCRIPTION',
      'DEFAULT_GENERAL',
      'AMBIGUOUS',
    ]);
  });

  it('freezes the context version, template IDs, and warning vocabulary', () => {
    expect(generationContextVersions).toEqual([
      'generation-context-v1',
      'generation-context-v2',
    ]);
    expect(generationPromptVersions).toEqual([
      'cover-letter-v1',
      'cover-letter-v2',
      'cover-letter-v3',
      'cover-letter-v4',
      'application-brief-v1',
      'interview-brief-v2',
    ]);
    expect(generationTemplateIds).toEqual([
      'cover-letter-en-v1',
      'cover-letter-en-v2',
      'cover-letter-fr-v1',
      'cover-letter-fr-v2',
      'application-brief-en-v1',
      'interview-brief-en-v1',
    ]);
    expect(generationWarnings).toContain('NO_ANALYSIS_AVAILABLE');
    expect(generationWarnings).toContain('NO_RESEARCH_AVAILABLE');
    expect(generationWarnings).toContain('OTHER');
  });
});
