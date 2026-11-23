import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createMonitorSchema,
  listQuerySchema,
  monitorListSchema,
  monitorParamsSchema,
  monitorSchema,
  updateMonitorSchema,
} from './schemas.js';
import type { MonitorsService } from './service.js';

export interface MonitorRoutesOptions {
  monitorsService: MonitorsService;
}

export const monitorRoutes: FastifyPluginAsyncZod<MonitorRoutesOptions> = async (app, opts) => {
  const service = opts.monitorsService;
  const docs = { tags: ['monitors'], security: [{ bearerAuth: [] }] };

  app.addHook('onRequest', app.authenticate);

  app.get(
    '/monitors',
    { schema: { ...docs, querystring: listQuerySchema, response: { 200: monitorListSchema } } },
    async (request) => service.list(request.user.sub, request.query.limit, request.query.offset),
  );

  app.post(
    '/monitors',
    { schema: { ...docs, body: createMonitorSchema, response: { 201: monitorSchema } } },
    async (request, reply) =>
      reply.code(201).send(await service.create(request.user.sub, request.body)),
  );

  app.get(
    '/monitors/:id',
    { schema: { ...docs, params: monitorParamsSchema, response: { 200: monitorSchema } } },
    async (request) => service.get(request.user.sub, request.params.id),
  );

  app.patch(
    '/monitors/:id',
    {
      schema: {
        ...docs,
        params: monitorParamsSchema,
        body: updateMonitorSchema,
        response: { 200: monitorSchema },
      },
    },
    async (request) => service.update(request.user.sub, request.params.id, request.body),
  );

  app.delete(
    '/monitors/:id',
    { schema: { ...docs, params: monitorParamsSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await service.remove(request.user.sub, request.params.id);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/monitors/:id/pause',
    { schema: { ...docs, params: monitorParamsSchema, response: { 200: monitorSchema } } },
    async (request) => service.setPaused(request.user.sub, request.params.id, true),
  );

  app.post(
    '/monitors/:id/resume',
    { schema: { ...docs, params: monitorParamsSchema, response: { 200: monitorSchema } } },
    async (request) => service.setPaused(request.user.sub, request.params.id, false),
  );
};
