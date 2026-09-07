import { describe, expect, it } from 'vitest';
import { ResearchConfidenceService } from './research-confidence.js';
import { ResearchValidationError } from './research.errors.js';
import { ResearchGraphValidator } from './research-graph-validator.js';
import type {
  ResearchOutput,
  ResearchOutputClaim,
  ResearchOutputSource,
} from './research.schema.js';
import type { ResearchConfidenceInput } from './research-validation.types.js';
import { projectVerifiedResearchSubgraph } from './research-verified-subgraph.js';

const researchDate = new Date('2026-08-26T10:00:00.000Z');
const emptyStructuredValue = {
  amount: null,
  amountMin: null,
  amountMax: null,
  currency: null,
  period: null,
  location: null,
  role: null,
  seniority: null,
  dataYear: null,
  stageOrder: null,
  frequency: null,
} as const;

function source(id: string, url: string): ResearchOutputSource {
  return {
    id,
    url,
    title: `${id} title`,
    publisher: `${id} publisher`,
    sourceType: 'NEWS',
    sourceQuality: 'HIGH',
    publishedAt: '2026-08-01',
  };
}

function claim(
  id: string,
  links: readonly [string, 'SUPPORTS' | 'CONTRADICTS'][],
): ResearchOutputClaim {
  return {
    id,
    type: 'COMPANY_DESCRIPTION',
    valueText: `${id} value`,
    valueJson: emptyStructuredValue,
    evidenceType: 'FACT',
    sourceLinks: links.map(([sourceId, relationship]) => ({
      sourceId,
      relationship,
      evidenceText: `${sourceId} evidence`,
    })),
  };
}

function output(
  sources: readonly ResearchOutputSource[],
  claims: readonly ResearchOutputClaim[],
): ResearchOutput {
  return {
    summaryMarkdown: 'Model-authored summary.',
    warnings: [],
    sources: [...sources],
    claims: [...claims],
  };
}

function providerSources(...urls: readonly string[]) {
  return urls.map((url) => ({ url }));
}

class RecordingConfidenceService extends ResearchConfidenceService {
  readonly inputs: ResearchConfidenceInput[] = [];

  override calculate(input: ResearchConfidenceInput) {
    this.inputs.push(input);
    return super.calculate(input);
  }
}

describe('projectVerifiedResearchSubgraph', () => {
  it('A — leaves a fully verified graph unchanged', () => {
    const raw = output(
      [source('s1', 'https://example.com/one'), source('s2', 'https://example.com/two')],
      [claim('c1', [['s1', 'SUPPORTS'], ['s2', 'CONTRADICTS']])],
    );

    const projection = projectVerifiedResearchSubgraph(
      raw,
      providerSources('https://example.com/one', 'https://example.com/two'),
    );

    expect(projection.output).toEqual(raw);
    expect(projection.counts).toEqual({
      rawSources: 2,
      verifiedSources: 2,
      droppedSources: 0,
      rawClaims: 1,
      retainedClaims: 1,
      droppedClaims: 0,
      rawRelationships: 2,
      retainedRelationships: 2,
    });
  });

  it('B — retains a mixed-source claim with only its verified edge', () => {
    const projection = projectVerifiedResearchSubgraph(
      output(
        [
          source('unverified', 'https://example.com/unverified'),
          source('verified', 'https://example.com/verified'),
        ],
        [claim('c1', [['unverified', 'SUPPORTS'], ['verified', 'SUPPORTS']])],
      ),
      providerSources('https://example.com/verified'),
    );

    expect(projection.output.sources.map(({ id }) => id)).toEqual(['verified']);
    expect(projection.output.claims[0]?.sourceLinks).toEqual([
      {
        sourceId: 'verified',
        relationship: 'SUPPORTS',
        evidenceText: 'verified evidence',
      },
    ]);
  });

  it('C — drops a claim supported only by unverified sources', () => {
    const projection = projectVerifiedResearchSubgraph(
      output(
        [
          source('s1', 'https://example.com/one'),
          source('s2', 'https://example.com/two'),
        ],
        [claim('c1', [['s1', 'SUPPORTS'], ['s2', 'SUPPORTS']])],
      ),
      [],
    );

    expect(projection.output).toMatchObject({ sources: [], claims: [] });
    expect(projection.counts).toMatchObject({
      droppedSources: 2,
      droppedClaims: 1,
      retainedRelationships: 0,
    });
  });

  it('D — rejects same-domain substitution by discarding the different URL', () => {
    const projection = projectVerifiedResearchSubgraph(
      output(
        [source('model', 'https://example.com/article-b')],
        [claim('c1', [['model', 'SUPPORTS']])],
      ),
      providerSources('https://example.com/article-a'),
    );

    expect(projection.output).toMatchObject({ sources: [], claims: [] });
  });

  it('E/F — removes verified orphans when only non-SUPPORTS evidence remains', () => {
    const projection = projectVerifiedResearchSubgraph(
      output(
        [source('verified', 'https://example.com/verified')],
        [claim('c1', [['verified', 'CONTRADICTS']])],
      ),
      providerSources('https://example.com/verified'),
    );

    expect(projection.output).toMatchObject({ sources: [], claims: [] });
    expect(projection.counts).toMatchObject({
      verifiedSources: 0,
      retainedClaims: 0,
      retainedRelationships: 0,
    });
  });

  it('G — leaves canonical-equivalent verified sources for deterministic validator deduplication', () => {
    const canonicalSource = source(
      's1',
      'HTTPS://Example.com/article/?utm_source=test',
    );
    const raw = output(
      [
        canonicalSource,
        {
          ...canonicalSource,
          id: 's2',
          url: 'https://example.com/article',
        },
      ],
      [claim('c1', [['s1', 'SUPPORTS']]), claim('c2', [['s2', 'SUPPORTS']])],
    );
    const provider = providerSources('https://example.com/article');

    const projection = projectVerifiedResearchSubgraph(raw, provider);
    const validated = new ResearchGraphValidator().validate({
      output: projection.output,
      providerWebSources: provider,
      researchDate,
    });

    expect(projection.output.sources).toHaveLength(2);
    expect(validated.sources).toHaveLength(1);
    expect(validated.claims).toHaveLength(2);
    expect(validated.relationships.map(({ sourceKey }) => sourceKey)).toEqual([
      's1',
      's1',
    ]);
  });

  it('I — keeps UNVERIFIED_RESEARCH_SOURCE as validator defense in depth', () => {
    const raw = output(
      [source('unverified', 'https://example.com/unverified')],
      [claim('c1', [['unverified', 'SUPPORTS']])],
    );

    expect(() =>
      new ResearchGraphValidator().validate({
        output: raw,
        providerWebSources: [],
        researchDate,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'UNVERIFIED_RESEARCH_SOURCE',
        reason: 'SOURCE_NOT_REPORTED_BY_PROVIDER',
      }),
    );
  });

  it('J — retains one sparse verified claim among unverified claims', () => {
    const projection = projectVerifiedResearchSubgraph(
      output(
        [
          source('verified', 'https://example.com/verified'),
          source('unverified', 'https://example.com/unverified'),
        ],
        [
          claim('kept', [['verified', 'SUPPORTS']]),
          claim('dropped', [['unverified', 'SUPPORTS']]),
        ],
      ),
      providerSources('https://example.com/verified'),
    );

    expect(projection.output.sources.map(({ id }) => id)).toEqual(['verified']);
    expect(projection.output.claims.map(({ id }) => id)).toEqual(['kept']);
  });

  it('drops dangling links without allowing them to rescue or invalidate a grounded claim', () => {
    const projection = projectVerifiedResearchSubgraph(
      output(
        [source('verified', 'https://example.com/verified')],
        [
          claim('grounded', [
            ['missing', 'SUPPORTS'],
            ['verified', 'SUPPORTS'],
          ]),
        ],
      ),
      providerSources('https://example.com/verified'),
    );

    expect(projection.output.claims[0]?.sourceLinks).toEqual([
      {
        sourceId: 'verified',
        relationship: 'SUPPORTS',
        evidenceText: 'verified evidence',
      },
    ]);
  });

  it('K — produces an empty graph that the existing validator completes deterministically', () => {
    const provider = providerSources('https://example.com/provider-only');
    const projection = projectVerifiedResearchSubgraph(
      output(
        [source('unverified', 'https://example.com/unverified')],
        [claim('dropped', [['unverified', 'SUPPORTS']])],
      ),
      provider,
    );
    const validated = new ResearchGraphValidator().validate({
      output: projection.output,
      providerWebSources: provider,
      researchDate,
    });

    expect(validated).toEqual({
      summaryMarkdown:
        'No reliable external Research findings were available for this opportunity.',
      warnings: [
        'NO_RELIABLE_COMPENSATION_DATA',
        'INSUFFICIENT_ROLE_SPECIFIC_DATA',
      ],
      sources: [],
      claims: [],
      relationships: [],
    });
  });

  it('reproduces the Phase 10.8.3 mixed nine-source provenance class', () => {
    const sources = [
      source('s1', 'https://janestreet.example/unverified-1'),
      source('s2', 'https://janestreet.example/unverified-2'),
      source('s3', 'https://janestreet.example/verified-3'),
      source('s4', 'https://janestreet.example/verified-4'),
      source('s5', 'https://janestreet.example/unverified-5'),
      source('s6', 'https://janestreet.example/verified-6'),
      source('s7', 'https://janestreet.example/unverified-7'),
      source('s8', 'https://janestreet.example/verified-8'),
      source('s9', 'https://glassdoor.example/Salary/Quant%2C-London'),
    ];
    const raw = output(sources, [
      claim('mixed', [['s1', 'SUPPORTS'], ['s3', 'SUPPORTS']]),
      claim('unverified-only', [['s2', 'SUPPORTS'], ['s5', 'SUPPORTS']]),
      claim('verified-with-dropped-contradiction', [
        ['s4', 'SUPPORTS'],
        ['s7', 'CONTRADICTS'],
      ]),
      claim('reserved-character-mismatch', [['s9', 'SUPPORTS']]),
      claim('verified-support-and-contradiction', [
        ['s6', 'SUPPORTS'],
        ['s8', 'CONTRADICTS'],
      ]),
    ]);
    const provider = providerSources(
      'https://janestreet.example/verified-3',
      'https://janestreet.example/verified-4',
      'https://janestreet.example/verified-6',
      'https://janestreet.example/verified-8',
      'https://glassdoor.example/Salary/Quant,-London',
    );

    const projection = projectVerifiedResearchSubgraph(raw, provider);
    const confidenceService = new RecordingConfidenceService();
    const validated = new ResearchGraphValidator(confidenceService).validate({
      output: projection.output,
      providerWebSources: provider,
      researchDate,
    });

    expect(projection.counts).toEqual({
      rawSources: 9,
      verifiedSources: 4,
      droppedSources: 5,
      rawClaims: 5,
      retainedClaims: 3,
      droppedClaims: 2,
      rawRelationships: 9,
      retainedRelationships: 4,
    });
    expect(validated.sources.map(({ key }) => key)).toEqual([
      's3',
      's4',
      's6',
      's8',
    ]);
    expect(validated.claims.map(({ key }) => key)).toEqual([
      'mixed',
      'verified-with-dropped-contradiction',
      'verified-support-and-contradiction',
    ]);
    expect(
      validated.relationships.every(({ sourceKey }) =>
        ['s3', 's4', 's6', 's8'].includes(sourceKey),
      ),
    ).toBe(true);
    expect(
      confidenceService.inputs.flatMap(({ evidence }) =>
        evidence.map(({ source: evidenceSource }) => evidenceSource.key),
      ),
    ).toEqual(['s3', 's4', 's6', 's8']);
  });

  it('keeps malformed structured source URLs strict while ignoring malformed provider metadata', () => {
    const raw = output(
      [source('invalid', 'not-a-valid-url')],
      [claim('c1', [['invalid', 'SUPPORTS']])],
    );

    expect(() =>
      projectVerifiedResearchSubgraph(raw, [
        { url: 'also-not-a-valid-url' },
        { url: '   ' },
      ]),
    ).toThrowError(ResearchValidationError);
  });

  it('preserves the raw structured source ceiling before projection', () => {
    const sources = Array.from({ length: 21 }, (_, index) =>
      source(`s${index}`, `https://example.com/${index}`),
    );

    expect(() => projectVerifiedResearchSubgraph(output(sources, []), [])).toThrowError(
      expect.objectContaining({
        code: 'RESEARCH_SOURCE_LIMIT_EXCEEDED',
        reason: 'TOO_MANY_SOURCES',
      }),
    );
  });
});
