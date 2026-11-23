import { pino } from 'pino';
import { loadWorkerConfig } from './config.js';
import { createDb } from './db/client.js';
import { loggerOptions } from './lib/logger.js';
import { createRedis } from './lib/redis.js';
import { createChecksQueue } from './modules/checks/queue.js';
import { createScheduler } from './modules/checks/scheduler.js';

const config = loadWorkerConfig();
const log = pino(loggerOptions(config)).child({ process: 'scheduler' });
const { db, pool } = createDb(config.DATABASE_URL);
const redis = createRedis(config.REDIS_URL);
const queue = createChecksQueue(redis);
const scheduler = createScheduler(db, queue, { log });

scheduler.start(config.SCHEDULER_TICK_MS);
log.info({ tickMs: config.SCHEDULER_TICK_MS }, 'scheduler started');

const shutdown = async (signal: NodeJS.Signals) => {
  log.info({ signal }, 'shutting down');
  try {
    await scheduler.stop();
    await queue.close();
    await Promise.all([pool.end(), redis.quit()]);
    process.exit(0);
  } catch (err) {
    log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
};
process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));
