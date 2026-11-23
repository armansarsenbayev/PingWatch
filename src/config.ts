import { z } from 'zod';

// Shared by every process: api, worker and scheduler.
const BaseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  // Never enable in production: lets monitors call localhost and private networks.
  ALLOW_PRIVATE_TARGETS: z.stringbool().default(false),
});

const ApiSchema = BaseSchema.extend({
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, 'use a duration like 15m')
    .default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

const WorkerSchema = BaseSchema.extend({
  CHECK_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(200).default(20),
  SCHEDULER_TICK_MS: z.coerce.number().int().min(1000).max(60_000).default(5000),
});

export type BaseConfig = z.infer<typeof BaseSchema>;
export type Config = z.infer<typeof ApiSchema>;
export type WorkerConfig = z.infer<typeof WorkerSchema>;

function parse<T extends z.ZodType>(schema: T, env: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}

/**
 * Reads and validates configuration from environment variables.
 * Throws on startup if anything required is missing, so the process
 * never runs with a half-valid config or a hardcoded fallback secret.
 */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => parse(ApiSchema, env);

/** Worker and scheduler do not issue tokens, so they do not need JWT_SECRET. */
export const loadWorkerConfig = (env: NodeJS.ProcessEnv = process.env): WorkerConfig =>
  parse(WorkerSchema, env);
