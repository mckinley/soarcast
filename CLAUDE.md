# SoarCast — Claude Code Instructions

## Project Overview

SoarCast is a paragliding soaring forecast web app.
Stack: React Router v7 + Cloudflare Workers + Turso/libSQL (Drizzle ORM) + Better Auth + shadcn/ui + Tailwind v4 + Leaflet + D3.

---

## Key Architecture

- **Framework:** React Router v7 with SSR on Cloudflare Workers
- **Auth:** Better Auth with GitHub OAuth (`app/lib/auth.server.ts`)
- **DB:** Turso (libsql/SQLite), Drizzle ORM (`src/db/schema.ts`)
- **DB Access:** Via `getDb(env)` from `app/lib/db.server.ts` — never use the global `src/db/index.ts` on CF Workers
- **Weather:** Open-Meteo API, free, no key needed (`src/lib/weather.ts`) — call `setWeatherDb(db)` before using
- **Scoring:** XC soaring score algorithm (`src/lib/scoring.ts`)
- **Windgram:** D3 SVG chart (`src/components/windgram/windgram-d3.tsx`) — do NOT revert to canvas
- **Maps:** Leaflet via react-leaflet, use `React.lazy` + `Suspense` (no SSR)
- **Email:** Resend API (`src/emails/morning-digest.tsx`)
- **Push notifications:** web-push + VAPID keys (`app/routes/api.notifications.*`)

## CF Workers Patterns

- Environment variables come from `context.cloudflare.env` in loaders/actions, NOT `process.env`
- Database: `const db = getDb(env)` — creates/caches a Turso client per isolate
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

Set via `wrangler secret put <NAME>`:

```
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
BETTER_AUTH_SECRET
AUTH_GITHUB_ID / AUTH_GITHUB_SECRET
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
CRON_SECRET
RESEND_API_KEY (optional)
```
