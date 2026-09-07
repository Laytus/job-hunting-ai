import type { FastifyPluginAsync } from 'fastify';
import {
  applicationEventListResponseSchema,
  applicationEventParamsSchema,
} from './application-event.schemas.js';
import type { ApplicationEventService } from './application-event.service.js';
import type { ApplicationEvent } from './application-event.types.js';

export type ApplicationEventRouteService = Pick<
  ApplicationEventService,
  'getApplicationEvents'
>;

export interface ApplicationEventRoutesOptions {
  readonly resolveApplicationEventService: () => ApplicationEventRouteService;
}

interface ApplicationParams {
  readonly id: string;
}

function serializeApplicationEvent(event: ApplicationEvent) {
  return {
    id: event.id,
    applicationId: event.applicationId,
    type: event.type,
    title: event.title,
    description: event.description,
    metadata: event.metadata,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}

export const applicationEventRoutes: FastifyPluginAsync<
  ApplicationEventRoutesOptions
> = async (app, options) => {
  app.get<{ Params: ApplicationParams }>(
    '/applications/:id/events',
    {
      schema: {
        params: applicationEventParamsSchema,
        response: { 200: applicationEventListResponseSchema },
      },
    },
    async (request) => {
      const events = await options
        .resolveApplicationEventService()
        .getApplicationEvents(request.params.id);
      return { events: events.map(serializeApplicationEvent) };
    },
  );
};
