import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from './errors.js';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: { path: string; message: string }[];
}

const problem = (status: number, title: string, extra: Partial<ProblemDetails> = {}) => ({
  type: 'about:blank',
  title,
  status,
  ...extra,
});

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    void reply.type('application/problem+json');

    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send(
        problem(400, 'Validation failed', {
          code: 'validation_failed',
          errors: error.validation.map((issue) => ({
            path: issue.instancePath || '/',
            message: issue.message ?? 'invalid value',
          })),
        }),
      );
    }

    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send(problem(error.statusCode, error.message, { code: error.code }));
    }

    // Errors from Fastify plugins (rate limit, JWT, body parsing) carry a 4xx statusCode.
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply
        .code(error.statusCode)
        .send(problem(error.statusCode, error.message, { code: error.code?.toLowerCase() }));
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send(problem(500, 'Internal Server Error'));
  });

  app.setNotFoundHandler((request, reply) => {
    void reply
      .code(404)
      .type('application/problem+json')
      .send(problem(404, 'Not Found', { detail: `${request.method} ${request.url}` }));
  });
}
