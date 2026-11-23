import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  telegramChatId: text('telegram_chat_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Refresh tokens are random strings; only their SHA-256 hash is stored,
 * so a database leak does not give anyone a usable session.
 * A rotated token keeps its row (revoked_at set) so that reuse can be detected.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('refresh_tokens_active_by_user_idx')
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export const httpMethod = pgEnum('http_method', ['GET', 'HEAD']);
export const monitorStatus = pgEnum('monitor_status', ['unknown', 'up', 'down']);

export const monitors = pgTable(
  'monitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    method: httpMethod('method').notNull().default('GET'),
    intervalSec: integer('interval_sec').notNull().default(60),
    timeoutMs: integer('timeout_ms').notNull().default(10_000),
    expectedStatus: integer('expected_status').notNull().default(200),
    keyword: text('keyword'),
    isPaused: boolean('is_paused').notNull().default(false),
    // Scheduler state: when the next check is due and what the last checks said.
    nextCheckAt: timestamp('next_check_at', { withTimezone: true }).notNull().defaultNow(),
    lastStatus: monitorStatus('last_status').notNull().default('unknown'),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    consecutiveSuccesses: integer('consecutive_successes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('monitors_user_created_idx').on(t.userId, t.createdAt),
    // Partial index for the scheduler query: active monitors ordered by due time.
    index('monitors_due_idx')
      .on(t.nextCheckAt)
      .where(sql`${t.isPaused} = false`),
  ],
);

export type User = typeof users.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Monitor = typeof monitors.$inferSelect;
