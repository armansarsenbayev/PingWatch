import { runMigrations } from './db/migrate.js';

// Entry point for the one-off "migrate" service in compose.
// Runs pending migrations and exits, so app replicas never race each other on startup.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
await runMigrations(databaseUrl);
console.log('migrations applied');
