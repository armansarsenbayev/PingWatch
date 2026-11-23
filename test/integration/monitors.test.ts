import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetState, type TestContext } from '../helpers.js';

describe('monitors', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  let token: string;
  beforeEach(async () => {
    await resetState(ctx);
    token = await signUp('owner@example.com');
  });

  async function signUp(email: string): Promise<string> {
    const credentials = { email, password: 'correct-horse-battery' };
    await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: credentials });
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: credentials,
    });
    return login.json<{ accessToken: string }>().accessToken;
  }

  const api = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
    as = token,
  ) =>
    ctx.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${as}` },
      ...(payload && { payload }),
    });

  const create = (body: object = {}) =>
    api('POST', '/monitors', { name: 'Example', url: 'https://example.com/health', ...body });

  it('requires authentication', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/monitors' });
    expect(res.statusCode).toBe(401);
  });

  it('creates a monitor with defaults', async () => {
    const res = await create();
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: 'Example',
      method: 'GET',
      intervalSec: 60,
      timeoutMs: 10_000,
      expectedStatus: 200,
      keyword: null,
      isPaused: false,
      lastStatus: 'unknown',
    });
  });

  it.each([
    ['localhost', 'http://127.0.0.1/'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data'],
    ['a name pointing at a private network', 'https://db.internal.test/'],
    ['a non standard port', 'https://example.com:6379/'],
  ])('refuses to monitor %s (SSRF)', async (_label, url) => {
    const res = await create({ url });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'unsafe_target' });
  });

  it('validates interval and timeout', async () => {
    expect((await create({ intervalSec: 10 })).statusCode).toBe(400);
    const tooLong = await create({ intervalSec: 30, timeoutMs: 30_000 });
    expect(tooLong.statusCode).toBe(422);
    expect(tooLong.json()).toMatchObject({ code: 'invalid_timeout' });
  });

  it('lists only my monitors, newest first, with pagination', async () => {
    for (const name of ['first', 'second', 'third']) await create({ name });
    const otherToken = await signUp('other@example.com');
    await api('POST', '/monitors', { name: 'not mine', url: 'https://example.org' }, otherToken);

    const page = await api('GET', '/monitors?limit=2&offset=0');
    expect(page.statusCode).toBe(200);
    const body = page.json<{ items: { name: string }[]; total: number }>();
    expect(body.total).toBe(3);
    expect(body.items.map((m) => m.name)).toEqual(['third', 'second']);

    const next = await api('GET', '/monitors?limit=2&offset=2');
    expect(next.json<{ items: { name: string }[] }>().items.map((m) => m.name)).toEqual(['first']);
  });

  it("hides other users' monitors behind 404", async () => {
    const id = (await create()).json<{ id: string }>().id;
    const otherToken = await signUp('other@example.com');
    for (const [method, url] of [
      ['GET', `/monitors/${id}`],
      ['PATCH', `/monitors/${id}`],
      ['DELETE', `/monitors/${id}`],
      ['POST', `/monitors/${id}/pause`],
    ] as const) {
      const res = await api(
        method,
        url,
        method === 'PATCH' ? { name: 'hacked' } : undefined,
        otherToken,
      );
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect((await api('GET', `/monitors/${id}`)).json()).toMatchObject({ name: 'Example' });
  });

  it('updates only the fields that were sent', async () => {
    const created = (await create({ intervalSec: 120, keyword: 'ok' })).json<{ id: string }>();
    const res = await api('PATCH', `/monitors/${created.id}`, { name: 'Renamed' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Renamed', intervalSec: 120, keyword: 'ok' });
  });

  it('checks a new URL against the SSRF rules on update', async () => {
    const id = (await create()).json<{ id: string }>().id;
    const res = await api('PATCH', `/monitors/${id}`, { url: 'http://10.0.0.1/' });
    expect(res.statusCode).toBe(422);
  });

  it('pauses and resumes', async () => {
    const id = (await create()).json<{ id: string }>().id;
    expect((await api('POST', `/monitors/${id}/pause`)).json()).toMatchObject({ isPaused: true });
    const resumed = await api('POST', `/monitors/${id}/resume`);
    expect(resumed.json()).toMatchObject({ isPaused: false });
  });

  it('deletes a monitor', async () => {
    const id = (await create()).json<{ id: string }>().id;
    expect((await api('DELETE', `/monitors/${id}`)).statusCode).toBe(204);
    expect((await api('GET', `/monitors/${id}`)).statusCode).toBe(404);
  });

  it('returns 400 for an id that is not a UUID', async () => {
    expect((await api('GET', '/monitors/123')).statusCode).toBe(400);
  });

  it('enforces 20 monitors per user, even with parallel requests', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => create({ name: `m${i}` })),
    );
    const statuses = results.map((r) => r.statusCode);
    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
  });
});
