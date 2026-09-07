import { describe, expect, it } from 'vitest';
import type { Application } from '../application/application.types.js';
import type { JobDescription } from '../job-description/job-description.types.js';
import { CoverLetterProfileResolver } from './cover-letter-profile-resolver.js';
import type {
  CoverLetterMarket,
  CoverLetterMarketSuggestionSource,
  CoverLetterSector,
  CoverLetterSectorSuggestionSource,
} from './generation.types.js';

const resolver = new CoverLetterProfileResolver();

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: 'application-1',
    companyName: 'Example Company',
    roleTitle: 'Research Engineer',
    location: null,
    jobUrl: null,
    source: 'CAREER_PAGE',
    status: 'FOUND',
    priority: 'MEDIUM',
    dateFound: null,
    dateApplied: null,
    notesMarkdown: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

function jobDescription(
  overrides: Partial<JobDescription> = {},
): JobDescription {
  return {
    id: 'job-description-1',
    applicationId: 'application-1',
    title: null,
    companyName: null,
    descriptionMarkdown: 'Join the team.',
    requirementsMarkdown: null,
    responsibilitiesMarkdown: null,
    structuredData: null,
    sourceUrl: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

describe('CoverLetterProfileResolver market suggestion', () => {
  it.each<
    readonly [
      location: string,
      market: CoverLetterMarket,
      source: CoverLetterMarketSuggestionSource,
    ]
  >([
    ['Paris', 'FRANCE', 'APPLICATION_LOCATION'],
    ['France', 'FRANCE', 'APPLICATION_LOCATION'],
    ['London', 'UNITED_KINGDOM', 'APPLICATION_LOCATION'],
    ['United Kingdom', 'UNITED_KINGDOM', 'APPLICATION_LOCATION'],
    ['New York', 'UNITED_STATES', 'APPLICATION_LOCATION'],
    ['United States', 'UNITED_STATES', 'APPLICATION_LOCATION'],
    ['Remote — UK', 'UNITED_KINGDOM', 'APPLICATION_LOCATION'],
  ])('maps %s to %s from %s', (location, market, source) => {
    expect(
      resolver.suggest(application({ location }), jobDescription()).market,
    ).toEqual({ value: market, source });
  });

  it.each([null, 'Remote', 'EMEA', 'Global', 'Worldwide', 'Europe'])(
    'leaves a location without bounded market evidence unresolved: %j',
    (location) => {
      expect(
        resolver.suggest(
          application({ location, jobUrl: 'https://jobs.example.com/role' }),
          null,
        ).market,
      ).toEqual({ value: null, source: 'NONE' });
    },
  );

  it('returns ambiguity for a cross-market Application location', () => {
    expect(
      resolver.suggest(
        application({ location: 'Paris or London' }),
        jobDescription({
          descriptionMarkdown: 'The team is based in New York.',
        }),
      ).market,
    ).toEqual({ value: null, source: 'AMBIGUOUS' });
  });

  it('allows multiple same-market locations', () => {
    expect(
      resolver.suggest(
        application({ location: 'Paris or Lyon' }),
        jobDescription(),
      ).market,
    ).toEqual({ value: 'FRANCE', source: 'APPLICATION_LOCATION' });
  });

  it('keeps a clear Application location above incidental Job Description signals', () => {
    expect(
      resolver.suggest(
        application({ location: 'Paris' }),
        jobDescription({
          descriptionMarkdown: 'Our headquarters are in New York.',
        }),
      ).market,
    ).toEqual({ value: 'FRANCE', source: 'APPLICATION_LOCATION' });
  });

  it('falls back to explicit Job Description signals', () => {
    expect(
      resolver.suggest(
        application(),
        jobDescription({
          responsibilitiesMarkdown: 'Work with the platform team in Manchester.',
        }),
      ).market,
    ).toEqual({ value: 'UNITED_KINGDOM', source: 'JOB_DESCRIPTION' });
  });

  it('uses only bounded URL hostname suffixes as weak final evidence', () => {
    expect(
      resolver.suggest(
        application({ jobUrl: 'https://careers.example.co.uk/jobs/123' }),
        jobDescription(),
      ).market,
    ).toEqual({ value: 'UNITED_KINGDOM', source: 'JOB_URL_DOMAIN' });

    expect(
      resolver.suggest(
        application({
          jobUrl: 'https://example.com/jobs/united-kingdom?market=fr',
        }),
        jobDescription(),
      ).market,
    ).toEqual({ value: null, source: 'NONE' });
  });

  it('fails closed when weak URL hostnames conflict', () => {
    expect(
      resolver.suggest(
        application({ jobUrl: 'https://jobs.example.fr/role' }),
        jobDescription({ sourceUrl: 'https://careers.example.us/role' }),
      ).market,
    ).toEqual({ value: null, source: 'AMBIGUOUS' });
  });

  it('does not interpret the standalone English pronoun us as a US signal', () => {
    expect(
      resolver.suggest(
        application({ location: 'Remote' }),
        jobDescription({ descriptionMarkdown: 'Come build with us.' }),
      ).market,
    ).toEqual({ value: null, source: 'NONE' });
  });
});

describe('CoverLetterProfileResolver sector suggestion', () => {
  it.each<
    readonly [
      title: string,
      sector: CoverLetterSector,
      source: CoverLetterSectorSuggestionSource,
    ]
  >([
    ['Quantitative Researcher', 'QUANT_TRADING', 'ROLE_TITLE'],
    ['Quant Developer', 'QUANT_TRADING', 'ROLE_TITLE'],
    ['Investment Banking Analyst', 'INVESTMENT_BANKING', 'ROLE_TITLE'],
    ['Asset Management Analyst', 'ASSET_MANAGEMENT', 'ROLE_TITLE'],
    ['Software Engineer', 'SOFTWARE_TECH', 'ROLE_TITLE'],
    ['Management Consultant', 'CONSULTING', 'ROLE_TITLE'],
    ['Financial Analyst', 'GENERAL_FINANCE', 'ROLE_TITLE'],
    ['Technology Consultant', 'CONSULTING', 'ROLE_TITLE'],
    ['M&A Analyst', 'INVESTMENT_BANKING', 'ROLE_TITLE'],
  ])('maps the strong title %s to %s', (title, sector, source) => {
    expect(
      resolver.suggest(application({ roleTitle: title }), jobDescription())
        .sector,
    ).toEqual({ value: sector, source });
  });

  it('uses Job Description title only when Application title has no strong match', () => {
    expect(
      resolver.suggest(
        application({ roleTitle: 'Graduate Programme' }),
        jobDescription({ title: 'Portfolio Analyst' }),
      ).sector,
    ).toEqual({ value: 'ASSET_MANAGEMENT', source: 'ROLE_TITLE' });
  });

  it('returns GENERAL when a higher-priority title has conflicting strong sectors', () => {
    expect(
      resolver.suggest(
        application({ roleTitle: 'Software Engineer / Quant Developer' }),
        jobDescription({ title: 'Software Engineer' }),
      ).sector,
    ).toEqual({ value: 'GENERAL', source: 'AMBIGUOUS' });
  });

  it('keeps Software Engineer at a hedge fund in SOFTWARE_TECH', () => {
    expect(
      resolver.suggest(
        application({
          companyName: 'Example Hedge Fund',
          roleTitle: 'Software Engineer',
        }),
        jobDescription({
          companyName: 'Example Hedge Fund',
          descriptionMarkdown: 'We are a hedge fund.',
        }),
      ).sector,
    ).toEqual({ value: 'SOFTWARE_TECH', source: 'ROLE_TITLE' });
  });

  it('keeps Quant Developer at an investment bank in QUANT_TRADING', () => {
    expect(
      resolver.suggest(
        application({
          companyName: 'Example Investment Bank',
          roleTitle: 'Quant Developer',
        }),
        jobDescription({
          companyName: 'Example Investment Bank',
          descriptionMarkdown: 'We are an investment bank.',
        }),
      ).sector,
    ).toEqual({ value: 'QUANT_TRADING', source: 'ROLE_TITLE' });
  });

  it('does not let company identity classify an ambiguous Research Engineer role', () => {
    expect(
      resolver.suggest(
        application({
          companyName: 'AI Quant Capital',
          roleTitle: 'Research Engineer',
        }),
        jobDescription({
          companyName: 'AI Quant Capital',
          descriptionMarkdown: 'We are an AI-focused quantitative firm.',
        }),
      ).sector,
    ).toEqual({ value: 'GENERAL', source: 'DEFAULT_GENERAL' });
  });

  it('classifies Data Scientist only from an explicit bounded duty signal', () => {
    const ambiguousApplication = application({
      companyName: 'Example Asset Manager',
      roleTitle: 'Data Scientist',
    });

    expect(
      resolver.suggest(
        ambiguousApplication,
        jobDescription({ companyName: 'Example Asset Manager' }),
      ).sector,
    ).toEqual({ value: 'GENERAL', source: 'DEFAULT_GENERAL' });

    expect(
      resolver.suggest(
        ambiguousApplication,
        jobDescription({
          companyName: 'Example Asset Manager',
          responsibilitiesMarkdown: 'Build models for portfolio construction.',
        }),
      ).sector,
    ).toEqual({ value: 'ASSET_MANAGEMENT', source: 'JOB_DESCRIPTION' });
  });

  it('classifies a Strategy role at a bank only from explicit duties', () => {
    const strategyApplication = application({
      companyName: 'Example Bank',
      roleTitle: 'Strategy Analyst',
    });

    expect(
      resolver.suggest(
        strategyApplication,
        jobDescription({
          companyName: 'Example Bank',
          descriptionMarkdown: 'Support the strategy team at our bank.',
        }),
      ).sector,
    ).toEqual({ value: 'GENERAL', source: 'DEFAULT_GENERAL' });

    expect(
      resolver.suggest(
        strategyApplication,
        jobDescription({
          companyName: 'Example Bank',
          responsibilitiesMarkdown: 'Support corporate finance planning.',
        }),
      ).sector,
    ).toEqual({ value: 'GENERAL_FINANCE', source: 'JOB_DESCRIPTION' });
  });

  it('uses GENERAL/AMBIGUOUS when Job Description duties span sectors', () => {
    expect(
      resolver.suggest(
        application({ roleTitle: 'Research Engineer' }),
        jobDescription({
          responsibilitiesMarkdown:
            'Conduct quantitative research and build distributed systems.',
        }),
      ).sector,
    ).toEqual({ value: 'GENERAL', source: 'AMBIGUOUS' });
  });

  it('matches bounded phrases instead of arbitrary substrings', () => {
    expect(
      resolver.suggest(
        application({ roleTitle: 'Engineering Manager' }),
        jobDescription({
          responsibilitiesMarkdown:
            'Manage treasuryship documentation and client-side applications.',
        }),
      ).sector,
    ).toEqual({ value: 'GENERAL', source: 'DEFAULT_GENERAL' });
  });
});

describe('CoverLetterProfileResolver purity', () => {
  it('returns equal suggestions and specifications for equal inputs', () => {
    const currentApplication = application({
      roleTitle: 'Quant Developer',
      location: 'London',
    });
    const currentJobDescription = jobDescription();

    expect(
      resolver.suggest(currentApplication, currentJobDescription),
    ).toEqual(resolver.suggest(currentApplication, currentJobDescription));
    expect(
      resolver.resolve({
        market: 'UNITED_KINGDOM',
        sector: 'QUANT_TRADING',
        language: 'fr',
      }),
    ).toEqual(
      resolver.resolve({
        market: 'UNITED_KINGDOM',
        sector: 'QUANT_TRADING',
        language: 'fr',
      }),
    );
  });
});
