import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { inject } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Config } from '../src/config.js';
import { createDb, type Db } from '../src/db/client.js';
import { createRedis } from '../src/lib/redis.js';
import type { Resolver } from '../src/modules/checks/ssrf-guard.js';
import type { ReadinessCheck } from '../src/routes/health.js';

export const testConfig: Config = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 0,
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://pingwatch:pingwatch@localhost:5432/pingwatch_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: 30,
  ALLOW_PRIVATE_TARGETS: false,
};

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  pool: pg.Pool;
  redis: Redis;
  close: () => Promise<void>;
}

/**
 * Fake DNS for tests: names ending in .internal.test resolve to a private address,
 * everything else to a public documentation address.
 */
export const fakeResolver: Resolver = async (hostname) =>
  hostname.endsWith('.internal.test') ? ['10.0.0.5'] : ['93.184.215.14'];

/** Builds the real app on the integration database and Redis. */
export async function createTestApp(readinessChecks?: ReadinessCheck[]): Promise<TestContext> {
  const databaseUrl = inject('databaseUrl');
  const redisUrl = inject('redisUrl');
  const { db, pool } = createDb(databaseUrl);
  const redis = createRedis(redisUrl);
  const app = await buildApp(
    { ...testConfig, DATABASE_URL: databaseUrl, REDIS_URL: redisUrl },
    { db, redis, resolve: fakeResolver, ...(readinessChecks && { readinessChecks }) },
  );
  return {
    app,
    db,
    pool,
    redis,
    close: async () => {
      await app.close();
      await Promise.all([pool.end(), redis.quit()]);
    },
  };
}

/** Empties every table and the rate limit counters between tests. */
export async function resetState(ctx: TestContext): Promise<void> {
  await ctx.pool.query('TRUNCATE users, refresh_tokens, monitors, checks RESTART IDENTITY CASCADE');
  await ctx.redis.flushdb();
}
