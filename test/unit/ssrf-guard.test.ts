import { describe, expect, it } from 'vitest';
import { assertSafeTarget, isBlockedAddress } from '../../src/modules/checks/ssrf-guard.js';

const resolveTo =
  (...addresses: string[]) =>
  async () =>
    addresses;
const policy = (addresses: string[], allowPrivate = false) => ({
  resolve: resolveTo(...addresses),
  allowPrivate,
});

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'fd00::1',
    'fe80::1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['93.184.215.14', '8.8.8.8', '172.32.0.1', '2606:4700::1111'])(
    'allows public %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe('assertSafeTarget', () => {
  const publicIp = ['93.184.215.14'];

  it('accepts a public https URL', async () => {
    await expect(assertSafeTarget('https://example.com/health', policy(publicIp))).resolves.toBe(
      undefined,
    );
  });

  it.each([
    ['ftp://example.com', /http and https/],
    ['http://user:pass@example.com', /credentials/],
    ['http://example.com:6379', /ports/],
    ['http://127.0.0.1/', /private or reserved/],
    ['http://[::1]/', /private or reserved/],
    ['http://169.254.169.254/latest/meta-data', /private or reserved/],
  ])('rejects %s', async (url, message) => {
    await expect(assertSafeTarget(url, policy(publicIp))).rejects.toThrow(message);
  });

  it('rejects a public looking name that resolves to a private address', async () => {
    await expect(
      assertSafeTarget('https://looks-public.example', policy(['10.0.0.5'])),
    ).rejects.toThrow(/private or reserved/);
  });

  it('rejects when any of several resolved addresses is private', async () => {
    await expect(
      assertSafeTarget('https://mixed.example', policy(['93.184.215.14', '127.0.0.1'])),
    ).rejects.toThrow(/private or reserved/);
  });

  it('rejects a name that does not resolve', async () => {
    const failing = {
      resolve: async () => {
        throw new Error('ENOTFOUND');
      },
      allowPrivate: false,
    };
    await expect(assertSafeTarget('https://nope.example', failing)).rejects.toThrow(/resolve/);
  });

  it('allows private targets only when explicitly enabled', async () => {
    await expect(assertSafeTarget('http://127.0.0.1:8080/', policy([], true))).resolves.toBe(
      undefined,
    );
  });
});
