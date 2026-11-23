import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { loggerOptions } from './lib/logger.js';
import { healthRoutes, type ReadinessCheck } from './routes/health.js';

export interface BuildAppOptions {
  readinessChecks?: ReadinessCheck[];
}

/**
 * Builds the Fastify instance without starting it.
 * Tests call this directly and use app.inject() instead of a real port.
 */
export async function buildApp(
  config: Config,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(config),
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  });

  // Return the request id so a client can quote it when reporting a problem.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(healthRoutes, { checks: options.readinessChecks ?? [] });

  return app;
}
