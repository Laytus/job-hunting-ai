import { GenerationTemplateError } from '../generation.errors.js';
import type {
  GenerationDocumentType,
  GenerationLanguage,
  GenerationTemplateDescriptor,
} from '../generation.types.js';

export const generationTemplateRegistry = [
  {
    id: 'cover-letter-en-v2',
    documentType: 'COVER_LETTER',
    language: 'en',
    version: 'v2',
    relativePath: 'cover-letter/cover-letter-en-v2.md',
  },
  {
    id: 'cover-letter-fr-v2',
    documentType: 'COVER_LETTER',
    language: 'fr',
    version: 'v2',
    relativePath: 'cover-letter/cover-letter-fr-v2.md',
  },
  {
    id: 'application-brief-en-v1',
    documentType: 'APPLICATION_BRIEF',
    language: 'en',
    version: 'v1',
    relativePath: 'application-brief/application-brief-en-v1.md',
  },
  {
    id: 'interview-brief-en-v1',
    documentType: 'INTERVIEW_BRIEF',
    language: 'en',
    version: 'v1',
    relativePath: 'interview-brief/interview-brief-en-v1.md',
  },
] as const satisfies readonly GenerationTemplateDescriptor[];

export function resolveGenerationTemplate(
  documentType: GenerationDocumentType,
  language: GenerationLanguage,
): GenerationTemplateDescriptor {
  const descriptor = generationTemplateRegistry.find(
    (candidate) =>
      candidate.documentType === documentType && candidate.language === language,
  );

  if (descriptor === undefined) {
    throw new GenerationTemplateError(
      'UNSUPPORTED_GENERATION_TEMPLATE',
      null,
      documentType,
      language,
    );
  }

  return descriptor;
}
