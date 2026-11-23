import type { LoggerOptions } from 'pino';
import type { BaseConfig } from '../config.js';

/** Paths that must never reach the logs. */
export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  '*.password',
  'refreshToken',
  '*.refreshToken',
];

export function loggerOptions(config: BaseConfig): LoggerOptions {
  return {
    level: config.LOG_LEVEL,
    redact: { paths: redactPaths, censor: '[REDACTED]' },
    // Human readable logs locally, plain JSON everywhere else.
    ...(config.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    }),
  };
}
