/**
 * An error that is safe to show to the client.
 * The error handler turns it into an RFC 9457 problem details response.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  emailTaken: () => new AppError(409, 'email_taken', 'An account with this email already exists'),
  invalidCredentials: () => new AppError(401, 'invalid_credentials', 'Email or password is wrong'),
  invalidToken: () => new AppError(401, 'invalid_token', 'Token is invalid or expired'),
  unauthorized: () => new AppError(401, 'unauthorized', 'Authentication is required'),
  notFound: (what: string) => new AppError(404, 'not_found', `${what} not found`),
  unsafeTarget: (reason: string) =>
    new AppError(422, 'unsafe_target', `This URL cannot be monitored: ${reason}`),
  monitorLimitReached: (limit: number) =>
    new AppError(409, 'monitor_limit_reached', `You can have at most ${limit} monitors`),
  invalidTimeout: () =>
    new AppError(422, 'invalid_timeout', 'timeoutMs must be shorter than the check interval'),
};
