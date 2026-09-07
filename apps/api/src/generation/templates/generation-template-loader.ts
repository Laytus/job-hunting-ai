import { readFile } from 'node:fs/promises';
import { GenerationTemplateError } from '../generation.errors.js';
import type {
  GenerationDocumentType,
  GenerationLanguage,
  GenerationTemplateDescriptor,
  LoadedGenerationTemplate,
} from '../generation.types.js';
import { resolveGenerationTemplate } from './generation-template-registry.js';

const defaultTemplateRoots = [
  new URL('../../resources/generation/templates/', import.meta.url),
  new URL('../../../resources/generation/templates/', import.meta.url),
];

function isMissingResource(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

export class GenerationTemplateLoader {
  constructor(
    private readonly templateRoots: readonly URL[] = defaultTemplateRoots,
  ) {}

  async load(
    documentType: GenerationDocumentType,
    language: GenerationLanguage,
  ): Promise<LoadedGenerationTemplate> {
    const descriptor = resolveGenerationTemplate(documentType, language);
    return this.loadDescriptor(descriptor);
  }

  private async loadDescriptor(
    descriptor: GenerationTemplateDescriptor,
  ): Promise<LoadedGenerationTemplate> {
    for (const root of this.templateRoots) {
      let content: string;
      try {
        content = await readFile(new URL(descriptor.relativePath, root), 'utf8');
      } catch (error) {
        if (isMissingResource(error)) {
          continue;
        }
        throw new GenerationTemplateError(
          'GENERATION_TEMPLATE_LOAD_FAILED',
          descriptor.id,
        );
      }

      if (content.trim() === '') {
        throw new GenerationTemplateError(
          'GENERATION_TEMPLATE_EMPTY',
          descriptor.id,
        );
      }

      return { ...descriptor, content };
    }

    throw new GenerationTemplateError(
      'GENERATION_TEMPLATE_NOT_FOUND',
      descriptor.id,
    );
  }
}
