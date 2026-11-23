import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AuthService } from './service.js';
import { credentialsSchema, refreshSchema, tokenPairSchema, userSchema } from './schemas.js';

export interface AuthRoutesOptions {
  authService: AuthService;
  accessTokenTtl: string;
}

const loginRateLimit = { max: 5, timeWindow: '1 minute' };

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, opts) => {
  const { authService, accessTokenTtl } = opts;

  const tokenPair = (userId: string, refreshToken: string) => ({
    accessToken: app.jwt.sign({ sub: userId }, { expiresIn: accessTokenTtl }),
    refreshToken,
    tokenType: 'Bearer' as const,
    expiresIn: accessTokenTtl,
  });

  app.post(
    '/auth/register',
    {
      config: { rateLimit: loginRateLimit },
      schema: {
        tags: ['auth'],
        body: credentialsSchema,
        response: { 201: z.object({ user: userSchema }) },
      },
    },
    async (request, reply) => {
      const user = await authService.register(request.body);
      return reply.code(201).send({ user: { ...user, createdAt: user.createdAt.toISOString() } });
    },
  );

  app.post(
    '/auth/login',
    {
      config: { rateLimit: loginRateLimit },
      schema: { tags: ['auth'], body: credentialsSchema, response: { 200: tokenPairSchema } },
    },
    async (request) => {
      const { user, refreshToken } = await authService.login(request.body);
      return tokenPair(user.id, refreshToken);
    },
  );

  app.post(
    '/auth/refresh',
    { schema: { tags: ['auth'], body: refreshSchema, response: { 200: tokenPairSchema } } },
    async (request) => {
      const { userId, refreshToken } = await authService.refresh(request.body.refreshToken);
      return tokenPair(userId, refreshToken);
    },
  );

  app.post(
    '/auth/logout',
    { schema: { tags: ['auth'], body: refreshSchema, response: { 204: z.null() } } },
    async (request, reply) => {
      await authService.logout(request.body.refreshToken);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/me',
    {
      onRequest: [app.authenticate],
      schema: { response: { 200: z.object({ user: userSchema }) } },
    },
    async (request) => {
      const user = await authService.getUser(request.user.sub);
      return { user: { ...user, createdAt: user.createdAt.toISOString() } };
    },
  );
};
