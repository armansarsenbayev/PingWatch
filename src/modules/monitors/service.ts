import { and, count, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { monitors, users, type Monitor } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import { assertSafeTarget, type TargetPolicy } from '../checks/ssrf-guard.js';
import type { CreateMonitorInput, MonitorResponse, UpdateMonitorInput } from './schemas.js';

export interface MonitorsServiceOptions extends TargetPolicy {
  maxPerUser: number;
}

export const toMonitorResponse = (m: Monitor): MonitorResponse => ({
  id: m.id,
  name: m.name,
  url: m.url,
  method: m.method,
  intervalSec: m.intervalSec,
  timeoutMs: m.timeoutMs,
  expectedStatus: m.expectedStatus,
  keyword: m.keyword,
  isPaused: m.isPaused,
  lastStatus: m.lastStatus,
  nextCheckAt: m.nextCheckAt.toISOString(),
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
});

export function createMonitorsService(db: Db, options: MonitorsServiceOptions) {
  // Every query is scoped by user id: someone else's monitor looks exactly like a missing one.
  const owned = (userId: string, id: string) =>
    and(eq(monitors.id, id), eq(monitors.userId, userId));

  async function findOwned(userId: string, id: string): Promise<Monitor> {
    const monitor = await db.query.monitors.findFirst({ where: owned(userId, id) });
    if (!monitor) throw errors.notFound('Monitor');
    return monitor;
  }

  return {
    async list(userId: string, limit: number, offset: number) {
      const [items, [totals]] = await Promise.all([
        db
          .select()
          .from(monitors)
          .where(eq(monitors.userId, userId))
          .orderBy(desc(monitors.createdAt), desc(monitors.id))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(monitors).where(eq(monitors.userId, userId)),
      ]);
      return { items: items.map(toMonitorResponse), total: totals?.total ?? 0, limit, offset };
    },

    async create(userId: string, input: CreateMonitorInput): Promise<MonitorResponse> {
      if (input.timeoutMs >= input.intervalSec * 1000) throw errors.invalidTimeout();
      await assertSafeTarget(input.url, options);

      return db.transaction(async (tx) => {
        // Lock the user row so two parallel requests cannot both pass the limit check.
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
        const [existing] = await tx
          .select({ total: count() })
          .from(monitors)
          .where(eq(monitors.userId, userId));
        if ((existing?.total ?? 0) >= options.maxPerUser) {
          throw errors.monitorLimitReached(options.maxPerUser);
        }
        const [created] = await tx
          .insert(monitors)
          .values({ ...input, userId })
          .returning();
        return toMonitorResponse(created!);
      });
    },

    async get(userId: string, id: string): Promise<MonitorResponse> {
      return toMonitorResponse(await findOwned(userId, id));
    },

    async update(userId: string, id: string, patch: UpdateMonitorInput): Promise<MonitorResponse> {
      const current = await findOwned(userId, id);
      const intervalSec = patch.intervalSec ?? current.intervalSec;
      const timeoutMs = patch.timeoutMs ?? current.timeoutMs;
      if (timeoutMs >= intervalSec * 1000) throw errors.invalidTimeout();
      if (patch.url !== undefined) await assertSafeTarget(patch.url, options);

      const [updated] = await db
        .update(monitors)
        .set({ ...patch, updatedAt: new Date() })
        .where(owned(userId, id))
        .returning();
      if (!updated) throw errors.notFound('Monitor');
      return toMonitorResponse(updated);
    },

    async remove(userId: string, id: string): Promise<void> {
      const deleted = await db
        .delete(monitors)
        .where(owned(userId, id))
        .returning({ id: monitors.id });
      if (deleted.length === 0) throw errors.notFound('Monitor');
    },

    async setPaused(userId: string, id: string, paused: boolean): Promise<MonitorResponse> {
      const [updated] = await db
        .update(monitors)
        .set({
          isPaused: paused,
          updatedAt: new Date(),
          // A resumed monitor is checked right away instead of waiting a full interval.
          ...(!paused && { nextCheckAt: new Date() }),
        })
        .where(owned(userId, id))
        .returning();
      if (!updated) throw errors.notFound('Monitor');
      return toMonitorResponse(updated);
    },
  };
}

export type MonitorsService = ReturnType<typeof createMonitorsService>;
