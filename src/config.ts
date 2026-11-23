import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, 'use a duration like 15m')
    .default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  // Never enable in production: lets monitors call localhost and private networks.
  ALLOW_PRIVATE_TARGETS: z.stringbool().default(false),
});

export type Config = z.infer<typeof EnvSchema>;

/**
 * Reads and validates configuration from environment variables.
 * Throws on startup if anything required is missing, so the process
 * never runs with a half-valid config or a hardcoded fallback secret.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
