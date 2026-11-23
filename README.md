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

## Development

```bash
npm ci
npm run dev          # API with reload, needs Postgres and Redis (see .env.example)
npm test             # Vitest
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```
