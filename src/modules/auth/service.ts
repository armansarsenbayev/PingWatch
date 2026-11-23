import argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { refreshTokens, users, type User } from '../../db/schema.js';
import { errors } from '../../lib/errors.js';
import type { Credentials } from './schemas.js';
import { generateRefreshToken, hashToken } from './tokens.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const UNIQUE_VIOLATION = '23505';

// A real hash of a random password: login with an unknown email still runs argon2.verify,
// so response time does not reveal whether the account exists.
const DUMMY_HASH = await argon2.hash('dummy-password-for-timing');

export interface AuthServiceOptions {
  refreshTokenTtlDays: number;
}

export type PublicUser = Pick<User, 'id' | 'email' | 'createdAt'>;

const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  createdAt: user.createdAt,
});

function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } }).cause;
  return (err as { code?: string }).code === UNIQUE_VIOLATION || cause?.code === UNIQUE_VIOLATION;
}

export function createAuthService(db: Db, options: AuthServiceOptions) {
  async function issueRefreshToken(userId: string): Promise<string> {
    const token = generateRefreshToken();
    await db.insert(refreshTokens).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + options.refreshTokenTtlDays * DAY_MS),
    });
    return token;
  }

  return {
    async register({ email, password }: Credentials): Promise<PublicUser> {
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      try {
        const [user] = await db.insert(users).values({ email, passwordHash }).returning();
        return toPublicUser(user!);
      } catch (err) {
        if (isUniqueViolation(err)) throw errors.emailTaken();
        throw err;
      }
    },

    async login({ email, password }: Credentials) {
      const user = await db.query.users.findFirst({ where: eq(users.email, email) });
      const valid = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, password);
      if (!user || !valid) throw errors.invalidCredentials();
      return { user: toPublicUser(user), refreshToken: await issueRefreshToken(user.id) };
    },

    /**
     * Rotation: every refresh token works once. Presenting a token that was already
     * rotated means it was copied, so every session of that user is revoked.
     */
    async refresh(token: string) {
      const stored = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.tokenHash, hashToken(token)),
      });
      if (!stored) throw errors.invalidToken();

      if (stored.revokedAt) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.userId, stored.userId), isNull(refreshTokens.revokedAt)));
        throw errors.invalidToken();
      }
      if (stored.expiresAt <= new Date()) throw errors.invalidToken();

      // Conditional update: if two requests race with the same token, only one wins.
      const revoked = await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.id, stored.id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      if (revoked.length === 0) throw errors.invalidToken();

      return { userId: stored.userId, refreshToken: await issueRefreshToken(stored.userId) };
    },

    async logout(token: string): Promise<void> {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.tokenHash, hashToken(token)), isNull(refreshTokens.revokedAt)));
    },

    async getUser(id: string): Promise<PublicUser> {
      const user = await db.query.users.findFirst({ where: eq(users.id, id) });
      if (!user) throw errors.unauthorized();
      return toPublicUser(user);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
