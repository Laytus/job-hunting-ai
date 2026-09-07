import { describe, expect, it } from 'vitest';
import { resolveCoverLetterSpecification } from './cover-letter-specification.js';
import type {
  CoverLetterProfile,
  CoverLetterSpecification,
} from './generation.types.js';

interface MatrixCase {
  readonly name: string;
  readonly profile: CoverLetterProfile;
  readonly targetWords: CoverLetterSpecification['writing']['targetWords'];
  readonly toneFragment: string;
  readonly sectorFragment: string | null;
  readonly dateStyle: CoverLetterSpecification['composer']['dateStyle'];
  readonly closing: string;
}

const matrix: readonly MatrixCase[] = [
  {
    name: 'France / French / Quant Trading',
    profile: { market: 'FRANCE', sector: 'QUANT_TRADING', language: 'fr' },
    targetWords: { minimum: 220, maximum: 300, approximateCeiling: 325 },
    toneFragment: 'formal but direct',
    sectorFragment: 'technical or research motivation',
    dateStyle: 'DAY_MONTH_YEAR_FR',
    closing:
      'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
  },
  {
    name: 'France / English / Investment Banking',
    profile: {
      market: 'FRANCE',
      sector: 'INVESTMENT_BANKING',
      language: 'en',
    },
    targetWords: { minimum: 280, maximum: 360, approximateCeiling: 400 },
    toneFragment: 'formal but direct',
    sectorFragment: 'finance function',
    dateStyle: 'DAY_MONTH_YEAR_EN',
    closing: 'Sincerely,',
  },
  {
    name: 'United Kingdom / English / Quant Trading',
    profile: {
      market: 'UNITED_KINGDOM',
      sector: 'QUANT_TRADING',
      language: 'en',
    },
    targetWords: { minimum: 220, maximum: 300, approximateCeiling: 325 },
    toneFragment: 'understated',
    sectorFragment: 'quantitative evidence',
    dateStyle: 'DAY_MONTH_YEAR_EN',
    closing: 'Yours faithfully,',
  },
  {
    name: 'United Kingdom / French / General',
    profile: {
      market: 'UNITED_KINGDOM',
      sector: 'GENERAL',
      language: 'fr',
    },
    targetWords: { minimum: 260, maximum: 340, approximateCeiling: 360 },
    toneFragment: 'understated',
    sectorFragment: null,
    dateStyle: 'DAY_MONTH_YEAR_FR',
    closing:
      'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
  },
  {
    name: 'United States / English / Software Tech',
    profile: {
      market: 'UNITED_STATES',
      sector: 'SOFTWARE_TECH',
      language: 'en',
    },
    targetWords: { minimum: 240, maximum: 320, approximateCeiling: 350 },
    toneFragment: 'somewhat more confident',
    sectorFragment: 'product, team, or technical problem',
    dateStyle: 'MONTH_DAY_YEAR_EN',
    closing: 'Sincerely,',
  },
  {
    name: 'United States / French / Quant Trading',
    profile: {
      market: 'UNITED_STATES',
      sector: 'QUANT_TRADING',
      language: 'fr',
    },
    targetWords: { minimum: 220, maximum: 300, approximateCeiling: 325 },
    toneFragment: 'somewhat more confident',
    sectorFragment: 'technical or research motivation',
    dateStyle: 'DAY_MONTH_YEAR_FR',
    closing: 'Cordialement,',
  },
  {
    name: 'United Kingdom / English / General',
    profile: {
      market: 'UNITED_KINGDOM',
      sector: 'GENERAL',
      language: 'en',
    },
    targetWords: { minimum: 260, maximum: 340, approximateCeiling: 360 },
    toneFragment: 'understated',
    sectorFragment: null,
    dateStyle: 'DAY_MONTH_YEAR_EN',
    closing: 'Yours faithfully,',
  },
  {
    name: 'United States / English / General Finance',
    profile: {
      market: 'UNITED_STATES',
      sector: 'GENERAL_FINANCE',
      language: 'en',
    },
    targetWords: { minimum: 260, maximum: 340, approximateCeiling: 360 },
    toneFragment: 'somewhat more confident',
    sectorFragment: 'finance function',
    dateStyle: 'MONTH_DAY_YEAR_EN',
    closing: 'Sincerely,',
  },
];

function containsFragment(values: readonly string[], fragment: string): boolean {
  return values.some((value) => value.includes(fragment));
}

describe('resolveCoverLetterSpecification', () => {
  it.each(matrix)(
    'resolves $name without coupling market and language',
    ({
      profile,
      targetWords,
      toneFragment,
      sectorFragment,
      dateStyle,
      closing,
    }) => {
      const specification = resolveCoverLetterSpecification(profile);

      expect(specification.version).toBe('cover-letter-spec-v3');
      expect(specification.profile).toEqual(profile);
      expect(specification.writing.targetWords).toEqual(targetWords);
      expect(
        containsFragment(
          specification.writing.toneInstructions,
          toneFragment,
        ),
      ).toBe(true);
      expect(specification.composer).toMatchObject({ dateStyle, closing });

      if (sectorFragment === null) {
        expect(specification.writing.sectorEmphasis).toEqual([]);
      } else {
        expect(
          containsFragment(
            specification.writing.sectorEmphasis,
            sectorFragment,
          ),
        ).toBe(true);
      }
    },
  );

  it.each([
    ['QUANT_TRADING', 220, 300, 325, 'technical or research motivation'],
    ['INVESTMENT_BANKING', 280, 360, 400, 'finance function'],
    ['ASSET_MANAGEMENT', 260, 340, 360, 'investment, research, or business model'],
    ['SOFTWARE_TECH', 240, 320, 350, 'product, team, or technical problem'],
    ['CONSULTING', 280, 350, 380, 'why consulting'],
    ['GENERAL_FINANCE', 260, 340, 360, 'finance function'],
    ['GENERAL', 260, 340, 360, null],
  ] as const)(
    'freezes the %s sector calibration',
    (sector, minimum, maximum, approximateCeiling, emphasisFragment) => {
      const specification = resolveCoverLetterSpecification({
        market: 'UNITED_KINGDOM',
        sector,
        language: 'en',
      });

      expect(specification.writing.targetWords).toEqual({
        minimum,
        maximum,
        approximateCeiling,
      });
      if (emphasisFragment === null) {
        expect(specification.writing.sectorEmphasis).toEqual([]);
      } else {
        expect(
          containsFragment(
            specification.writing.sectorEmphasis,
            emphasisFragment,
          ),
        ).toBe(true);
      }
    },
  );

  it.each([
    ['FRANCE', 'Vous → Moi → Nous'],
    ['UNITED_KINGDOM', 'small number of priority matches'],
    ['UNITED_STATES', 'strongest relevant achievement'],
  ] as const)(
    'freezes the %s market argument independently of sector',
    (market, argumentFragment) => {
      const specification = resolveCoverLetterSpecification({
        market,
        sector: 'GENERAL',
        language: 'fr',
      });

      expect(
        containsFragment(
          specification.writing.argumentInstructions,
          argumentFragment,
        ),
      ).toBe(true);
    },
  );

  it('uses only the frozen resolved specification fields', () => {
    const specification = resolveCoverLetterSpecification({
      market: 'FRANCE',
      sector: 'QUANT_TRADING',
      language: 'en',
    });

    expect(Object.keys(specification)).toEqual([
      'version',
      'profile',
      'writing',
      'composer',
    ]);
    expect(Object.keys(specification.writing)).toEqual([
      'targetWords',
      'paragraphStrategy',
      'toneInstructions',
      'argumentInstructions',
      'evidenceInstructions',
      'personalizationInstructions',
      'sectorEmphasis',
      'languageInstructions',
      'antiGenericInstructions',
    ]);
    expect(Object.keys(specification.composer)).toEqual([
      'dateStyle',
      'salutation',
      'closing',
    ]);
  });

  it('encodes the frozen universal grounding and personalization rules', () => {
    const specification = resolveCoverLetterSpecification({
      market: 'FRANCE',
      sector: 'ASSET_MANAGEMENT',
      language: 'fr',
    });

    expect(specification.writing.paragraphStrategy).toMatchObject({
      minimum: 3,
      maximum: 5,
      preferred: 4,
    });
    expect(
      containsFragment(
        specification.writing.paragraphStrategy.instructions,
        'one page',
      ),
    ).toBe(true);
    expect(
      containsFragment(
        specification.writing.evidenceInstructions,
        'one or two main Candidate evidence points',
      ),
    ).toBe(true);
    expect(
      containsFragment(
        specification.writing.evidenceInstructions,
        'Invent no fact, metric',
      ),
    ).toBe(true);
    expect(
      containsFragment(
        specification.writing.personalizationInstructions,
        'company, team, product, work, or business reason',
      ),
    ).toBe(true);
    expect(
      containsFragment(
        specification.writing.personalizationInstructions,
        'company and role names are replaced',
      ),
    ).toBe(true);
    expect(
      containsFragment(
        specification.writing.antiGenericInstructions,
        'generic padding',
      ),
    ).toBe(true);
  });

  it('classifies evidence and forbids promotion between evidence categories', () => {
    const specification = resolveCoverLetterSpecification({
      market: 'UNITED_STATES',
      sector: 'ASSET_MANAGEMENT',
      language: 'en',
    });
    const evidence = specification.writing.evidenceInstructions;

    for (const category of [
      'DIRECT PROFESSIONAL EXPERIENCE',
      'TRANSFERABLE EXPERIENCE',
      'PROJECT EXPERIENCE',
      'COURSEWORK / SELF-STUDY',
      'INTEREST',
    ]) {
      expect(containsFragment(evidence, category)).toBe(true);
    }
    expect(containsFragment(evidence, 'exact factual scope')).toBe(true);
    expect(containsFragment(evidence, 'never print their labels')).toBe(true);
    expect(containsFragment(evidence, 'bounded and prospective')).toBe(true);
    expect(containsFragment(evidence, 'planned capabilities')).toBe(true);
    expect(containsFragment(evidence, 'never call it professional experience')).toBe(
      true,
    );
    expect(containsFragment(evidence, 'never establishes experience')).toBe(true);
  });

  it('keeps location, authorization, availability, and confidential TFE facts independent', () => {
    const specification = resolveCoverLetterSpecification({
      market: 'FRANCE',
      sector: 'GENERAL_FINANCE',
      language: 'en',
    });
    const evidence = specification.writing.evidenceInstructions;

    expect(containsFragment(evidence, 'current Candidate location')).toBe(true);
    expect(containsFragment(evidence, 'past employment location')).toBe(true);
    expect(containsFragment(evidence, 'relocation willingness')).toBe(true);
    expect(containsFragment(evidence, 'residence status')).toBe(true);
    expect(containsFragment(evidence, 'work authorization')).toBe(true);
    expect(containsFragment(evidence, 'immediately available or operational')).toBe(
      true,
    );
    expect(containsFragment(evidence, 'visa or work permit')).toBe(true);
    expect(containsFragment(evidence, 'thesis, TFE, or final project')).toBe(true);
    expect(containsFragment(evidence, 'state only that linkage')).toBe(true);
  });

  it('prevents unsupported qualitative expertise upgrades', () => {
    const evidence = resolveCoverLetterSpecification({
      market: 'UNITED_KINGDOM',
      sector: 'QUANT_TRADING',
      language: 'en',
    }).writing.evidenceInstructions;

    expect(containsFragment(evidence, 'strong expertise')).toBe(true);
    expect(containsFragment(evidence, 'high-performing')).toBe(true);
    expect(containsFragment(evidence, 'proven track record')).toBe(true);
    expect(containsFragment(evidence, 'prefer factual wording')).toBe(true);
  });

  it('preserves responsibility, ownership, and proficiency strength when paraphrasing', () => {
    const evidence = resolveCoverLetterSpecification({
      market: 'UNITED_STATES',
      sector: 'SOFTWARE_TECH',
      language: 'en',
    }).writing.evidenceInstructions;

    expect(containsFragment(evidence, 'semantic strength must not increase')).toBe(
      true,
    );
    expect(
      containsFragment(evidence, 'responsibility, ownership, leadership'),
    ).toBe(true);
    expect(containsFragment(evidence, 'contributed to, supported, worked on')).toBe(
      true,
    );
    expect(containsFragment(evidence, 'led, drove, owned, directed, managed')).toBe(
      true,
    );
    expect(containsFragment(evidence, 'used, familiar with, knowledge of')).toBe(
      true,
    );
    expect(containsFragment(evidence, 'mastered, expert in, strong expertise')).toBe(
      true,
    );
    expect(
      containsFragment(evidence, 'technical contribution does not become leadership'),
    ).toBe(true);
  });

  it('preserves the original domain and keeps every cross-domain bridge prospective', () => {
    const evidence = resolveCoverLetterSpecification({
      market: 'UNITED_KINGDOM',
      sector: 'INVESTMENT_BANKING',
      language: 'en',
    }).writing.evidenceInstructions;

    expect(
      containsFragment(evidence, 'original professional and technical domain'),
    ).toBe(true);
    expect(containsFragment(evidence, 'operational or financial requirements')).toBe(
      true,
    );
    expect(
      containsFragment(evidence, 'investment questions into structured investment analysis'),
    ).toBe(true);
    expect(containsFragment(evidence, 'software or data engineering')).toBe(true);
    expect(containsFragment(evidence, 'professional finance analysis')).toBe(true);
    expect(containsFragment(evidence, 'production ML experience')).toBe(true);
    expect(containsFragment(evidence, 'professional systematic trading')).toBe(true);
    expect(containsFragment(evidence, 'client or advisory experience')).toBe(true);
    expect(containsFragment(evidence, 'explicitly prospective and bounded')).toBe(
      true,
    );
  });

  it('preserves employer facts and material Job Description terminology', () => {
    const personalization = resolveCoverLetterSpecification({
      market: 'UNITED_KINGDOM',
      sector: 'GENERAL_FINANCE',
      language: 'en',
    }).writing.personalizationInstructions;

    for (const attribute of [
      'values',
      'culture',
      'philosophy',
      'reputation',
      'priorities',
      'beliefs',
    ]) {
      expect(containsFragment(personalization, attribute)).toBe(true);
    }
    expect(containsFragment(personalization, 'team is working to')).toBe(true);
    expect(containsFragment(personalization, 'material professional and technical meaning')).toBe(
      true,
    );
    expect(containsFragment(personalization, 'research datasets versus databases')).toBe(
      true,
    );
    expect(containsFragment(personalization, 'portfolio monitoring versus portfolio management')).toBe(
      true,
    );
    expect(containsFragment(personalization, 'backend services versus platform architecture')).toBe(
      true,
    );
    expect(containsFragment(personalization, 'transaction analysis versus transaction-execution experience')).toBe(
      true,
    );
  });

  it('enforces the France paragraph-level Vous → Moi → Nous sequence', () => {
    const argument = resolveCoverLetterSpecification({
      market: 'FRANCE',
      sector: 'ASSET_MANAGEMENT',
      language: 'fr',
    }).writing.argumentInstructions;

    expect(containsFragment(argument, 'Paragraph 1 is VOUS')).toBe(true);
    expect(containsFragment(argument, 'do not open with the Candidate internship')).toBe(
      true,
    );
    expect(containsFragment(argument, 'Paragraph 2 is MOI')).toBe(true);
    expect(containsFragment(argument, 'Paragraph 3 is NOUS')).toBe(true);
    expect(containsFragment(argument, 'bounded prospective bridge')).toBe(true);
    expect(containsFragment(argument, 'Paragraph 4 is optional')).toBe(true);
    expect(containsFragment(argument, 'generic recap or synergy conclusion')).toBe(
      true,
    );
  });

  it('requires differentiating synthetic-employer ground truth for company specificity', () => {
    const personalization = resolveCoverLetterSpecification({
      market: 'UNITED_KINGDOM',
      sector: 'GENERAL',
      language: 'en',
    }).writing.personalizationInstructions;

    expect(containsFragment(personalization, 'differentiating employer or team fact')).toBe(
      true,
    );
    expect(containsFragment(personalization, 'specific mandate, product, problem')).toBe(
      true,
    );
    expect(containsFragment(personalization, 'names alone')).toBe(true);
    expect(containsFragment(personalization, 'interchangeable vacancy language')).toBe(
      true,
    );
  });

  it('keeps French idiom separate from the selected market strategy', () => {
    for (const market of [
      'FRANCE',
      'UNITED_KINGDOM',
      'UNITED_STATES',
    ] as const) {
      const specification = resolveCoverLetterSpecification({
        market,
        sector: 'GENERAL',
        language: 'fr',
      });

      expect(
        containsFragment(
          specification.writing.languageInstructions,
          'natural French professional vocabulary',
        ),
      ).toBe(true);
      expect(
        containsFragment(
          specification.writing.languageInstructions,
          'alignment or synergy language',
        ),
      ).toBe(true);
      expect(
        containsFragment(
          specification.writing.languageInstructions,
          'English-influenced noun stacking',
        ),
      ).toBe(true);
      expect(
        containsFragment(
          specification.writing.languageInstructions,
          'standard natural French professional equivalent',
        ),
      ).toBe(true);
      expect(
        containsFragment(
          specification.writing.languageInstructions,
          'j’ai contribué à',
        ),
      ).toBe(true);
      expect(
        containsFragment(
          specification.writing.languageInstructions,
          'je pourrais mettre cette expérience au service de',
        ),
      ).toBe(true);
      expect(
        containsFragment(
          specification.writing.languageInstructions,
          `Preserve the ${market} editorial strategy`,
        ),
      ).toBe(true);
    }
  });

  it.each([
    ['FRANCE', 'en'],
    ['FRANCE', 'fr'],
    ['UNITED_KINGDOM', 'en'],
    ['UNITED_KINGDOM', 'fr'],
    ['UNITED_STATES', 'en'],
    ['UNITED_STATES', 'fr'],
  ] as const)(
    'continues to support %s + %s independently',
    (market, language) => {
      const specification = resolveCoverLetterSpecification({
        market,
        sector: 'GENERAL',
        language,
      });

      expect(specification.version).toBe('cover-letter-spec-v3');
      expect(specification.profile).toEqual({
        market,
        sector: 'GENERAL',
        language,
      });
      expect(specification.writing.languageInstructions.length).toBeGreaterThan(
        0,
      );
      expect(specification.composer.salutation.trim()).not.toBe('');
      expect(specification.composer.closing.trim()).not.toBe('');
    },
  );

  it('combines market and sector rules without overwriting either concern', () => {
    const specification = resolveCoverLetterSpecification({
      market: 'UNITED_KINGDOM',
      sector: 'QUANT_TRADING',
      language: 'en',
    });

    expect(
      containsFragment(specification.writing.toneInstructions, 'understated'),
    ).toBe(true);
    expect(
      containsFragment(
        specification.writing.sectorEmphasis,
        'quantitative evidence',
      ),
    ).toBe(true);
    expect(
      containsFragment(
        specification.writing.languageInstructions,
        'British English',
      ),
    ).toBe(true);
  });

  it('keeps GENERAL market-specific and application-specific', () => {
    const specification = resolveCoverLetterSpecification({
      market: 'UNITED_STATES',
      sector: 'GENERAL',
      language: 'fr',
    });

    expect(specification.writing.sectorEmphasis).toEqual([]);
    expect(
      containsFragment(
        specification.writing.toneInstructions,
        'somewhat more confident',
      ),
    ).toBe(true);
    expect(
      containsFragment(
        specification.writing.personalizationInstructions,
        'role-specific responsibility',
      ),
    ).toBe(true);
    expect(
      containsFragment(
        specification.writing.antiGenericInstructions,
        'sector-specific narrative',
      ),
    ).toBe(true);
  });

  it('is deterministic and returns independent result objects', () => {
    const profile: CoverLetterProfile = {
      market: 'UNITED_STATES',
      sector: 'CONSULTING',
      language: 'fr',
    };

    const first = resolveCoverLetterSpecification(profile);
    const second = resolveCoverLetterSpecification(profile);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.writing.toneInstructions).not.toBe(
      second.writing.toneInstructions,
    );
  });
});
