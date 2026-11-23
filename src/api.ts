import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp(config);

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
