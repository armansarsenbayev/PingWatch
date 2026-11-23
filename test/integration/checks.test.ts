import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { monitors, users } from '../../src/db/schema.js';
import { createScheduler } from '../../src/modules/checks/scheduler.js';
import { createTestApp, resetState, type TestContext } from '../helpers.js';
import { demoRoutes, startTestServer } from '../test-server.js';

describe('scheduler', () => {
  let ctx: TestContext;
  let server: Awaited<ReturnType<typeof startTestServer>>;
  let userId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = await startTestServer(demoRoutes);
  });
  afterAll(async () => {
    await server.close();
    await ctx.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
    await ctx.checksQueue.obliterate({ force: true });
    const [user] = await ctx.db
      .insert(users)
      .values({ email: 'owner@example.com', passwordHash: 'x' })
      .returning();
    userId = user!.id;
  });

  const insertMonitor = async (values: Partial<typeof monitors.$inferInsert> = {}) => {
    const [m] = await ctx.db
      .insert(monitors)
      .values({ userId, name: 'demo', url: `${server.url}/ok`, timeoutMs: 1000, ...values })
      .returning();
    return m!;
  };

  describe('scheduler', () => {
    it('queues due monitors and moves next_check_at forward', async () => {
      const due = await insertMonitor({ intervalSec: 60 });
      await insertMonitor({ nextCheckAt: new Date(Date.now() + 60_000) }); // not due yet
      await insertMonitor({ isPaused: true }); // paused

      const now = new Date();
      expect(await createScheduler(ctx.db, ctx.checksQueue).tick(now)).toBe(1);

      const jobs = await ctx.checksQueue.getJobs(['waiting']);
      expect(jobs.map((j) => j.data.monitorId)).toEqual([due.id]);

      const after = await ctx.db.query.monitors.findFirst({ where: eq(monitors.id, due.id) });
      expect(after!.nextCheckAt.getTime()).toBe(now.getTime() + 60_000);
    });

    it('never queues a monitor twice when two schedulers run at the same time', async () => {
      for (let i = 0; i < 30; i++) await insertMonitor({ name: `m${i}` });
      const a = createScheduler(ctx.db, ctx.checksQueue);
      const b = createScheduler(ctx.db, ctx.checksQueue);

      const [countA, countB] = await Promise.all([a.tick(), b.tick()]);
      expect(countA + countB).toBe(30);
      expect(await ctx.checksQueue.getWaitingCount()).toBe(30);
    });
  });
});
