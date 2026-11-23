import { randomUUID } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { registerErrorHandler } from './lib/error-handler.js';
import { loggerOptions } from './lib/logger.js';
import { healthRoutes, type ReadinessCheck } from './routes/health.js';

export interface AppDeps {
  db: Db;
  redis: Redis;
  readinessChecks?: ReadinessCheck[];
}

/**
 * Builds the Fastify instance without starting it.
 * Dependencies are passed in, so tests can give it their own database and Redis
 * and call app.inject() instead of opening a real port.
 */
export async function buildApp(config: Config, deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(config),
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  // Return the request id so a client can quote it when reporting a problem.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // Counters live in Redis, so the limit holds across several API replicas.
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    redis: deps.redis,
    nameSpace: 'pingwatch:ratelimit:',
  });

  await app.register(healthRoutes, { checks: deps.readinessChecks ?? [] });

  return app;
}
