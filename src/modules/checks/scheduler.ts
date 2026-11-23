import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { Db } from '../../db/client.js';
import { monitors } from '../../db/schema.js';
import { checkJobId, type ChecksQueue } from './queue.js';

export interface SchedulerOptions {
  batchSize?: number;
  log?: Logger;
}

export function createScheduler(db: Db, queue: ChecksQueue, options: SchedulerOptions = {}) {
  const batchSize = options.batchSize ?? 500;

  /**
   * Finds monitors that are due and queues one check for each.
   * FOR UPDATE SKIP LOCKED lets several schedulers run at once: rows locked by one
   * transaction are skipped by the others, so no monitor is picked twice.
   */
  async function tick(now: Date = new Date()): Promise<number> {
    return db.transaction(async (tx) => {
      const due = await tx
        .select({ id: monitors.id, nextCheckAt: monitors.nextCheckAt })
        .from(monitors)
        .where(and(eq(monitors.isPaused, false), lte(monitors.nextCheckAt, now)))
        .orderBy(asc(monitors.nextCheckAt))
        .limit(batchSize)
        .for('update', { skipLocked: true });
      if (due.length === 0) return 0;

      await queue.addBulk(
        due.map((m) => ({
          name: 'check',
          data: { monitorId: m.id, scheduledFor: m.nextCheckAt.toISOString() },
          opts: { jobId: checkJobId(m.id, m.nextCheckAt) },
        })),
      );

      // Next run counts from now, not from the old due time: after downtime the
      // scheduler does not fire a burst of missed checks.
      await tx
        .update(monitors)
        .set({
          nextCheckAt: sql`${now.toISOString()}::timestamptz + make_interval(secs => ${monitors.intervalSec})`,
        })
        .where(
          inArray(
            monitors.id,
            due.map((m) => m.id),
          ),
        );
      return due.length;
    });
  }

  let timer: NodeJS.Timeout | undefined;
  let running: Promise<unknown> = Promise.resolve();
  let stopped = false;

  return {
    tick,
    start(intervalMs: number) {
      const loop = () => {
        if (stopped) return;
        running = tick()
          .then((count) => {
            if (count > 0) options.log?.info({ count }, 'queued checks');
          })
          .catch((err: unknown) => options.log?.error({ err }, 'scheduler tick failed'))
          .finally(() => {
            if (!stopped) timer = setTimeout(loop, intervalMs);
          });
      };
      loop();
    },
    /** Stops the loop and waits for a tick that is in progress. */
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
