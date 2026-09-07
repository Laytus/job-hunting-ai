import type { GenerationContext } from './generation-context.types.js';
import { GenerationContextError } from './generation.errors.js';
import type {
  CoverLetterMarket,
  CoverLetterSector,
  GenerationDocumentType,
  GenerationLanguage,
  GenerationPromptVersion,
  GenerationTemplateId,
  GenerationWarning,
  LoadedGenerationTemplate,
} from './generation.types.js';
import {
  APPLICATION_BRIEF_PROMPT_VERSION,
  COVER_LETTER_PROMPT_VERSION,
  INTERVIEW_BRIEF_PROMPT_VERSION,
} from './generation.types.js';

interface GenerationProvenanceMetadataBase {
  readonly contextVersion: GenerationContext['contextVersion'];
  readonly documentType: GenerationDocumentType;
  readonly outputLanguage: GenerationLanguage;
  readonly promptVersion: GenerationPromptVersion;
  readonly templateVersion: GenerationTemplateId;
  readonly jobDescriptionId: string;
  readonly jobAnalysisId: string | null;
  readonly researchId: string | null;
  readonly candidateContextUpdatedAt: string;
  readonly contextResearchClaimIds: readonly string[];
  readonly contextAnalyzeRequirementIds: readonly string[];
  readonly contextAnalyzeEvidenceIds: readonly string[];
  readonly warnings: readonly GenerationWarning[];
  readonly model?: string;
}

export interface AdaptiveCoverLetterProvenanceMetadata
  extends GenerationProvenanceMetadataBase {
  readonly contextVersion: 'generation-context-v2';
  readonly documentType: 'COVER_LETTER';
  readonly promptVersion: 'cover-letter-v4';
  readonly coverLetterMarket: CoverLetterMarket;
  readonly coverLetterSector: CoverLetterSector;
  readonly coverLetterSpecificationVersion: 'cover-letter-spec-v3';
}

export interface PreviousAdaptiveCoverLetterProvenanceMetadata
  extends GenerationProvenanceMetadataBase {
  readonly contextVersion: 'generation-context-v2';
  readonly documentType: 'COVER_LETTER';
  readonly promptVersion: 'cover-letter-v3';
  readonly coverLetterMarket: CoverLetterMarket;
  readonly coverLetterSector: CoverLetterSector;
  readonly coverLetterSpecificationVersion: 'cover-letter-spec-v2';
}

export interface InitialAdaptiveCoverLetterProvenanceMetadata
  extends GenerationProvenanceMetadataBase {
  readonly contextVersion: 'generation-context-v2';
  readonly documentType: 'COVER_LETTER';
  readonly promptVersion: 'cover-letter-v2';
  readonly coverLetterMarket: CoverLetterMarket;
  readonly coverLetterSector: CoverLetterSector;
  readonly coverLetterSpecificationVersion: 'cover-letter-spec-v1';
}

export interface LegacyCoverLetterProvenanceMetadata
  extends GenerationProvenanceMetadataBase {
  readonly contextVersion: 'generation-context-v1';
  readonly documentType: 'COVER_LETTER';
  readonly promptVersion: 'cover-letter-v1';
}

export interface BriefGenerationProvenanceMetadata
  extends GenerationProvenanceMetadataBase {
  readonly contextVersion: 'generation-context-v1';
  readonly documentType: 'APPLICATION_BRIEF' | 'INTERVIEW_BRIEF';
}

export type GenerationProvenanceMetadata =
  | AdaptiveCoverLetterProvenanceMetadata
  | PreviousAdaptiveCoverLetterProvenanceMetadata
  | InitialAdaptiveCoverLetterProvenanceMetadata
  | LegacyCoverLetterProvenanceMetadata
  | BriefGenerationProvenanceMetadata;

export interface GenerationDocumentVersionMetadata
  extends Readonly<Record<string, unknown>> {
  readonly generation: GenerationProvenanceMetadata;
}

export interface GenerationMetadataInput {
  readonly context: GenerationContext;
  readonly promptVersion: GenerationPromptVersion;
  readonly template: LoadedGenerationTemplate;
  readonly model?: string;
}

const expectedBriefPromptVersions = {
  APPLICATION_BRIEF: APPLICATION_BRIEF_PROMPT_VERSION,
  INTERVIEW_BRIEF: INTERVIEW_BRIEF_PROMPT_VERSION,
} as const;

function commonMetadata(
  input: GenerationMetadataInput,
): GenerationProvenanceMetadataBase {
  const { context, promptVersion, template } = input;
  return {
    contextVersion: context.contextVersion,
    documentType: context.documentType,
    outputLanguage: context.language,
    promptVersion,
    templateVersion: template.id,
    jobDescriptionId: context.provenance.jobDescriptionId,
    jobAnalysisId: context.provenance.jobAnalysisId,
    researchId: context.provenance.researchId,
    candidateContextUpdatedAt: context.provenance.candidateContextUpdatedAt,
    contextResearchClaimIds: [...context.provenance.researchClaimIds],
    contextAnalyzeRequirementIds: [],
    contextAnalyzeEvidenceIds: [],
    warnings: [...context.warnings],
    ...(input.model === undefined ? {} : { model: input.model }),
  };
}

export class GenerationMetadataBuilder {
  build(input: GenerationMetadataInput): GenerationDocumentVersionMetadata {
    const { context, promptVersion, template } = input;
    if (
      template.documentType !== context.documentType ||
      template.language !== context.language
    ) {
      throw new GenerationContextError('INVALID_SOURCE_CONTEXT');
    }

    if (context.documentType === 'COVER_LETTER') {
      if (promptVersion !== COVER_LETTER_PROMPT_VERSION) {
        throw new GenerationContextError('INVALID_SOURCE_CONTEXT');
      }
      return {
        generation: {
          ...commonMetadata(input),
          contextVersion: context.contextVersion,
          documentType: context.documentType,
          promptVersion,
          coverLetterMarket: context.specification.profile.market,
          coverLetterSector: context.specification.profile.sector,
          coverLetterSpecificationVersion: context.specification.version,
        },
      };
    }

    if (promptVersion !== expectedBriefPromptVersions[context.documentType]) {
      throw new GenerationContextError('INVALID_SOURCE_CONTEXT');
    }
    return {
      generation: {
        ...commonMetadata(input),
        contextVersion: context.contextVersion,
        documentType: context.documentType,
      },
    };
  }
}
