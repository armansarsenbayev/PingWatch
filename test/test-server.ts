import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** A tiny HTTP server on a random local port, used as a check target in tests. */
export async function startTestServer(handler: Handler) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Routes used by the checker tests. */
export const demoRoutes: Handler = (req, res) => {
  switch (req.url) {
    case '/ok':
      res.writeHead(200, { 'content-type': 'text/plain' }).end('all systems operational');
      return;
    case '/error':
      res.writeHead(500).end('boom');
      return;
    case '/slow':
      setTimeout(() => res.writeHead(200).end('late'), 2_000);
      return;
    case '/redirect':
      res.writeHead(302, { location: '/ok' }).end();
      return;
    case '/loop':
      res.writeHead(302, { location: '/loop' }).end();
      return;
    default:
      res.writeHead(404).end('not found');
  }
};
