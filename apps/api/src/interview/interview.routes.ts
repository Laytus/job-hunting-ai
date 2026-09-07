import type { FastifyPluginAsync } from 'fastify';
import {
  interviewApplicationParamsSchema,
  interviewIdentifierParamsSchema,
  interviewListResponseSchema,
  interviewResponseSchema,
  interviewWriteRequestSchema,
} from './interview.schemas.js';
import type { InterviewService } from './interview.service.js';
import type { Interview, InterviewWriteInput } from './interview.types.js';

export type InterviewRouteService = Pick<
  InterviewService,
  'getInterviews' | 'createInterview' | 'replaceInterview'
>;

export interface InterviewRoutesOptions {
  readonly resolveInterviewService: () => InterviewRouteService;
}

interface ApplicationParams {
  readonly id: string;
}

interface InterviewParams extends ApplicationParams {
  readonly interviewId: string;
}

function serializeInterview(interview: Interview) {
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    type: interview.type,
    status: interview.status,
    scheduledAt: interview.scheduledAt?.toISOString() ?? null,
    completedAt: interview.completedAt?.toISOString() ?? null,
    notesMarkdown: interview.notesMarkdown,
    feedbackMarkdown: interview.feedbackMarkdown,
    sortOrder: interview.sortOrder,
    createdAt: interview.createdAt.toISOString(),
    updatedAt: interview.updatedAt.toISOString(),
  };
}

export const interviewRoutes: FastifyPluginAsync<InterviewRoutesOptions> = async (
  app,
  options,
) => {
  app.get<{ Params: ApplicationParams }>(
    '/applications/:id/interviews',
    {
      schema: {
        params: interviewApplicationParamsSchema,
        response: { 200: interviewListResponseSchema },
      },
    },
    async (request) => {
      const interviews = await options
        .resolveInterviewService()
        .getInterviews(request.params.id);
      return { interviews: interviews.map(serializeInterview) };
    },
  );

  app.post<{ Params: ApplicationParams; Body: InterviewWriteInput }>(
    '/applications/:id/interviews',
    {
      schema: {
        params: interviewApplicationParamsSchema,
        body: interviewWriteRequestSchema,
        response: { 201: interviewResponseSchema },
      },
    },
    async (request, reply) => {
      const interview = await options
        .resolveInterviewService()
        .createInterview(request.params.id, request.body);
      return reply
        .status(201)
        .header(
          'Location',
          `/api/v1/applications/${request.params.id}/interviews/${interview.id}`,
        )
        .send({ interview: serializeInterview(interview) });
    },
  );

  app.put<{ Params: InterviewParams; Body: InterviewWriteInput }>(
    '/applications/:id/interviews/:interviewId',
    {
      schema: {
        params: interviewIdentifierParamsSchema,
        body: interviewWriteRequestSchema,
        response: { 200: interviewResponseSchema },
      },
    },
    async (request) => {
      const interview = await options
        .resolveInterviewService()
        .replaceInterview(
          request.params.id,
          request.params.interviewId,
          request.body,
        );
      return { interview: serializeInterview(interview) };
    },
  );
};
