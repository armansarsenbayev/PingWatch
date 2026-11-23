import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { testConfig } from '../helpers.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('health endpoints', () => {
  it('GET /health/live returns ok', async () => {
    app = await buildApp(testConfig);
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready returns 200 when every check passes', async () => {
    app = await buildApp(testConfig, {
      readinessChecks: [{ name: 'postgres', check: async () => {} }],
    });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', checks: { postgres: 'ok' } });
  });

  it('GET /health/ready returns 503 when a check fails', async () => {
    app = await buildApp(testConfig, {
      readinessChecks: [
        { name: 'postgres', check: async () => {} },
        {
          name: 'redis',
          check: async () => {
            throw new Error('connection refused');
          },
        },
      ],
    });
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'unavailable',
      checks: { postgres: 'ok', redis: 'fail' },
    });
  });

  it('echoes the incoming x-request-id', async () => {
    app = await buildApp(testConfig);
    const res = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('generates a request id when none is sent', async () => {
    app = await buildApp(testConfig);
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
