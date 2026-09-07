import { describe, expect, it } from 'vitest';
import { GenerationTemplateError } from '../generation.errors.js';
import {
  generationTemplateRegistry,
  resolveGenerationTemplate,
} from './generation-template-registry.js';

describe('Generation template registry', () => {
  it('maps every supported document type and language to its active template', () => {
    expect(
      generationTemplateRegistry.map(
        ({ documentType, language, id, version }) => ({
          documentType,
          language,
          id,
          version,
        }),
      ),
    ).toEqual([
      {
        documentType: 'COVER_LETTER',
        language: 'en',
        id: 'cover-letter-en-v2',
        version: 'v2',
      },
      {
        documentType: 'COVER_LETTER',
        language: 'fr',
        id: 'cover-letter-fr-v2',
        version: 'v2',
      },
      {
        documentType: 'APPLICATION_BRIEF',
        language: 'en',
        id: 'application-brief-en-v1',
        version: 'v1',
      },
      {
        documentType: 'INTERVIEW_BRIEF',
        language: 'en',
        id: 'interview-brief-en-v1',
        version: 'v1',
      },
    ]);
  });

  it('returns the same descriptor deterministically', () => {
    const first = resolveGenerationTemplate('COVER_LETTER', 'fr');
    const second = resolveGenerationTemplate('COVER_LETTER', 'fr');

    expect(first).toBe(second);
    expect(first.id).toBe('cover-letter-fr-v2');
  });

  it('rejects unsupported type and language combinations safely', () => {
    expect(() => resolveGenerationTemplate('APPLICATION_BRIEF', 'fr')).toThrow(
      expect.objectContaining<Partial<GenerationTemplateError>>({
        code: 'UNSUPPORTED_GENERATION_TEMPLATE',
        documentType: 'APPLICATION_BRIEF',
        language: 'fr',
      }),
    );
    expect(() => resolveGenerationTemplate('INTERVIEW_BRIEF', 'fr')).toThrow(
      expect.objectContaining<Partial<GenerationTemplateError>>({
        code: 'UNSUPPORTED_GENERATION_TEMPLATE',
      }),
    );
  });
});
