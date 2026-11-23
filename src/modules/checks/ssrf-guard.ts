import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { errors } from '../../lib/errors.js';

/** Resolves a host name to IP addresses. Injected so tests do not need real DNS. */
export type Resolver = (hostname: string) => Promise<string[]>;

export const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

export const ALLOWED_PORTS: ReadonlySet<number> = new Set([80, 443, 8080]);

// Addresses a monitor must never reach: loopback, private networks, link-local
// (169.254.169.254 is the cloud metadata service), multicast and reserved ranges.
// Two separate lists on purpose: a BlockList matches IPv4 addresses against IPv6 rules too,
// so the ::ffff:0:0/96 rule would otherwise block every IPv4 address.
const blockedV4 = new BlockList();
const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedV4.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96], // IPv4-mapped addresses, for example ::ffff:127.0.0.1
  ['64:ff9b::', 96], // NAT64, can point at any IPv4 address
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedV6.addSubnet(network, prefix, 'ipv6');
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true; // not an IP at all: refuse rather than guess
  return family === 4 ? blockedV4.check(address, 'ipv4') : blockedV6.check(address, 'ipv6');
}

export interface TargetPolicy {
  resolve: Resolver;
  /** Only for tests and local demos: lets monitors reach localhost, private networks and any port. */
  allowPrivate: boolean;
}

/**
 * Throws if a monitor URL could be used to reach internal infrastructure (SSRF).
 * The check resolves DNS itself, so a public looking name that points at 127.0.0.1
 * is refused too. It runs when a monitor is saved and again before every request.
 */
export async function assertSafeTarget(rawUrl: string, policy: TargetPolicy): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw errors.unsafeTarget('URL is not valid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw errors.unsafeTarget('only http and https URLs are allowed');
  }
  if (url.username || url.password) {
    throw errors.unsafeTarget('credentials inside the URL are not allowed');
  }
  // Development mode (ALLOW_PRIVATE_TARGETS) skips the network rules below.
  if (policy.allowPrivate) return;

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) {
    throw errors.unsafeTarget('only ports 80, 443 and 8080 are allowed');
  }

  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await policy.resolve(host);
    } catch {
      throw errors.unsafeTarget('host name does not resolve');
    }
  }
  if (addresses.length === 0) throw errors.unsafeTarget('host name does not resolve');
  if (addresses.some(isBlockedAddress)) {
    throw errors.unsafeTarget('target resolves to a private or reserved address');
  }
}
