# PingWatch

Uptime monitoring service: scheduled HTTP checks, incidents, Telegram alerts and public status pages.

> Work in progress. The full README with architecture, API reference and a demo walkthrough
> comes with the first release.

## Run locally

```bash
cp .env.example .env    # set POSTGRES_PASSWORD
docker compose up --build
curl http://localhost:3000/health/live
```

## API so far

Interactive docs: http://localhost:3000/docs (generated from the request schemas).

| Endpoint                                                | What it does                                          |
| ------------------------------------------------------- | ----------------------------------------------------- |
| `POST /api/v1/auth/register`, `POST /api/v1/auth/login` | Create an account, get an access and a refresh token  |
| `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout` | Rotate or revoke a refresh token                      |
| `GET /api/v1/me`                                        | Current user                                          |
| `GET /api/v1/monitors`, `POST /api/v1/monitors`         | List (paginated) and create monitors, max 20 per user |
| `GET`, `PATCH`, `DELETE /api/v1/monitors/:id`           | Read, update, delete one monitor                      |
| `POST /api/v1/monitors/:id/pause`, `/resume`            | Stop and restart checks                               |
| `GET /health/live`, `GET /health/ready`                 | Liveness and readiness probes                         |

Monitor URLs are checked against SSRF: only http and https on ports 80, 443 and 8080,
and the host must not resolve to a private, loopback, link-local or reserved address.

## Development

```bash
npm ci
npm run dev          # API with reload, needs Postgres and Redis (see .env.example)
npm test             # Vitest: unit tests and integration tests (Testcontainers)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```
