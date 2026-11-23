import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL safe. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is stored in the database. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
