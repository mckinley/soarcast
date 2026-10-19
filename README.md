# SoarCast

A paragliding forecast app: for each launch, whether it will be flyable, when,
and what limits the rest of the day, plus windgrams, favorites and push or
email alerts. Live at https://soarcast.mckinleyaviation.com.

## Stack

Everything runs on Cloudflare.

- React Router v7 with SSR on a Cloudflare Worker (`worker.ts`)
- D1 (SQLite) through Drizzle ORM: schema in `src/db/schema.ts`, migrations in `migrations/`
- Better Auth with GitHub and Google sign-in (`app/lib/auth.server.ts`)
- Cloudflare Email Sending for the morning digest (`EMAIL` binding)
- Forecasts from Open-Meteo; launch sites from pgsites (`PGSITES_API_KEY`)
- The forecast engine in `src/lib/forecast-engine` rates every day

## Development

```bash
npm install
cp .dev.vars.example .dev.vars          # fill in the secrets
npx wrangler d1 migrations apply soarcast --local
npm run dev                             # http://localhost:6712
```

Checks: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.

## Database changes

Edit `src/db/schema.ts`, then `npx drizzle-kit generate --name <change>` to add a
SQL file to `migrations/`. Apply it locally with
`npx wrangler d1 migrations apply soarcast --local`. The deploy workflow applies new
migrations to production before deploying, so keep them additive.

## Deploy

Pushing to `main` deploys: GitHub Actions applies D1 migrations, runs
`wrangler deploy`, then smoke-tests the forecast API, a site page and sign-in.
Secrets are Worker secrets (`npx wrangler secret put <NAME>`); see
`.dev.vars.example` for the list.
