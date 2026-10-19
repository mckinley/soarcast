# SoarCast — Claude Code Instructions

## Project Overview

SoarCast is a paragliding soaring forecast web app.
Stack: React Router v7 + Cloudflare Workers + D1 (Drizzle ORM) + Better Auth + shadcn/ui + Tailwind v4 + Leaflet + D3.
Everything runs on Cloudflare; don't add infrastructure outside it.

---

## Key Architecture

- **Framework:** React Router v7 with SSR on Cloudflare Workers
- **Auth:** Better Auth with GitHub and Google OAuth (`app/lib/auth.server.ts`)
- **DB:** Cloudflare D1 (`DB` binding, database `soarcast`), Drizzle ORM (`src/db/schema.ts`, Better Auth tables in `src/db/auth-schema.ts`). App tables reference Better Auth's `user.id`.
- **DB Access:** Via `getDb(env)` from `app/lib/db.server.ts`. D1 has no interactive transactions (use `db.batch`), at most 100 bound parameters per query, and can't bind a `Date` (use Drizzle `timestamp`/`timestamp_ms` columns).
- **Migrations:** `npx drizzle-kit generate --name <change>` writes `migrations/NNNN_*.sql`; the deploy workflow runs `wrangler d1 migrations apply soarcast --remote` before deploying, so keep migrations additive. Locally: `npx wrangler d1 migrations apply soarcast --local`.
- **Weather:** Open-Meteo API, free, no key needed (`src/lib/weather.ts`) — call `setWeatherDb(db)` before using
- **Rating:** `src/lib/forecast-engine` is the only place a day is rated (gates, window, quality, hazards)
- **Windgram:** D3 SVG chart (`src/components/windgram/windgram-d3.tsx`) — do NOT revert to canvas
- **Maps:** Leaflet via react-leaflet, use `React.lazy` + `Suspense` (no SSR)
- **Email:** Cloudflare Email Sending through the `EMAIL` `send_email` binding (`src/emails/send.ts`, template `src/emails/morning-digest.tsx`), from `soarcast@mckinleyaviation.com`. No API key. Local dev simulates sends (the binding has no `remote = true`).
- **Alerts:** an hourly Cron Trigger (`[triggers]` in `wrangler.toml`) runs `worker.ts` `scheduled`, which posts to `/api/notifications/check`. Each user's morning run (digest) is at their digest hour and the evening run at 18:00, in their `settings.timeZone` (`src/lib/alert-schedule.ts`). `?run=morning|evening` with the `CRON_SECRET` bearer forces a run for everyone.
- **Push notifications:** VAPID keys; send with `sendPush` (`src/lib/push-send.ts`). Never call web-push's `sendNotification`: it uses node:https, which Workers don't implement.

## CF Workers Patterns

- Environment variables come from `context.cloudflare.env` in loaders/actions, NOT `process.env`
- Database: `const db = getDb(env)` — wraps the D1 binding in Drizzle, cached per isolate
- Auth: `const session = await requireAuth(request, env)` or `getSession(request, env)`
- Weather functions need `setWeatherDb(db)` called before use in each loader/action
- Routes at `app/routes/` use RR7 flat file convention
- API routes are resource routes (no default export, just loader/action)
- Protected routes are children of `_auth.tsx` layout

## Quality Commands

```bash
npm run build        # RR7 production build
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
npm run test         # Vitest unit tests
```

## Deployment

```bash
npm run build
CLOUDFLARE_ACCOUNT_ID=7c0ef4ee4d820ffe791557c534882957 npx wrangler deploy
```

Or push to main — GitHub Actions auto-deploys.

## Environment Variables

Set via `wrangler secret put <NAME>` (local dev: `.dev.vars`, see `.dev.vars.example`):

```
BETTER_AUTH_SECRET
AUTH_GITHUB_ID / AUTH_GITHUB_SECRET
AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
CRON_SECRET
PGSITES_API_KEY
```

Email needs no secret: the `EMAIL` binding in `wrangler.toml` sends through Cloudflare Email Sending, and `mckinleyaviation.com` must be onboarded there.
