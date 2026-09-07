import type { FastifyPluginAsync } from 'fastify';
import {
  applicationIdentifierParamsSchema,
  applicationListResponseSchema,
  applicationResponseSchema,
  applicationWriteRequestSchema,
} from './application.schemas.js';
import type { ApplicationService } from './application.service.js';
import type { Application, ApplicationWriteCommand } from './application.types.js';

export type ApplicationRouteService = Pick<
  ApplicationService,
  | 'getApplications'
  | 'getApplication'
  | 'createApplication'
  | 'replaceApplication'
>;

export interface ApplicationRoutesOptions {
  readonly resolveApplicationService: () => ApplicationRouteService;
}

interface ApplicationIdentifierParams {
  readonly id: string;
}

function serializeApplication(application: Application) {
  return {
    id: application.id,
    companyName: application.companyName,
    roleTitle: application.roleTitle,
    location: application.location,
    jobUrl: application.jobUrl,
    source: application.source,
    status: application.status,
    priority: application.priority,
    dateFound: application.dateFound,
    dateApplied: application.dateApplied,
    notesMarkdown: application.notesMarkdown,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}

export const applicationRoutes: FastifyPluginAsync<ApplicationRoutesOptions> = async (
  app,
  options,
) => {
  app.get(
    '/applications',
    {
      schema: {
        response: { 200: applicationListResponseSchema },
      },
    },
    async () => {
      const applications = await options
        .resolveApplicationService()
        .getApplications();
      return { applications: applications.map(serializeApplication) };
    },
  );

  app.post<{ Body: ApplicationWriteCommand }>(
    '/applications',
    {
      schema: {
        body: applicationWriteRequestSchema,
        response: { 201: applicationResponseSchema },
      },
    },
    async (request, reply) => {
      const application = await options
        .resolveApplicationService()
        .createApplication(request.body);

      return reply
        .status(201)
        .header('Location', `/api/v1/applications/${application.id}`)
        .send({ application: serializeApplication(application) });
    },
  );

  app.get<{ Params: ApplicationIdentifierParams }>(
    '/applications/:id',
    {
      schema: {
        params: applicationIdentifierParamsSchema,
        response: { 200: applicationResponseSchema },
      },
    },
    async (request) => {
      const application = await options
        .resolveApplicationService()
        .getApplication(request.params.id);
      return { application: serializeApplication(application) };
    },
  );

  app.put<{
    Params: ApplicationIdentifierParams;
    Body: ApplicationWriteCommand;
  }>(
    '/applications/:id',
    {
      schema: {
        params: applicationIdentifierParamsSchema,
        body: applicationWriteRequestSchema,
        response: { 200: applicationResponseSchema },
      },
    },
    async (request) => {
      const application = await options
        .resolveApplicationService()
        .replaceApplication(request.params.id, request.body);
      return { application: serializeApplication(application) };
    },
  );
};
