# SoarCast — Claude Code Instructions

## Project Overview

SoarCast is a paragliding soaring forecast web app.
Stack: React Router v7 + Cloudflare Workers + D1 (Drizzle ORM) + Better Auth + shadcn/ui + Tailwind v4 + Leaflet + D3.
Everything runs on Cloudflare; don't add infrastructure outside it.

---

## Key Architecture

Short notes here. The long notes on each feature are in `docs/agents/`: open the file named in a pointer before you change that feature.

- **Framework:** React Router v7 with SSR on Cloudflare Workers
- **Auth:** Better Auth with GitHub and Google OAuth (`app/lib/auth.server.ts`). Sign-in is `/login`. Details: `docs/agents/ops.md`.
- **Admin:** `user.role` is `'user'` or `'admin'` (`src/lib/admin.ts`). `/admin` and every loader and action under it call `requireAdmin`. Details: `docs/agents/ops.md`.
- **DB:** Cloudflare D1 (`DB` binding, database `soarcast`), Drizzle ORM (`src/db/schema.ts`, Better Auth tables in `src/db/auth-schema.ts`). App tables reference Better Auth's `user.id`.
- **DB Access:** Via `getDb(env)` from `app/lib/db.server.ts`. D1 has no interactive transactions (use `db.batch`), at most 100 bound parameters per query, and can't bind a `Date` (use Drizzle `timestamp`/`timestamp_ms` columns).
- **Migrations:** `npx drizzle-kit generate --name <change>` writes `migrations/NNNN_*.sql`; the deploy workflow runs `wrangler d1 migrations apply soarcast --remote` before deploying, so keep migrations additive. Locally: `npx wrangler d1 migrations apply soarcast --local`.
- **Copy:** name pages, nav items, card titles and labels neutrally (Planning, This week, Favorites, Private site), never "Your …" or "My …". All text pilots read (screens, emails, alerts, the Guide) follows the writing rules in `src/guide/README.md`.
- **Guide:** `/guide` explains SoarCast to pilots. Pages are Markdown in `src/guide/pages/` with front matter (title, summary, order, `covers`: the code each page describes), rendered by `app/lib/guide.server.ts`. A number the code decides is a `{{name}}` placeholder from `src/guide/facts.ts`, which imports the code's own constant. `src/guide/__tests__/guide.test.ts` checks the rules a machine can (dashes, semicolons, sentence length, internal words, facts, covers).
- **Windgram:** D3 SVG chart (`src/components/windgram/windgram-d3.tsx`) — do NOT revert to canvas
- **Maps:** Leaflet via react-leaflet, use `React.lazy` + `Suspense` (no SSR). Layers are one panel, `MapLayers`. Details: `docs/agents/site-pages.md`.
- **Email:** Cloudflare Email Sending through the `EMAIL` `send_email` binding (`src/emails/send.ts`, template `src/emails/morning-digest.tsx`), from `soarcast@mckinleyaviation.com`. No API key. Local dev simulates sends (the binding has no `remote = true`).
- **Push notifications:** VAPID keys; send with `sendPush` (`src/lib/push-send.ts`). Never call web-push's `sendNotification`: it uses node:https, which Workers don't implement.

### Rules that always hold

- Everything runs on Cloudflare. Background jobs run on Cloudflare (the `soarcast-jobs` Worker), never on GitHub.
- Keep `user.role` a Better Auth additional field with `input: false`, or any pilot could make themselves an admin.
- Every loader and action under `/admin` calls `requireAdmin` itself.
- The repo is public: never print a pilot's email in a log or workflow.
- Never use UTC `toISOString()` for "today". Use `profileToday(profile)`.
- `src/lib/forecast-engine` is the only place a day is rated. Bump `ENGINE_VERSION` when a change re-rates past days.
- Screens show Go / Flyable / Marginal / Not flyable, never the 0-100 score.
- OGN: never keep a position or show who flies (no name, registration or competition number). Credit OGN (ODbL).
- NOGA: never show or store a pilot or a flight link. Credit NOGA and XContest.
- Leave Holfuy stations out of Wind now. Link comp pages, never fetch them.
- Wind now, Flying now, track record, comps, seasons, cross-country flights, flown days, experiments and map layers never change a verdict.
- Outside data (wind now, comps, flown days) never fails a page.
- `custom_sites` are private to their owner: load them with `findOwnedCustomSite`.
- Keep migrations additive.
- The flown-days and up-now answer shapes match Syncing Pilots' `app/lib/flown-days.ts` and `app/lib/up-now.ts`: change both together.
- Change the make-admin script and workflow in pjmgmt, not here.
- Never call web-push's `sendNotification`. Use `sendPush`.
- Do NOT revert the windgram to canvas.

### Where the feature notes are

- `docs/agents/ops.md`: Auth (full), Admin (full), Alerts, Health, pgsites calls, Speed.
- `docs/agents/data-and-jobs.md`: Where it runs, Weather, Rating, Model verification, Seasons, Cross-country flights (NOGA), Background jobs, Flown days and Up now.
- `docs/agents/site-pages.md`: Flying now (OGN), Wind now, Track record, Goals, Your own sites, Areas, Comps, Experiments, Maps (full).

## Keep the Guide right (every change)

Before finishing any change, run `npm run guide:check` and decide whether the Guide needs a page added, changed or removed. Read each page it lists in full, and think about pages it doesn't list. Most changes need no Guide edit, but the check is required, and the commit message says what you decided about the Guide. Write by `src/guide/README.md`: the reader is a pilot who knows nothing about how SoarCast is built or any conversation behind it.

## CF Workers Patterns

- Environment variables come from `context.cloudflare.env` in loaders/actions, NOT `process.env`
- Database: `const db = getDb(env)` — wraps the D1 binding in Drizzle, cached per isolate
- Auth: `const session = await requireAuth(request, env)` or `getSession(request, env)`; admin pages and their actions use `requireAdmin`
- Profile functions need `setProfileDb(db)` called before use in each loader/action
- Routes at `app/routes/` use RR7 flat file convention
- API routes are resource routes (no default export, just loader/action)
- Protected routes are children of `_auth.tsx` layout

## Quality Commands

```bash
npm run build        # RR7 production build
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
npm run test         # Vitest unit tests
npm run guide:check  # Guide pages that cover the files this branch changes
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
HEALTH_ALERT_TO   (optional: where health-check failures are emailed)
OPENAIP_API_KEY   (optional: the map's Airspace layer)
```

Email needs no secret: the `EMAIL` binding in `wrangler.toml` sends through Cloudflare Email Sending, and `mckinleyaviation.com` must be onboarded there.
