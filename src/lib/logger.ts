import type { FastifyServerOptions } from 'fastify';
import type { Config } from '../config.js';

/** Paths that must never reach the logs. */
export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'refreshToken',
  '*.refreshToken',
];

export function loggerOptions(config: Config): FastifyServerOptions['logger'] {
  return {
    level: config.LOG_LEVEL,
    redact: { paths: redactPaths, censor: '[REDACTED]' },
    // Human readable logs locally, plain JSON everywhere else.
    ...(config.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    }),
  };
}
