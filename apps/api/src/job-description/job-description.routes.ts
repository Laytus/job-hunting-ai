import type { FastifyPluginAsync } from 'fastify';
import {
  jobDescriptionIdentifierParamsSchema,
  jobDescriptionResponseSchema,
  jobDescriptionWriteRequestSchema,
  optionalJobDescriptionResponseSchema,
} from './job-description.schemas.js';
import type { JobDescriptionService } from './job-description.service.js';
import type {
  JobDescription,
  JobDescriptionWriteInput,
} from './job-description.types.js';

export type JobDescriptionRouteService = Pick<
  JobDescriptionService,
  'getJobDescription' | 'replaceJobDescription'
>;

export interface JobDescriptionRoutesOptions {
  readonly resolveJobDescriptionService: () => JobDescriptionRouteService;
}

interface ApplicationIdentifierParams {
  readonly id: string;
}

function serializeJobDescription(jobDescription: JobDescription) {
  return {
    id: jobDescription.id,
    applicationId: jobDescription.applicationId,
    title: jobDescription.title,
    companyName: jobDescription.companyName,
    descriptionMarkdown: jobDescription.descriptionMarkdown,
    requirementsMarkdown: jobDescription.requirementsMarkdown,
    responsibilitiesMarkdown: jobDescription.responsibilitiesMarkdown,
    structuredData: jobDescription.structuredData,
    sourceUrl: jobDescription.sourceUrl,
    createdAt: jobDescription.createdAt.toISOString(),
    updatedAt: jobDescription.updatedAt.toISOString(),
  };
}

export const jobDescriptionRoutes: FastifyPluginAsync<
  JobDescriptionRoutesOptions
> = async (app, options) => {
  app.get<{ Params: ApplicationIdentifierParams }>(
    '/applications/:id/job-description',
    {
      schema: {
        params: jobDescriptionIdentifierParamsSchema,
        response: { 200: optionalJobDescriptionResponseSchema },
      },
    },
    async (request) => {
      const jobDescription = await options
        .resolveJobDescriptionService()
        .getJobDescription(request.params.id);

      return {
        jobDescription:
          jobDescription === null ? null : serializeJobDescription(jobDescription),
      };
    },
  );

  app.put<{
    Params: ApplicationIdentifierParams;
    Body: JobDescriptionWriteInput;
  }>(
    '/applications/:id/job-description',
    {
      schema: {
        params: jobDescriptionIdentifierParamsSchema,
        body: jobDescriptionWriteRequestSchema,
        response: {
          200: jobDescriptionResponseSchema,
          201: jobDescriptionResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await options
        .resolveJobDescriptionService()
        .replaceJobDescription(request.params.id, request.body);
      const response = {
        jobDescription: serializeJobDescription(result.jobDescription),
      };

      if (result.created) {
        return reply
          .status(201)
          .header(
            'Location',
            `/api/v1/applications/${request.params.id}/job-description`,
          )
          .send(response);
      }

      return reply.status(200).send(response);
    },
  );
};
