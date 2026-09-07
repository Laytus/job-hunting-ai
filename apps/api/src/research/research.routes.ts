import type { FastifyPluginAsync } from 'fastify';
import { mapResearchApiError } from './research-api.errors.js';
import {
  serializeResearchDetail,
  serializeResearchSummary,
} from './research-api.mapper.js';
import {
  researchApplicationParamsSchema,
  researchDetailParamsSchema,
  researchDetailResponseSchema,
  researchExecuteRequestSchema,
  researchHistoryResponseSchema,
} from './research.schemas.js';
import type { ResearchService } from './research-service.js';

export type ResearchRouteService = Pick<
  ResearchService,
  | 'researchApplication'
  | 'getResearches'
  | 'getResearch'
  | 'getLatestCompletedResearch'
>;

export interface ResearchRoutesOptions {
  readonly resolveResearchService: () => ResearchRouteService;
}

interface ApplicationParams {
  readonly applicationId: string;
}

interface ResearchParams extends ApplicationParams {
  readonly researchId: string;
}

async function withResearchApiErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapResearchApiError(error);
  }
}

export const researchRoutes: FastifyPluginAsync<ResearchRoutesOptions> = async (
  app,
  options,
) => {
  app.post<{ Params: ApplicationParams; Body: Record<string, never> | null }>(
    '/applications/:applicationId/research',
    {
      schema: {
        params: researchApplicationParamsSchema,
        body: researchExecuteRequestSchema,
        response: { 201: researchDetailResponseSchema },
      },
    },
    async (request, reply) => {
      const research = await withResearchApiErrors(() =>
        options
          .resolveResearchService()
          .researchApplication(request.params.applicationId),
      );

      return reply
        .status(201)
        .header(
          'Location',
          `/api/v1/applications/${request.params.applicationId}/researches/${research.id}`,
        )
        .send(serializeResearchDetail(research));
    },
  );

  app.get<{ Params: ApplicationParams }>(
    '/applications/:applicationId/researches',
    {
      schema: {
        params: researchApplicationParamsSchema,
        response: { 200: researchHistoryResponseSchema },
      },
    },
    async (request) => {
      const researches = await withResearchApiErrors(() =>
        options
          .resolveResearchService()
          .getResearches(request.params.applicationId),
      );
      return { items: researches.map(serializeResearchSummary) };
    },
  );

  app.get<{ Params: ApplicationParams }>(
    '/applications/:applicationId/researches/latest-completed',
    {
      schema: {
        params: researchApplicationParamsSchema,
        response: { 200: researchDetailResponseSchema },
      },
    },
    async (request) => {
      const research = await withResearchApiErrors(() =>
        options
          .resolveResearchService()
          .getLatestCompletedResearch(request.params.applicationId),
      );
      return serializeResearchDetail(research);
    },
  );

  app.get<{ Params: ResearchParams }>(
    '/applications/:applicationId/researches/:researchId',
    {
      schema: {
        params: researchDetailParamsSchema,
        response: { 200: researchDetailResponseSchema },
      },
    },
    async (request) => {
      const research = await withResearchApiErrors(() =>
        options
          .resolveResearchService()
          .getResearch(request.params.applicationId, request.params.researchId),
      );
      return serializeResearchDetail(research);
    },
  );
};
