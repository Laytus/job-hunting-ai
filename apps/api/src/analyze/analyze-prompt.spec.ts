import { describe, expect, it } from 'vitest';
import type { AnalyzeContext } from './analyze-context.types.js';
import { AnalyzePromptBuilder, ANALYZE_PROMPT_VERSION } from './analyze-prompt.js';
import {
  analyzeOutputJsonSchema,
  analyzeResponseFormat,
} from './analyze.schema.js';
import { ANALYZE_SCHEMA_NAME } from './analyze.types.js';

const context: AnalyzeContext = {
  candidate: {
    fullName: 'Ada Lovelace',
    headline: 'Backend engineer',
    summaryMarkdown: 'Builds reliable services.',
    location: 'Santiago, Chile',
    targetRoles: ['Staff Engineer'],
    targetLocations: ['Remote'],
    careerGoalsMarkdown: 'Lead backend architecture.',
    cvMarkdown: '# CV',
    additionalContext: null,
    experiences: [],
    education: [],
    projects: [],
    skills: [
      {
        name: 'TypeScript',
        category: 'PROGRAMMING_LANGUAGE',
        level: 'EXPERT',
        notes: null,
      },
    ],
    languages: [],
  },
  application: {
    companyName: 'Analytical Engines Ltd',
    roleTitle: 'Staff Backend Engineer',
    location: 'Remote',
    source: 'CAREER_PAGE',
    jobUrl: 'https://jobs.example/staff-backend',
  },
  jobDescription: {
    title: 'Staff Backend Engineer',
    companyName: 'Analytical Engines Ltd',
    descriptionMarkdown: 'Build reliable distributed services.',
    requirementsMarkdown: '- TypeScript',
    responsibilitiesMarkdown: '- Lead backend architecture',
    sourceUrl: 'https://jobs.example/staff-backend',
  },
};

describe('AnalyzePromptBuilder', () => {
  const builder = new AnalyzePromptBuilder();

  it('freezes distinct prompt-version and structured-schema identifiers', () => {
    expect(ANALYZE_PROMPT_VERSION).toBe('analyze-v1');
    expect(ANALYZE_SCHEMA_NAME).toBe('analyze_output');
    expect(ANALYZE_PROMPT_VERSION).not.toBe(ANALYZE_SCHEMA_NAME);
  });

  it('builds a fixed system and user message sequence with normalized JSON context', () => {
    const messages = builder.build(context);

    expect(messages).toHaveLength(2);
    expect(messages.map(({ role }) => role)).toEqual(['system', 'user']);
    expect(messages[1]?.content).toContain(JSON.stringify(context, null, 2));
  });

  it('encodes source grounding and guards candidate facts and requirements', () => {
    const system = builder.build(context)[0]?.content ?? '';

    expect(system).toContain('Use only the supplied source context');
    expect(system).toContain('Do not fabricate candidate employment');
    expect(system).toContain('Do not fabricate job requirements');
    expect(system).toContain('not evidence of demonstrated experience');
    expect(system).toContain('Do not treat lack of evidence as proof of absence');
    expect(system).toContain('must be traceable to supplied Candidate Profile data');
  });

  it('defines exact importance and match-strength semantics including NONE versus UNKNOWN', () => {
    const system = builder.build(context)[0]?.content ?? '';

    for (const value of ['REQUIRED', 'PREFERRED', 'IMPLICIT', 'UNKNOWN']) {
      expect(system).toContain(value);
    }
    for (const value of ['STRONG', 'PARTIAL', 'WEAK', 'NONE', 'UNKNOWN']) {
      expect(system).toContain(value);
    }
    expect(system).toContain('Keep NONE distinct from UNKNOWN');
    expect(system).toContain('source context is insufficient to evaluate reliably');
  });

  it('forbids numeric scoring and priority while treating hard constraints conservatively', () => {
    const system = builder.build(context)[0]?.content ?? '';

    expect(system).toContain('Never return a final numeric fit score');
    expect(system).toContain('Never return or recommend Application priority');
    expect(system).toContain(
      'only when the supplied Job Description supports that interpretation',
    );
    expect(system).toContain('null when information is insufficient');
    expect(system).toContain('Never default uncertainty to false');
  });

  it('is deterministic for identical input and contains no execution metadata', () => {
    const first = builder.build(context);
    const second = builder.build(context);
    const serialized = JSON.stringify(first);

    expect(second).toEqual(first);
    expect(serialized).not.toContain('createdAt');
    expect(serialized).not.toContain('updatedAt');
    expect(serialized).not.toContain('runId');
    expect(serialized).not.toContain('usage');
  });

  it('builds a provider-independent request by reusing the Phase 8.1 response schema', () => {
    const request = builder.buildRequest(context);

    expect(request.messages).toEqual(builder.build(context));
    expect(request.responseFormat).toBe(analyzeResponseFormat);
    expect(request.responseFormat).toMatchObject({
      type: 'json_schema',
      name: ANALYZE_SCHEMA_NAME,
      strict: true,
    });
    expect(request.responseFormat?.schema).toBe(analyzeOutputJsonSchema);
    expect(request).not.toHaveProperty('model');
  });
});
