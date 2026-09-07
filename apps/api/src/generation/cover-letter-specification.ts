import type {
  CoverLetterMarket,
  CoverLetterProfile,
  CoverLetterSector,
  CoverLetterSpecification,
  GenerationLanguage,
} from './generation.types.js';

type ComposerRules = CoverLetterSpecification['composer'];

interface MarketRules {
  readonly toneInstructions: readonly string[];
  readonly argumentInstructions: readonly string[];
}

interface SectorRules {
  readonly targetWords: CoverLetterSpecification['writing']['targetWords'];
  readonly evidenceInstructions: readonly string[];
  readonly sectorEmphasis: readonly string[];
  readonly avoidInstructions: readonly string[];
}

const universalParagraphInstructions = [
  'Aim to fit comfortably on one page.',
  'Return three to five concise body paragraphs and prefer four.',
  'Use three paragraphs when evidence is sparse or a second evidence point adds no distinct value.',
  'Use five paragraphs only when canonical evidence supports five distinct arguments.',
  'Keep every paragraph responsible for a distinct reason, evidence point, or bridge.',
] as const;

const universalToneInstructions = [
  'Use a professional, direct, and natural tone.',
  'Do not foreground Candidate gaps or deficiencies.',
  'Do not include compensation or interview-process content.',
] as const;

const universalArgumentInstructions = [
  'Complement the CV instead of copying, mechanically paraphrasing, or chronologically recapping it.',
  'Prefer omission and a shorter complete argument when the supplied evidence is sparse.',
] as const;

const universalEvidenceInstructions = [
  'Select one or two main Candidate evidence points by default.',
  'Classify every Candidate evidence point as DIRECT PROFESSIONAL EXPERIENCE, TRANSFERABLE EXPERIENCE, PROJECT EXPERIENCE, COURSEWORK / SELF-STUDY, or INTEREST before using it.',
  'Use the evidence categories only as drafting discipline; never print their labels in the letter.',
  'For DIRECT PROFESSIONAL EXPERIENCE, use strong verbs only within the exact factual scope of the relevant professional Experience entry; never extend that Experience into a neighboring domain that is not stated.',
  'For TRANSFERABLE EXPERIENCE, make the bridge explicitly bounded and prospective: say the same discipline would be applicable, relevant, or transferable to the role rather than claiming prior direct target-domain experience.',
  'For PROJECT EXPERIENCE, state only what was implemented, designed, tested, or studied inside the project at its recorded status; never present planned capabilities as implemented capabilities.',
  'For COURSEWORK / SELF-STUDY, use bounded formulations such as knowledge of, coursework in, foundation in, study of, or interest in; never call it professional experience, expertise, or a track record.',
  'INTEREST may support motivation only; it never establishes experience or demonstrated capability.',
  'Use only canonical Candidate facts and supplied company and role facts.',
  'Invent no fact, metric, achievement, responsibility, technology, credential, motivation, recipient, or contact detail.',
  'Do not materially exaggerate or strengthen uncertain claims or adjacent skills.',
  'A factual claim may be paraphrased, but its semantic strength must not increase. Preserve the source fact’s exact level of responsibility, ownership, leadership, scope, proficiency, seniority, impact, and certainty; use an equal-strength or weaker bounded formulation when natural.',
  'Do not promote contributed to, supported, worked on, helped, implemented, modernized, used, familiar with, knowledge of, or studied into led, drove, owned, directed, managed, architected, mastered, expert in, strong expertise, or professional specialization unless canonical Candidate facts explicitly support the stronger wording.',
  'Preserve fact strength across verbs, adjectives, adverbs, nouns, and role framing: a technical contribution does not become leadership, ownership, research expertise, or investment-analysis capability without direct support.',
  'Preserve the original professional and technical domain of every Candidate fact. Experience translating operational or financial requirements into reliable technical solutions does not become direct experience translating investment questions into structured investment analysis.',
  'Keep every cross-domain connection explicitly prospective and bounded. Financial-data tooling does not become investment research, software or data engineering does not become quantitative research, coursework does not become professional finance analysis, machine-learning project work does not become production ML experience, a backtesting project does not become professional systematic trading, and stakeholder collaboration does not become client or advisory experience.',
  'Treat current Candidate location, past employment location, job location, target location, relocation willingness, citizenship, residence status, work authorization, visa or sponsorship status, and availability or start date as independent facts; never infer one from another.',
  'Do not state or imply that the Candidate currently lives or is based in the job location, is immediately available or operational, is authorized to work, needs or does not need sponsorship, or holds a particular visa or work permit unless that exact fact is explicit in canonical Candidate context.',
  'Do not infer the topic, content, methods, results, or confidential details of a thesis, TFE, or final project from its employer, internship, location, degree, or surrounding Experience; when only a formal linkage is known, state only that linkage.',
  'Use qualitative modifiers such as expert, strong expertise, deep expertise, solid mastery, high-performing, immediately ready, proven track record, or extensive experience only when canonical Candidate facts explicitly support that exact level; prefer factual wording over evaluative self-praise.',
  'Do not expose Analyze, Research, confidence, evidence, source, warning, prompt, template, version, or provenance language.',
] as const;

const universalPersonalizationInstructions = [
  'Use one supported company, team, product, work, or business reason.',
  'When supplied, anchor that reason in at least one differentiating employer or team fact such as a specific mandate, product, problem, investment or engineering focus, distinctive responsibility, or explicit business or team objective.',
  'Describe supplied employer and team mandates, processes, and objectives directly. Do not infer or attribute company values, culture, philosophy, reputation, priorities, or beliefs unless that exact attribute is explicitly supplied by Application, Job Description, or approved Research.',
  'Prefer direct factual framing such as the team is working to, the role supports, or the mandate combines over claims that the company values, believes, or is known for something that was not supplied.',
  'Paraphrase Application and Job Description facts only when their material professional and technical meaning remains unchanged; prefer the supplied role terminology when it reads naturally.',
  'Preserve distinctions such as research datasets versus databases, portfolio monitoring versus portfolio management, research tooling versus research expertise, data validation versus investment validation, analytical tools versus financial models, backend services versus platform architecture, and transaction analysis versus transaction-execution experience.',
  'Company and role names alone, generic prestige, and interchangeable vacancy language do not satisfy company specificity.',
  'Use one role-specific responsibility, problem, or capability.',
  'Explain an explicit bridge from each selected Candidate evidence point to the role.',
  'Make the core argument invalid if only the company and role names are replaced.',
] as const;

const universalAntiGenericInstructions = [
  'Do not add generic padding to reach the target word range.',
  'Avoid generic prestige praise and a dominant reusable LLM voice.',
  'Do not stack generic alignment, confidence, enthusiasm, or opportunity phrases.',
  'Avoid filler transitions and summary sentences that add no argument.',
] as const;

const marketRules = {
  FRANCE: {
    toneInstructions: [
      'Use a formal but direct, concrete, and non-pompous tone.',
      'Use controlled, evidence-backed self-promotion.',
      'Avoid exaggerated admiration and unsupported confidence.',
    ],
    argumentInstructions: [
      'Follow the France-market Vous → Moi → Nous logic as an explicit semantic paragraph sequence without printing those labels.',
      'Paragraph 1 is VOUS: begin from grounded employer, role, or team facts and explain why this specific opportunity is relevant; do not open with the Candidate internship, education, projects, skills, or another CV recap.',
      'Paragraph 2 is MOI: present the strongest one or two Candidate evidence items under the evidence-category hierarchy without inflating transferable evidence into direct experience.',
      'Paragraph 3 is NOUS: make a bounded prospective bridge from Candidate evidence to role needs, using language equivalent to could contribute, would bring, would apply, or would be relevant when direct target-domain experience is absent.',
      'Paragraph 4 is optional and may add distinct motivation, complementary evidence, or collaboration value only when it materially improves the letter; it must not become a generic recap or synergy conclusion.',
    ],
  },
  UNITED_KINGDOM: {
    toneInstructions: [
      'Use professional, understated, evidence-driven, and measured confidence.',
      'Limit self-promotion and avoid superlatives or aggressive claims.',
    ],
    argumentInstructions: [
      'Explain why the role and company are specifically relevant.',
      'Present the strongest evidence and then complementary fit where useful.',
      'Focus on a small number of priority matches and close concisely.',
    ],
  },
  UNITED_STATES: {
    toneInstructions: [
      'Use professional, direct, active, and somewhat more confident language than the UK profile.',
      'Use achievement-oriented self-presentation only when supported by canonical evidence.',
      'Do not turn confidence into exaggeration or unsupported impact.',
    ],
    argumentInstructions: [
      'Lead with specific role and company interest.',
      'Present the strongest relevant achievement or evidence.',
      'Add complementary fit or contribution where useful and close directly.',
    ],
  },
} as const satisfies Record<CoverLetterMarket, MarketRules>;

const sectorRules = {
  QUANT_TRADING: {
    targetWords: { minimum: 220, maximum: 300, approximateCeiling: 325 },
    evidenceInstructions: [
      'Select one or two supported quantitative, programming, research, or trading evidence points.',
    ],
    sectorEmphasis: [
      'Use a specific firm, team, or problem reason.',
      'Explain technical or research motivation.',
      'Make the bridge from quantitative evidence to the role direct.',
    ],
    avoidInstructions: [
      'Avoid generic passion for markets, long finance narratives, broad technology lists, and prestige praise.',
    ],
  },
  INVESTMENT_BANKING: {
    targetWords: { minimum: 280, maximum: 360, approximateCeiling: 400 },
    evidenceInstructions: [
      'Select one or two supported analytical, commercial, execution, or leadership experiences.',
    ],
    sectorEmphasis: [
      'Explain why the finance function is relevant.',
      'Explain why the specific institution or team is relevant.',
      'Show evidence-backed commitment and outcomes.',
    ],
    avoidInstructions: [
      'Avoid an expanded CV, generic prestige claims, and invented deal exposure.',
    ],
  },
  ASSET_MANAGEMENT: {
    targetWords: { minimum: 260, maximum: 340, approximateCeiling: 360 },
    evidenceInstructions: [
      'Select supported analytical or quantitative evidence and investment or research evidence where available.',
    ],
    sectorEmphasis: [
      'Explain the relevant investment, research, or business model.',
      'Explain firm or strategy fit only when supported.',
    ],
    avoidInstructions: [
      'Avoid invented investment views, generic markets interest, and a forced quant narrative.',
    ],
  },
  SOFTWARE_TECH: {
    targetWords: { minimum: 240, maximum: 320, approximateCeiling: 350 },
    evidenceInstructions: [
      'Select one or two supported technical accomplishments or projects.',
    ],
    sectorEmphasis: [
      'Explain the relevant product, team, or technical problem.',
      'Explain how the selected technical evidence transfers to the role.',
    ],
    avoidInstructions: [
      'Avoid stack recitation, rewritten CV bullets, and generic technology enthusiasm.',
    ],
  },
  CONSULTING: {
    targetWords: { minimum: 280, maximum: 350, approximateCeiling: 380 },
    evidenceInstructions: [
      'Select one or two supported problem-solving, impact, leadership, collaboration, or communication examples.',
    ],
    sectorEmphasis: [
      'Explain why consulting and the specific firm are relevant.',
      'Explain office or location motivation where supported and relevant.',
      'Connect the selected evidence to credible Candidate fit.',
    ],
    avoidInstructions: [
      'Avoid competency checklists, generic client-impact claims, and firm prestige.',
    ],
  },
  GENERAL_FINANCE: {
    targetWords: { minimum: 260, maximum: 340, approximateCeiling: 360 },
    evidenceInstructions: [
      'Select one or two supported analytical, commercial, risk, operational, or financial examples.',
    ],
    sectorEmphasis: [
      'Explain why the specific finance function and company are relevant.',
      'Connect supported execution evidence to the contribution required by the role.',
    ],
    avoidInstructions: [
      'Do not pretend the role is investment banking, asset management, or quant trading.',
      'Avoid generic passion for financial markets.',
    ],
  },
  GENERAL: {
    targetWords: { minimum: 260, maximum: 340, approximateCeiling: 360 },
    evidenceInstructions: [
      'Select one or two strongest supported points that are relevant to the role.',
    ],
    sectorEmphasis: [],
    avoidInstructions: [
      'Do not invent a sector-specific narrative or motivation.',
      'Do not turn the letter into reusable generic prose.',
    ],
  },
} as const satisfies Record<CoverLetterSector, SectorRules>;

const composerRules = {
  FRANCE: {
    en: {
      dateStyle: 'DAY_MONTH_YEAR_EN',
      salutation: 'Dear Hiring Manager,',
      closing: 'Sincerely,',
    },
    fr: {
      dateStyle: 'DAY_MONTH_YEAR_FR',
      salutation: 'Madame, Monsieur,',
      closing:
        'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
    },
  },
  UNITED_KINGDOM: {
    en: {
      dateStyle: 'DAY_MONTH_YEAR_EN',
      salutation: 'Dear Hiring Manager,',
      closing: 'Yours faithfully,',
    },
    fr: {
      dateStyle: 'DAY_MONTH_YEAR_FR',
      salutation: 'Madame, Monsieur,',
      closing:
        'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.',
    },
  },
  UNITED_STATES: {
    en: {
      dateStyle: 'MONTH_DAY_YEAR_EN',
      salutation: 'Dear Hiring Manager,',
      closing: 'Sincerely,',
    },
    fr: {
      dateStyle: 'DAY_MONTH_YEAR_FR',
      salutation: 'Madame, Monsieur,',
      closing: 'Cordialement,',
    },
  },
} as const satisfies Record<
  CoverLetterMarket,
  Record<GenerationLanguage, ComposerRules>
>;

const frenchLanguageInstructions = [
  'Write in fluid, idiomatic, professional French.',
  'Do not translate English formulations literally.',
  'Use concrete, direct French phrasing without pomp.',
  'Prefer natural French professional vocabulary to unnecessary English business terms when a normal French equivalent exists.',
  'Avoid English-influenced corporate constructions, formulaic alignment or synergy language, and generic recap conclusions; express the concrete relationship directly.',
  'Prefer concise idiomatic clauses and natural verbs over English-influenced noun stacking, translated-English participial phrases, and abstract corporate filler.',
  'When Candidate or Job Description material uses English terminology, choose the standard natural French professional equivalent unless the English technical term is genuinely normal in French practice.',
  'Preserve evidence strength with bounded French formulations equivalent to j’ai contribué à, j’ai travaillé sur, cette expérience m’a permis de, j’ai acquis une pratique de, j’ai développé une compréhension de, ces compétences pourraient être utiles pour, or je pourrais mettre cette expérience au service de.',
  'Do not default to French wording equivalent to I led, I mastered, I possess deep expertise, or I am immediately operational unless the stronger claim is directly supported.',
] as const;

const englishLanguageInstructions = {
  FRANCE: [
    'Write in neutral, idiomatic professional English.',
    'Preserve the France-market argument strategy without forcing UK or US idiom.',
  ],
  UNITED_KINGDOM: [
    'Write in idiomatic professional British English.',
    'Use British spelling where a natural variant occurs.',
  ],
  UNITED_STATES: [
    'Write in idiomatic professional US English.',
    'Use US spelling and conventions where a natural variant occurs.',
  ],
} as const satisfies Record<CoverLetterMarket, readonly string[]>;

function resolveLanguageInstructions(
  profile: CoverLetterProfile,
): readonly string[] {
  if (profile.language === 'fr') {
    return [
      ...frenchLanguageInstructions,
      `Preserve the ${profile.market} editorial strategy; French does not change the selected market.`,
    ];
  }

  return [...englishLanguageInstructions[profile.market]];
}

export function resolveCoverLetterSpecification(
  profile: CoverLetterProfile,
): CoverLetterSpecification {
  const market = marketRules[profile.market];
  const sector = sectorRules[profile.sector];

  return {
    version: 'cover-letter-spec-v3',
    profile: { ...profile },
    writing: {
      targetWords: { ...sector.targetWords },
      paragraphStrategy: {
        minimum: 3,
        maximum: 5,
        preferred: 4,
        instructions: [...universalParagraphInstructions],
      },
      toneInstructions: [
        ...universalToneInstructions,
        ...market.toneInstructions,
      ],
      argumentInstructions: [
        ...universalArgumentInstructions,
        ...market.argumentInstructions,
      ],
      evidenceInstructions: [
        ...universalEvidenceInstructions,
        ...sector.evidenceInstructions,
      ],
      personalizationInstructions: [
        ...universalPersonalizationInstructions,
      ],
      sectorEmphasis: [...sector.sectorEmphasis],
      languageInstructions: resolveLanguageInstructions(profile),
      antiGenericInstructions: [
        ...universalAntiGenericInstructions,
        ...sector.avoidInstructions,
      ],
    },
    composer: { ...composerRules[profile.market][profile.language] },
  };
}
