import type { FastifyPluginAsync } from 'fastify';
import { mapGenerationApiError } from './generation-api.errors.js';
import { serializeGenerationResult } from './generation-api.mapper.js';
import type {
  GenerationExecutionResult,
  GenerationService,
} from './generation-service.js';
import {
  coverLetterProfileSuggestionResponseSchema,
  generateDocumentRequestSchema,
  generationApplicationParamsSchema,
  generationDocumentParamsSchema,
  generationResponseSchema,
  regenerateDocumentRequestSchema,
} from './generation.schemas.js';
import type {
  CoverLetterGenerationProfileFields,
  CoverLetterProfileSuggestion,
  GenerationDocumentRequest,
  GenerationDocumentType,
} from './generation.types.js';

export type GenerationRouteService = Pick<
  GenerationService,
  'generateDocument' | 'suggestCoverLetterProfile'
>;

export interface GenerationRoutesOptions {
  readonly resolveGenerationService: () => GenerationRouteService;
}

interface ApplicationParams {
  readonly applicationId: string;
}

interface DocumentParams extends ApplicationParams {
  readonly documentId: string;
}

type GenerateBody =
  | ({
      readonly documentType: 'COVER_LETTER';
    } & CoverLetterGenerationProfileFields)
  | {
      readonly documentType: Exclude<
        GenerationDocumentType,
        'COVER_LETTER'
      >;
    };

type RegenerateBody =
  | CoverLetterGenerationProfileFields
  | { readonly outputLanguage?: 'en' };

async function executeGeneration(
  service: GenerationRouteService,
  request: GenerationDocumentRequest,
): Promise<GenerationExecutionResult> {
  try {
    return await service.generateDocument(request);
  } catch (error) {
    throw mapGenerationApiError(error);
  }
}

async function suggestCoverLetterProfile(
  service: GenerationRouteService,
  applicationId: string,
): Promise<CoverLetterProfileSuggestion> {
  try {
    return await service.suggestCoverLetterProfile(applicationId);
  } catch (error) {
    throw mapGenerationApiError(error);
  }
}

export const generationRoutes: FastifyPluginAsync<GenerationRoutesOptions> =
  async (app, options) => {
    app.get<{ Params: ApplicationParams }>(
      '/applications/:applicationId/generation/cover-letter-profile',
      {
        schema: {
          params: generationApplicationParamsSchema,
          response: { 200: coverLetterProfileSuggestionResponseSchema },
        },
      },
      async (request, reply) => {
        const suggestion = await suggestCoverLetterProfile(
          options.resolveGenerationService(),
          request.params.applicationId,
        );
        return reply.status(200).send({ suggestion });
      },
    );

    app.post<{ Params: ApplicationParams; Body: GenerateBody }>(
      '/applications/:applicationId/generation',
      {
        schema: {
          params: generationApplicationParamsSchema,
          body: generateDocumentRequestSchema,
          response: { 201: generationResponseSchema },
        },
      },
      async (request, reply) => {
        const outputLanguage =
          request.body.documentType === 'COVER_LETTER'
            ? request.body.outputLanguage
            : 'en';
        const result = await executeGeneration(
          options.resolveGenerationService(),
          request.body.documentType === 'COVER_LETTER'
            ? {
                mode: 'GENERATE',
                applicationId: request.params.applicationId,
                documentType: request.body.documentType,
                outputLanguage,
                market: request.body.market,
                sector: request.body.sector,
              }
            : {
                mode: 'GENERATE',
                applicationId: request.params.applicationId,
                documentType: request.body.documentType,
                outputLanguage: 'en',
              },
        );

        return reply
          .status(201)
          .header('Location', `/api/v1/documents/${result.document.id}`)
          .send(serializeGenerationResult(result));
      },
    );

    app.post<{ Params: DocumentParams; Body: RegenerateBody | null }>(
      '/applications/:applicationId/documents/:documentId/regenerate',
      {
        schema: {
          params: generationDocumentParamsSchema,
          body: regenerateDocumentRequestSchema,
          response: { 200: generationResponseSchema },
        },
      },
      async (request, reply) => {
        const result = await executeGeneration(
          options.resolveGenerationService(),
          {
            mode: 'REGENERATE',
            applicationId: request.params.applicationId,
            documentId: request.params.documentId,
            ...(request.body ?? {}),
          },
        );

        return reply.status(200).send(serializeGenerationResult(result));
      },
    );
  };
