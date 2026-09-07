export const generationOutputLanguages = ['en', 'fr'] as const;

export type GenerationOutputLanguage =
  (typeof generationOutputLanguages)[number];

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

export interface CoverLetterGenerationProfile {
  readonly outputLanguage: GenerationOutputLanguage;
  readonly market: CoverLetterMarket;
  readonly sector: CoverLetterSector;
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

export const coverLetterSectorSuggestionSources = [
  'ROLE_TITLE',
  'JOB_DESCRIPTION',
  'DEFAULT_GENERAL',
  'AMBIGUOUS',
] as const;

export type CoverLetterSectorSuggestionSource =
  (typeof coverLetterSectorSuggestionSources)[number];

export interface CoverLetterProfileSuggestion {
  readonly market: {
    readonly value: CoverLetterMarket | null;
    readonly source: CoverLetterMarketSuggestionSource;
  };
  readonly sector: {
    readonly value: CoverLetterSector;
    readonly source: CoverLetterSectorSuggestionSource;
  };
}

export interface CoverLetterProfileSuggestionResponse {
  readonly suggestion: CoverLetterProfileSuggestion;
}

export interface CoverLetterVersionProfile {
  readonly outputLanguage?: GenerationOutputLanguage;
  readonly market?: CoverLetterMarket;
  readonly sector?: CoverLetterSector;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isGenerationOutputLanguage(
  value: unknown,
): value is GenerationOutputLanguage {
  return generationOutputLanguages.some((candidate) => candidate === value);
}

export function isCoverLetterMarket(
  value: unknown,
): value is CoverLetterMarket {
  return coverLetterMarkets.some((candidate) => candidate === value);
}

export function isCoverLetterSector(
  value: unknown,
): value is CoverLetterSector {
  return coverLetterSectors.some((candidate) => candidate === value);
}

export function coverLetterVersionProfileFromMetadata(
  metadata: unknown,
): CoverLetterVersionProfile | null {
  if (!isRecord(metadata) || !isRecord(metadata['generation'])) {
    return null;
  }

  const generation = metadata['generation'];
  const outputLanguage = generation['outputLanguage'];
  const market = generation['coverLetterMarket'];
  const sector = generation['coverLetterSector'];
  const profile: CoverLetterVersionProfile = {
    ...(isGenerationOutputLanguage(outputLanguage) ? { outputLanguage } : {}),
    ...(isCoverLetterMarket(market) ? { market } : {}),
    ...(isCoverLetterSector(sector) ? { sector } : {}),
  };

  return Object.keys(profile).length === 0 ? null : profile;
}

export function isCompleteCoverLetterProfile(
  profile: CoverLetterVersionProfile | null | undefined,
): profile is CoverLetterGenerationProfile {
  return (
    isGenerationOutputLanguage(profile?.outputLanguage) &&
    isCoverLetterMarket(profile.market) &&
    isCoverLetterSector(profile.sector)
  );
}
