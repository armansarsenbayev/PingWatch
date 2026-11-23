import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetState, type TestContext } from '../helpers.js';

const credentials = { email: 'Arman@Example.com', password: 'correct-horse-battery' };

describe('auth', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await resetState(ctx);
  });

  const register = (body = credentials) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: body });
  const login = (body = credentials) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: body });
  const refresh = (refreshToken: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });

  describe('register', () => {
    it('creates a user, lowercases the email and never returns the hash', async () => {
      const res = await register();
      expect(res.statusCode).toBe(201);
      const { user } = res.json<{ user: Record<string, unknown> }>();
      expect(user.email).toBe('arman@example.com');
      expect(user).not.toHaveProperty('passwordHash');

      const { rows } = await ctx.pool.query<{ password_hash: string }>(
        'select password_hash from users',
      );
      expect(rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
    });

    it('rejects a duplicate email with 409', async () => {
      await register();
      const res = await register({ ...credentials, email: 'arman@example.com' });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'email_taken' });
    });

    it('validates the body and returns problem+json', async () => {
      const res = await register({ email: 'not-an-email', password: 'short' });
      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      const body = res.json<{ code: string; errors: unknown[] }>();
      expect(body.code).toBe('validation_failed');
      expect(body.errors).toHaveLength(2);
    });
  });

  describe('login and /me', () => {
    it('returns a token pair that opens /me', async () => {
      await register();
      const res = await login();
      expect(res.statusCode).toBe(200);
      const tokens = res.json<{ accessToken: string; refreshToken: string; tokenType: string }>();
      expect(tokens.tokenType).toBe('Bearer');

      const me = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ user: { email: 'arman@example.com' } });
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      await register();
      const wrongPassword = await login({ ...credentials, password: 'wrong-password-123' });
      const unknownEmail = await login({ ...credentials, email: 'nobody@example.com' });
      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownEmail.statusCode).toBe(401);
      expect(wrongPassword.json()).toEqual(unknownEmail.json());
    });

    it('rejects /me without a valid token', async () => {
      const noToken = await ctx.app.inject({ method: 'GET', url: '/api/v1/me' });
      const badToken = await ctx.app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: { authorization: 'Bearer not.a.jwt' },
      });
      expect(noToken.statusCode).toBe(401);
      expect(badToken.statusCode).toBe(401);
    });

    it('limits login to 5 attempts per minute', async () => {
      await register();
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await login({ ...credentials, password: 'wrong-password-123' })).statusCode);
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses[5]).toBe(429);
    });
  });

  describe('refresh token rotation', () => {
    it('issues a new pair and makes the old refresh token unusable', async () => {
      await register();
      const first = (await login()).json<{ refreshToken: string }>();

      const rotated = await refresh(first.refreshToken);
      expect(rotated.statusCode).toBe(200);
      const second = rotated.json<{ refreshToken: string }>();
      expect(second.refreshToken).not.toBe(first.refreshToken);

      expect((await refresh(first.refreshToken)).statusCode).toBe(401);
    });

    it('revokes every session when a rotated token is reused', async () => {
      await register();
      const first = (await login()).json<{ refreshToken: string }>();
      const second = (await refresh(first.refreshToken)).json<{ refreshToken: string }>();

      // An attacker replays the stolen first token...
      expect((await refresh(first.refreshToken)).statusCode).toBe(401);
      // ...so the legitimate second token is revoked as well.
      expect((await refresh(second.refreshToken)).statusCode).toBe(401);
    });

    it('rejects an unknown refresh token', async () => {
      expect((await refresh('does-not-exist')).statusCode).toBe(401);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      await register();
      const tokens = (await login()).json<{ refreshToken: string }>();
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: { refreshToken: tokens.refreshToken },
      });
      expect(res.statusCode).toBe(204);
      expect((await refresh(tokens.refreshToken)).statusCode).toBe(401);
    });
  });
});
