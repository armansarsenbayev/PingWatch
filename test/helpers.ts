import type { Config } from '../src/config.js';

export const testConfig: Config = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 0,
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://pingwatch:pingwatch@localhost:5432/pingwatch_test',
  REDIS_URL: 'redis://localhost:6379',
};
