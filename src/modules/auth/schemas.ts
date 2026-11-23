import { z } from 'zod';

export const credentialsSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8, 'must be at least 8 characters').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.string(),
});

export type Credentials = z.infer<typeof credentialsSchema>;
export type TokenPair = z.infer<typeof tokenPairSchema>;
