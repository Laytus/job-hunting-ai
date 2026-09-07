import type { FastifyPluginAsync } from 'fastify';
import { mapAnalyzeApiError } from './analyze-api.errors.js';
import {
  serializeJobAnalysisDetail,
  serializeJobAnalysisSummary,
} from './analyze-api.mapper.js';
import {
  analyzeApplicationParamsSchema,
  analyzeDetailParamsSchema,
  analyzeExecuteRequestSchema,
  analyzeHistoryResponseSchema,
  jobAnalysisDetailResponseSchema,
} from './analyze.schemas.js';
import type { AnalyzeService } from './analyze-service.js';

export type AnalyzeRouteService = Pick<
  AnalyzeService,
  | 'analyzeApplication'
  | 'getAnalyses'
  | 'getAnalysis'
  | 'getLatestCompletedAnalysis'
>;

export interface AnalyzeRoutesOptions {
  readonly resolveAnalyzeService: () => AnalyzeRouteService;
}

interface ApplicationParams {
  readonly applicationId: string;
}

interface AnalysisParams extends ApplicationParams {
  readonly analysisId: string;
}

async function withAnalyzeApiErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapAnalyzeApiError(error);
  }
}

export const analyzeRoutes: FastifyPluginAsync<AnalyzeRoutesOptions> = async (
  app,
  options,
) => {
  app.post<{ Params: ApplicationParams; Body: Record<string, never> | null }>(
    '/applications/:applicationId/analyze',
    {
      schema: {
        params: analyzeApplicationParamsSchema,
        body: analyzeExecuteRequestSchema,
        response: { 201: jobAnalysisDetailResponseSchema },
      },
    },
    async (request, reply) => {
      const service = options.resolveAnalyzeService();
      const execution = await withAnalyzeApiErrors(() =>
        service.analyzeApplication(request.params.applicationId),
      );
      const analysis = await withAnalyzeApiErrors(() =>
        service.getAnalysis(request.params.applicationId, execution.analysisId),
      );

      return reply
        .status(201)
        .header(
          'Location',
          `/api/v1/applications/${request.params.applicationId}/analyses/${analysis.id}`,
        )
        .send(serializeJobAnalysisDetail(analysis));
    },
  );

  app.get<{ Params: ApplicationParams }>(
    '/applications/:applicationId/analyses',
    {
      schema: {
        params: analyzeApplicationParamsSchema,
        response: { 200: analyzeHistoryResponseSchema },
      },
    },
    async (request) => {
      const analyses = await withAnalyzeApiErrors(() =>
        options
          .resolveAnalyzeService()
          .getAnalyses(request.params.applicationId),
      );
      return { items: analyses.map(serializeJobAnalysisSummary) };
    },
  );

  app.get<{ Params: ApplicationParams }>(
    '/applications/:applicationId/analyses/latest-completed',
    {
      schema: {
        params: analyzeApplicationParamsSchema,
        response: { 200: jobAnalysisDetailResponseSchema },
      },
    },
    async (request) => {
      const analysis = await withAnalyzeApiErrors(() =>
        options
          .resolveAnalyzeService()
          .getLatestCompletedAnalysis(request.params.applicationId),
      );
      return serializeJobAnalysisDetail(analysis);
    },
  );

  app.get<{ Params: AnalysisParams }>(
    '/applications/:applicationId/analyses/:analysisId',
    {
      schema: {
        params: analyzeDetailParamsSchema,
        response: { 200: jobAnalysisDetailResponseSchema },
      },
    },
    async (request) => {
      const analysis = await withAnalyzeApiErrors(() =>
        options
          .resolveAnalyzeService()
          .getAnalysis(
            request.params.applicationId,
            request.params.analysisId,
          ),
      );
      return serializeJobAnalysisDetail(analysis);
    },
  );
};
