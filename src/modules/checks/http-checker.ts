import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { Agent, request } from 'undici';
import { AppError } from '../../lib/errors.js';
import { assertSafeTarget, isBlockedAddress, type TargetPolicy } from './ssrf-guard.js';

export const MAX_REDIRECTS = 3;
export const MAX_BODY_BYTES = 1024 * 1024;
const USER_AGENT = 'PingWatch/0.1 (+https://github.com/armansarsenbayev)';

export interface CheckTarget {
  url: string;
  method: 'GET' | 'HEAD';
  timeoutMs: number;
  expectedStatus: number;
  keyword: string | null;
}

export interface CheckResult {
  isUp: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  error: string | null;
}

type DnsLookup = typeof dnsLookup;

/**
 * A DNS lookup for outgoing sockets that refuses private addresses.
 * Checking the URL once when the monitor is saved is not enough: the owner of the
 * domain can later point it at 127.0.0.1 (DNS rebinding). This runs on every connection.
 */
export function createGuardedLookup(resolve: DnsLookup = dnsLookup): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
      if (err) return callback(err, '', 0);
      const blocked = addresses.find((a) => isBlockedAddress(a.address));
      if (blocked || addresses.length === 0) {
        const error = Object.assign(new Error(`blocked address for ${hostname}`), {
          code: 'EBLOCKED',
        });
        return callback(error, '', 0);
      }
      if (options.all) return callback(null, addresses, 0);
      const first = addresses[0]!;
      return callback(null, first.address, first.family);
    });
  };
}

export interface HttpCheckerOptions extends TargetPolicy {
  /** Override the socket level DNS lookup (tests). */
  lookup?: LookupFunction;
}

export function createHttpChecker(options: HttpCheckerOptions) {
  const dispatcher = new Agent({
    connect: options.allowPrivate ? {} : { lookup: options.lookup ?? createGuardedLookup() },
    keepAliveTimeout: 1_000,
  });

  async function readBody(body: AsyncIterable<Buffer>): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of body) {
      size += chunk.length;
      chunks.push(chunk);
      if (size >= MAX_BODY_BYTES) break; // enough to search for a keyword
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  async function check(target: CheckTarget): Promise<CheckResult> {
    const started = performance.now();
    const signal = AbortSignal.timeout(target.timeoutMs);
    let url = target.url;

    try {
      // Redirects are followed by hand so that every hop passes the SSRF check.
      for (let hop = 0; ; hop++) {
        await assertSafeTarget(url, options);
        const res = await request(url, {
          method: target.method,
          dispatcher,
          signal,
          headers: { 'user-agent': USER_AGENT, accept: '*/*' },
          headersTimeout: target.timeoutMs,
          bodyTimeout: target.timeoutMs,
        });

        const location = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && typeof location === 'string') {
          await res.body.dump();
          if (hop >= MAX_REDIRECTS) {
            return fail(started, res.statusCode, `more than ${MAX_REDIRECTS} redirects`);
          }
          url = new URL(location, url).toString();
          continue;
        }

        const needsBody = target.keyword !== null && target.method === 'GET';
        const body = needsBody ? await readBody(res.body) : (await res.body.dump(), '');
        const latencyMs = Math.round(performance.now() - started);

        if (res.statusCode !== target.expectedStatus) {
          return {
            isUp: false,
            statusCode: res.statusCode,
            latencyMs,
            error: `expected status ${target.expectedStatus}, got ${res.statusCode}`,
          };
        }
        if (needsBody && !body.includes(target.keyword!)) {
          return {
            isUp: false,
            statusCode: res.statusCode,
            latencyMs,
            error: 'keyword not found in response',
          };
        }
        return { isUp: true, statusCode: res.statusCode, latencyMs, error: null };
      }
    } catch (err) {
      return fail(started, null, describeError(err, target.timeoutMs));
    }
  }

  return { check, close: () => dispatcher.close() };
}

function fail(started: number, statusCode: number | null, error: string): CheckResult {
  return { isUp: false, statusCode, latencyMs: Math.round(performance.now() - started), error };
}

function describeError(err: unknown, timeoutMs: number): string {
  if (err instanceof AppError) return err.message;
  const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string } };
  const code = e.code ?? e.cause?.code;
  if (
    e.name === 'TimeoutError' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT'
  ) {
    return `timed out after ${timeoutMs} ms`;
  }
  if (code === 'EBLOCKED') return 'target resolved to a private or reserved address';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS lookup failed';
  if (code === 'ECONNREFUSED') return 'connection refused';
  if (code === 'ECONNRESET') return 'connection reset';
  return e.message ?? 'request failed';
}

export type HttpChecker = ReturnType<typeof createHttpChecker>;
