import { sql } from 'drizzle-orm';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { createRedis } from './lib/redis.js';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const redis = createRedis(config.REDIS_URL);

const app = await buildApp(config, {
  db,
  redis,
  readinessChecks: [
    { name: 'postgres', check: async () => void (await db.execute(sql`select 1`)) },
    { name: 'redis', check: async () => void (await redis.ping()) },
  ],
});

// Close connections after the server has stopped accepting requests.
app.addHook('onClose', async () => {
  await Promise.all([pool.end(), redis.quit()]);
});

// Graceful shutdown: stop accepting requests, let in-flight ones finish, then exit.
const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, 'shutting down');
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
};
process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.fatal({ err }, 'failed to start');
  process.exit(1);
}
