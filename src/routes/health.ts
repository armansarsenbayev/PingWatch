import type { FastifyPluginAsync } from 'fastify';

export interface ReadinessCheck {
  name: string;
  check: () => Promise<void>;
}

export interface HealthRoutesOptions {
  checks?: ReadinessCheck[];
}

/**
 * /health/live answers as long as the process can serve requests.
 * /health/ready also runs every dependency check (Postgres, Redis, ...)
 * and returns 503 if any of them fails, so traffic is held back.
 */
export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, opts) => {
  const checks = opts.checks ?? [];

  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    const results = await Promise.all(
      checks.map(async ({ name, check }) => {
        try {
          await check();
          return [name, 'ok'] as const;
        } catch (err) {
          app.log.warn({ err, check: name }, 'readiness check failed');
          return [name, 'fail'] as const;
        }
      }),
    );
    const ready = results.every(([, status]) => status === 'ok');
    return reply
      .code(ready ? 200 : 503)
      .send({ status: ready ? 'ok' : 'unavailable', checks: Object.fromEntries(results) });
  });
};
