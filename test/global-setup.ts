import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../src/db/migrate.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}

/**
 * Starts throwaway Postgres and Redis containers once for the whole integration run
 * and applies migrations. Set TEST_DATABASE_URL and TEST_REDIS_URL to use services
 * that are already running instead (for machines without Docker).
 */
export default async function setup(project: TestProject) {
  let postgres: StartedPostgreSqlContainer | undefined;
  let redis: StartedRedisContainer | undefined;

  let databaseUrl = process.env.TEST_DATABASE_URL;
  let redisUrl = process.env.TEST_REDIS_URL;

  if (!databaseUrl) {
    postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
    databaseUrl = postgres.getConnectionUri();
  }
  if (!redisUrl) {
    redis = await new RedisContainer('redis:7-alpine').start();
    redisUrl = redis.getConnectionUrl();
  }

  await runMigrations(databaseUrl);
  project.provide('databaseUrl', databaseUrl);
  project.provide('redisUrl', redisUrl);

  return async () => {
    await Promise.all([postgres?.stop(), redis?.stop()]);
  };
}
