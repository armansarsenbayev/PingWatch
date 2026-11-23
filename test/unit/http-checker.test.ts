import type { LookupAddress } from 'node:dns';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createGuardedLookup,
  createHttpChecker,
  type CheckTarget,
  type HttpChecker,
} from '../../src/modules/checks/http-checker.js';
import { demoRoutes, startTestServer } from '../test-server.js';

describe('http checker', () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;
  let checker: HttpChecker;

  beforeAll(async () => {
    server = await startTestServer(demoRoutes);
    // The test server lives on 127.0.0.1, so private targets are allowed here.
    checker = createHttpChecker({ resolve: async () => ['127.0.0.1'], allowPrivate: true });
  });
  afterAll(async () => {
    await checker.close();
    await server.close();
  });

  const target = (path: string, extra: Partial<CheckTarget> = {}): CheckTarget => ({
    url: `${server.url}${path}`,
    method: 'GET',
    timeoutMs: 1_000,
    expectedStatus: 200,
    keyword: null,
    ...extra,
  });

  it('reports up with status and latency', async () => {
    const result = await checker.check(target('/ok'));
    expect(result).toMatchObject({ isUp: true, statusCode: 200, error: null });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports down on an unexpected status', async () => {
    const result = await checker.check(target('/error'));
    expect(result).toMatchObject({ isUp: false, statusCode: 500 });
    expect(result.error).toMatch(/expected status 200, got 500/);
  });

  it('accepts a custom expected status', async () => {
    expect((await checker.check(target('/missing', { expectedStatus: 404 }))).isUp).toBe(true);
  });

  it('checks for a keyword in the body', async () => {
    expect((await checker.check(target('/ok', { keyword: 'operational' }))).isUp).toBe(true);
    const missing = await checker.check(target('/ok', { keyword: 'degraded' }));
    expect(missing).toMatchObject({ isUp: false, error: 'keyword not found in response' });
  });

  it('supports HEAD', async () => {
    expect((await checker.check(target('/ok', { method: 'HEAD' }))).isUp).toBe(true);
  });

  it('times out', async () => {
    const result = await checker.check(target('/slow', { timeoutMs: 300 }));
    expect(result).toMatchObject({ isUp: false, error: 'timed out after 300 ms' });
  });

  it('follows redirects', async () => {
    expect((await checker.check(target('/redirect'))).isUp).toBe(true);
  });

  it('stops after too many redirects', async () => {
    const result = await checker.check(target('/loop'));
    expect(result).toMatchObject({ isUp: false, error: 'more than 3 redirects' });
  });

  it('reports a refused connection', async () => {
    const result = await checker.check({ ...target('/ok'), url: 'http://127.0.0.1:1/' });
    expect(result.isUp).toBe(false);
  });

  it('refuses private targets when private targets are not allowed', async () => {
    const strict = createHttpChecker({ resolve: async () => ['127.0.0.1'], allowPrivate: false });
    const result = await strict.check(target('/ok'));
    await strict.close();
    expect(result.isUp).toBe(false);
    expect(result.error).toMatch(/cannot be monitored/);
  });
});

describe('guarded DNS lookup (DNS rebinding protection)', () => {
  const fakeDns = (addresses: LookupAddress[]) =>
    ((_host: string, _opts: unknown, cb: (e: Error | null, a: LookupAddress[]) => void) =>
      cb(null, addresses)) as never;

  const run = (addresses: LookupAddress[]) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown }>((resolve) => {
      createGuardedLookup(fakeDns(addresses))('example.com', {}, (err, address) =>
        resolve({ err, address }),
      );
    });

  it('passes a public address through', async () => {
    const { err, address } = await run([{ address: '93.184.215.14', family: 4 }]);
    expect(err).toBeNull();
    expect(address).toBe('93.184.215.14');
  });

  it('fails the connection when the name now points at a private address', async () => {
    const { err } = await run([{ address: '10.0.0.7', family: 4 }]);
    expect(err?.code).toBe('EBLOCKED');
  });
});
