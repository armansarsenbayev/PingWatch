import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from '../helpers.js';

describe('health endpoints', () => {
  let ctx: TestContext;
  let failing: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp([{ name: 'postgres', check: async () => {} }]);
    failing = await createTestApp([
      { name: 'postgres', check: async () => {} },
      {
        name: 'redis',
        check: async () => {
          throw new Error('connection refused');
        },
      },
    ]);
  });

  afterAll(async () => {
    await ctx.close();
    await failing.close();
  });

  it('GET /health/live returns ok', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns 200 when every check passes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', checks: { postgres: 'ok' } });
  });

  it('GET /health/ready returns 503 when a check fails', async () => {
    const res = await failing.app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      checks: { postgres: 'ok', redis: 'fail' },
    });
  });

  it('echoes the incoming x-request-id', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('generates a request id when none is sent', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health/live' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns problem+json for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ status: 404, title: 'Not Found' });
  });
});
