import type { Application } from '../application/application.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { resolveCoverLetterSpecification } from './cover-letter-specification.js';
import {
  coverLetterMarkets,
  type CoverLetterMarket,
  type CoverLetterMarketSuggestion,
  type CoverLetterMarketSuggestionSource,
  type CoverLetterProfile,
  type CoverLetterProfileSuggestion,
  type CoverLetterSector,
  type CoverLetterSectorSuggestion,
  type CoverLetterSpecification,
} from './generation.types.js';

type ClassifiedSector = Exclude<CoverLetterSector, 'GENERAL'>;

const classifiedSectors = [
  'QUANT_TRADING',
  'INVESTMENT_BANKING',
  'ASSET_MANAGEMENT',
  'SOFTWARE_TECH',
  'CONSULTING',
  'GENERAL_FINANCE',
] as const satisfies readonly ClassifiedSector[];

const marketSignals = {
  FRANCE: [
    'france',
    'ile de france',
    'paris',
    'lyon',
    'marseille',
    'toulouse',
    'lille',
    'bordeaux',
    'nantes',
    'nice',
    'strasbourg',
    'grenoble',
    'rennes',
    'montpellier',
  ],
  UNITED_KINGDOM: [
    'united kingdom',
    'uk',
    'u k',
    'great britain',
    'britain',
    'england',
    'scotland',
    'wales',
    'northern ireland',
    'london',
    'edinburgh',
    'glasgow',
    'manchester',
    'birmingham',
    'bristol',
    'cambridge',
    'oxford',
    'leeds',
  ],
  UNITED_STATES: [
    'united states',
    'united states of america',
    'usa',
    'u s a',
    'u s',
    'new york',
    'nyc',
    'boston',
    'chicago',
    'san francisco',
    'bay area',
    'seattle',
    'los angeles',
    'washington dc',
    'austin',
    'miami',
  ],
} as const satisfies Record<CoverLetterMarket, readonly string[]>;

const titleSignals = {
  QUANT_TRADING: [
    'quantitative researcher',
    'quant researcher',
    'quantitative trader',
    'quant trader',
    'algorithmic trader',
    'systematic trader',
    'quantitative developer',
    'quant developer',
  ],
  INVESTMENT_BANKING: [
    'investment banking analyst',
    'investment banking associate',
    'm and a analyst',
    'mergers and acquisitions analyst',
    'capital markets analyst',
  ],
  ASSET_MANAGEMENT: [
    'portfolio manager',
    'portfolio analyst',
    'asset management analyst',
    'investment research analyst',
    'equity research analyst',
    'fixed income analyst',
  ],
  SOFTWARE_TECH: [
    'software engineer',
    'software developer',
    'backend engineer',
    'frontend engineer',
    'full stack engineer',
    'platform engineer',
    'site reliability engineer',
    'security engineer',
    'data engineer',
    'machine learning engineer',
  ],
  CONSULTING: [
    'management consultant',
    'strategy consultant',
    'technology consultant',
    'business consultant',
    'associate consultant',
  ],
  GENERAL_FINANCE: [
    'financial analyst',
    'finance analyst',
    'treasury analyst',
    'risk analyst',
    'finance manager',
    'financial planning and analysis',
  ],
} as const satisfies Record<ClassifiedSector, readonly string[]>;

const dutySignals = {
  QUANT_TRADING: [
    'alpha research',
    'quantitative research',
    'systematic strategy',
    'systematic trading',
    'trading strategy',
    'market microstructure',
    'quantitative models',
    'execution algorithms',
  ],
  INVESTMENT_BANKING: [
    'mergers and acquisitions',
    'm and a',
    'deal execution',
    'transaction execution',
    'capital markets',
    'financial modelling',
    'financial modeling',
    'pitch books',
  ],
  ASSET_MANAGEMENT: [
    'portfolio construction',
    'asset allocation',
    'security selection',
    'investment research',
    'fund management',
    'portfolio analytics',
  ],
  SOFTWARE_TECH: [
    'distributed systems',
    'backend systems',
    'frontend applications',
    'software development',
    'platform engineering',
    'site reliability',
    'cloud infrastructure',
    'application programming interfaces',
  ],
  CONSULTING: [
    'client engagements',
    'case team',
    'client stakeholders',
    'client recommendations',
    'consulting engagements',
    'workstreams',
  ],
  GENERAL_FINANCE: [
    'financial planning',
    'financial analysis',
    'treasury',
    'risk management',
    'financial reporting',
    'finance operations',
    'corporate finance',
  ],
} as const satisfies Record<ClassifiedSector, readonly string[]>;

function normalizeSuggestionText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function containsPhrase(normalizedText: string, phrase: string): boolean {
  return ` ${normalizedText} `.includes(` ${phrase} `);
}

function onlyValue<T>(values: ReadonlySet<T>): T | null {
  if (values.size !== 1) {
    return null;
  }

  for (const value of values) {
    return value;
  }

  return null;
}

function matchMarkets(value: string | null): ReadonlySet<CoverLetterMarket> {
  const matches = new Set<CoverLetterMarket>();
  if (value === null) {
    return matches;
  }

  const normalized = normalizeSuggestionText(value);
  for (const market of coverLetterMarkets) {
    if (
      marketSignals[market].some((signal) =>
        containsPhrase(normalized, signal),
      )
    ) {
      matches.add(market);
    }
  }

  return matches;
}

function marketSuggestionFromMatches(
  matches: ReadonlySet<CoverLetterMarket>,
  source: Exclude<
    CoverLetterMarketSuggestionSource,
    'AMBIGUOUS' | 'NONE'
  >,
): CoverLetterMarketSuggestion | null {
  const value = onlyValue(matches);
  if (value !== null) {
    return { value, source };
  }
  if (matches.size > 1) {
    return { value: null, source: 'AMBIGUOUS' };
  }
  return null;
}

function combineJobDescriptionText(
  jobDescription: JobDescription | null,
): string {
  if (jobDescription === null) {
    return '';
  }

  return [
    jobDescription.title,
    jobDescription.descriptionMarkdown,
    jobDescription.requirementsMarkdown,
    jobDescription.responsibilitiesMarkdown,
  ]
    .filter((value): value is string => value !== null)
    .join(' ');
}

function marketFromUrl(value: string | null): CoverLetterMarket | null {
  if (value === null) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
  if (hostname.endsWith('.fr')) {
    return 'FRANCE';
  }
  if (hostname.endsWith('.co.uk') || hostname.endsWith('.uk')) {
    return 'UNITED_KINGDOM';
  }
  if (hostname.endsWith('.us')) {
    return 'UNITED_STATES';
  }
  return null;
}

function suggestMarket(
  application: Application,
  jobDescription: JobDescription | null,
): CoverLetterMarketSuggestion {
  const applicationLocation = marketSuggestionFromMatches(
    matchMarkets(application.location),
    'APPLICATION_LOCATION',
  );
  if (applicationLocation !== null) {
    return applicationLocation;
  }

  const jobDescriptionMatch = marketSuggestionFromMatches(
    matchMarkets(combineJobDescriptionText(jobDescription)),
    'JOB_DESCRIPTION',
  );
  if (jobDescriptionMatch !== null) {
    return jobDescriptionMatch;
  }

  const urlMatches = new Set<CoverLetterMarket>();
  for (const value of [application.jobUrl, jobDescription?.sourceUrl ?? null]) {
    const market = marketFromUrl(value);
    if (market !== null) {
      urlMatches.add(market);
    }
  }

  return (
    marketSuggestionFromMatches(urlMatches, 'JOB_URL_DOMAIN') ?? {
      value: null,
      source: 'NONE',
    }
  );
}

function matchSectors(
  value: string,
  signals: Readonly<Record<ClassifiedSector, readonly string[]>>,
  mAndAPattern: RegExp,
): ReadonlySet<ClassifiedSector> {
  const normalized = normalizeSuggestionText(value);
  const matches = new Set<ClassifiedSector>();

  for (const sector of classifiedSectors) {
    if (
      signals[sector].some((signal) => containsPhrase(normalized, signal))
    ) {
      matches.add(sector);
    }
  }

  if (mAndAPattern.test(value)) {
    matches.add('INVESTMENT_BANKING');
  }

  return matches;
}

function titleMatches(value: string): ReadonlySet<ClassifiedSector> {
  return matchSectors(value, titleSignals, /\bm\s*&\s*a\s+analyst\b/iu);
}

function dutyMatches(value: string): ReadonlySet<ClassifiedSector> {
  return matchSectors(value, dutySignals, /\bm\s*&\s*a\b/iu);
}

function titleSuggestion(
  value: string | null,
): CoverLetterSectorSuggestion | null {
  if (value === null) {
    return null;
  }

  const matches = titleMatches(value);
  const sector = onlyValue(matches);
  if (sector !== null) {
    return { value: sector, source: 'ROLE_TITLE' };
  }
  if (matches.size > 1) {
    return { value: 'GENERAL', source: 'AMBIGUOUS' };
  }
  return null;
}

function combineDutyText(jobDescription: JobDescription | null): string {
  if (jobDescription === null) {
    return '';
  }

  return [
    jobDescription.responsibilitiesMarkdown,
    jobDescription.requirementsMarkdown,
    jobDescription.descriptionMarkdown,
  ]
    .filter((value): value is string => value !== null)
    .join(' ');
}

function suggestSector(
  application: Application,
  jobDescription: JobDescription | null,
): CoverLetterSectorSuggestion {
  const applicationTitle = titleSuggestion(application.roleTitle);
  if (applicationTitle !== null) {
    return applicationTitle;
  }

  const jobDescriptionTitle = titleSuggestion(jobDescription?.title ?? null);
  if (jobDescriptionTitle !== null) {
    return jobDescriptionTitle;
  }

  const matches = dutyMatches(combineDutyText(jobDescription));
  const sector = onlyValue(matches);
  if (sector !== null) {
    return { value: sector, source: 'JOB_DESCRIPTION' };
  }
  if (matches.size > 1) {
    return { value: 'GENERAL', source: 'AMBIGUOUS' };
  }
  return { value: 'GENERAL', source: 'DEFAULT_GENERAL' };
}

export class CoverLetterProfileResolver {
  resolve(profile: CoverLetterProfile): CoverLetterSpecification {
    return resolveCoverLetterSpecification(profile);
  }

  suggest(
    application: Application,
    jobDescription: JobDescription | null,
  ): CoverLetterProfileSuggestion {
    return {
      market: suggestMarket(application, jobDescription),
      sector: suggestSector(application, jobDescription),
    };
  }
}
