# SoarCast — Claude Code Instructions

## Project Overview

SoarCast is a paragliding soaring forecast web app.
Stack: React Router v7 + Cloudflare Workers + D1 (Drizzle ORM) + Better Auth + shadcn/ui + Tailwind v4 + Leaflet + D3.
Everything runs on Cloudflare; don't add infrastructure outside it.

---

## Key Architecture

- **Framework:** React Router v7 with SSR on Cloudflare Workers
- **Auth:** Better Auth with GitHub and Google OAuth (`app/lib/auth.server.ts`). Better Auth is imported on first use (`createAuth` returns a promise), so a visitor with no session cookie never loads it. `getSession` looks the session up once per request, keyed by the env object `worker.ts` makes for each request, so call it freely from any loader. The header reads the user from the root loader, never `authClient.useSession()`.
- **DB:** Cloudflare D1 (`DB` binding, database `soarcast`), Drizzle ORM (`src/db/schema.ts`, Better Auth tables in `src/db/auth-schema.ts`). App tables reference Better Auth's `user.id`.
- **Where it runs:** D1's primary is in eastern North America (ENAM) with no read replicas, so `[placement] region = "aws:us-east-1"` in `wrangler.toml` runs page requests next to it (the `cf-placement` response header says where). Files under `[assets]` still come from the nearest location, and the cron is not moved.
- **DB Access:** Via `getDb(env)` from `app/lib/db.server.ts`. D1 has no interactive transactions (use `db.batch`), at most 100 bound parameters per query, and can't bind a `Date` (use Drizzle `timestamp`/`timestamp_ms` columns).
- **Migrations:** `npx drizzle-kit generate --name <change>` writes `migrations/NNNN_*.sql`; the deploy workflow runs `wrangler d1 migrations apply soarcast --remote` before deploying, so keep migrations additive. Locally: `npx wrangler d1 migrations apply soarcast --local`.
- **Weather:** Open-Meteo API, free, no key needed. `getAtmosphericProfile` (`src/lib/weather-profile.ts`) is the one forecast fetch: it always fetches and caches 7 days per place (a 7-day call costs Open-Meteo quota the same as 1 day), returns them from the place's local today, and retries once on 429. It serves the place's newest cached copy, whatever its UTC fetch date. The hourly cron first refreshes saved sites' forecasts before they expire (`/api/forecasts/refresh`, `app/lib/forecast-refresh.server.ts`, at most 60 places a run) and deletes copies over two days old. Call `setProfileDb(db)` before using it. `profileToday(profile)` is the site's local date; never use UTC `toISOString()` for "today".
- **Rating:** `src/lib/forecast-engine` is the only place a day is rated (gates, window, quality, hazards), and it also says what flight the window gives (`flight`: sled, ridge, thermal, xc) and whether the day meets the pilot's goal (`goalMet`). Model rain only counts where it has proved right: in the tropics (`rainTrust` in `gates.ts`) only heavy showers count, and `rainNote` says what was set aside. Storms count only with showers within `RAIN_SOON_HOURS` (`stormGate`; plain unstable air passes and `stormNote` says so). Bump `ENGINE_VERSION` (`forecast-engine/index.ts`) when a change re-rates past days: the season build then rebuilds every season.
- **Model verification:** `scripts/verify/` and the "Model verification pull" workflow pull day-ahead forecasts from many models at airports (Open-Meteo Previous Runs API) to score against METARs; results land on `refs/model-verify/latest`. It runs on GitHub because Open-Meteo rate-limits Claude's sandbox.
- **Track record:** site pages show how the day-before forecast did at the nearest airport over the last year (`ForecastTrackRecord`, `/api/track-record`). `src/lib/track-record.ts` scores it and rates rain and wind Good/Fair/Poor; `app/lib/track-record.server.ts` finds the airport (aviationweather.gov station list, within 60 km), pulls Open-Meteo Previous Runs and the IEM METAR archive, and keeps each airport's record in D1 for a month.
- **Goals:** every site has a kind (thermal, ridge, both, sled; from Paragliding Earth's `is_thermal`/`is_soaring`/`is_xc` tags, or the pilot's own `site_kind`) and a goal (`launch` safe launch is enough, `soar`, `great`; `src/lib/site-goals.ts`). Screens show Go / Flyable / Marginal / Not flyable from `src/lib/verdict-display.ts`, never the 0-100 score, and alerts fire only on days that are a go. Listed sites become a `Site` through `launchSiteToSite` (`src/lib/launch-sites.ts`); `refreshLaunchSites` re-copies stale ones from pgsites.
- **Your own sites:** `custom_sites` are private to their owner: load them with `findOwnedCustomSite` (`app/lib/custom-sites.server.ts`) and turn them into a `Site` with `customSiteToSite` (`src/lib/custom-sites.ts`), so pages and alerts rate them through the same engine. Add/edit pages are `/sites/custom/new` and `/sites/custom/:id/edit`. `/api/terrain` gives the form the launch elevation, a launch direction suggested from the slopes around the pin (`src/lib/terrain.ts`, Open-Meteo elevation API) and listed sites nearby.
- **Areas:** saved sites (favorites and private sites) are grouped into the pilot's own areas (`site_areas`, `area_id` on `user_favorite_sites` and `custom_sites`; `src/lib/site-areas.ts`, `app/lib/site-areas.server.ts`). `syncAreas` runs in the loaders that list saved sites: a site with no area joins the nearest saved site's area within `AREA_JOIN_KM` (150 km) or starts one, and empty areas go. The dashboard shows one area (`?area=<id>`, or `all` for one row per area, a day is a go when any site is), by default the one nearest the request (`context.cloudflare.cf`, passed in by `worker.ts`), and loads only that area's forecasts. Settings renames, moves, joins and mutes areas; alerts skip muted areas. Planning's "Save this area" follows a flying area's launches into an area of the same name.
- **Comps:** pgsites collects FAI's paragliding calendar (CIVL Cat 1 and 2) plus World Cup rounds and serves `/api/comps` and `/api/comps/near` (`getComps`, `compsNear` in `src/lib/pgsites-client.ts`). `app/lib/comps.server.ts` fetches them and never fails a page over them; `src/lib/comps.ts` has the dates, levels and regions. A comp within 25 km (`COMP_RADIUS_KM`) is held at a site: the site page shows a line on the day card and a "Comps here" card with its history, the dashboard marks comp days with a trophy, and `/planning` lists comps worldwide for the chosen months. Comps never change a verdict. Comp pages on Airtribune, CIVL Comps and PWCA are linked, never fetched.
- **Seasons:** the "Season build" workflow (`scripts/seasons/build.ts`, twice a day on GitHub because Open-Meteo rate-limits Claude's sandbox) rates every day of the last 24 whole months through the forecast engine on Open-Meteo's Historical Forecast API, for every followed site, every custom site and the travel launches in `src/lib/destinations.ts` (`AREAS`: our own hand-picked flying areas such as Southern Spain or Cauca Valley, each a few launches within `AREA_RADIUS_KM` (100 km) of its middle, a rule `destinations.test.ts` checks; each launch is rated at the listed site it finds in pgsites). It writes the days compactly to `site_seasons` (`src/lib/seasons.ts`: encoding, months, best months, typical week), keyed by site and launch settings but not the goal, so the goal is applied when reading (`app/lib/seasons.server.ts`). Each run spends a call budget (about 240 calls a site) and the next run carries on. Site pages show a Season card and a "this week against a typical week" line; `/planning` (old `/year` links redirect) has Where to fly (areas or countries ranked, where a day is a go when any of the area's launches was, `anyGoShares`; `?area=`/`?country=` opens one for its launches; a world map, `src/components/planning-map.tsx`, shows every area colored by the window, rated or not), Favorites (followed and private sites) and Comps, for any start month up to five years out and a window of a month to two years: one month reads as a ranked list, longer windows as a month-by-month grid. Season data never changes a verdict. Our own analysis only: NOGA's data isn't licensed, so it's linked at most. Note pgsites `sites.country_code` is uppercase and comps' is lowercase.
- **Flown days:** Syncing Pilots (github.com/mckinley/syncing-pilots, live inReach/SPOT tracking, same Cloudflare account) says how many pilots flew from a launch each local day, by kind (sled, soared, xc). SoarCast calls its `FlownDaysApi` over the `SYNCING_PILOTS` service binding (`[[services]]` in `wrangler.toml`, no URL or key; missing in local dev). `flownDaysAt` (`app/lib/flown-days.server.ts`) asks for the start of the month two years back to today, keeps it in the `flown_days` table and refetches after `FLOWN_REFRESH_HOURS`; it never fails a page. `src/lib/flown-days.ts` checks the days against a site's season (`checkAgainstFlown`) and shares them by month. Site pages stream it in (a loader promise behind `<Await>`): the "Flown here" card (`src/components/flown-here.tsx`) and a Flown column on the Season card. `/api/flown-days?site=<pgsites id>` gives the same check for every goal, for checking the engine across sites. Flown days never change a verdict. The shape of the answer is Syncing Pilots' `app/lib/flown-days.ts`: change both together. The "Flown-day check" workflow (`scripts/seasons/flown-check.ts`, started by hand) re-rates the last two years at launches with 10+ flown days and prints how the ratings did and what the engine saw on days below Go, as counts only (public log). A run on main saves its ratings as the baseline; a run on a branch compares an engine change with it day by day (days moved up to Go or down, each weighed against the launch's Go days in the same month). Archived forecasts stay in the Actions cache, so a re-run spends no Open-Meteo calls.
- **Copy:** name pages, nav items, card titles and labels neutrally (Planning, This week, Favorites, Private site), never "Your …" or "My …". All text pilots read (screens, emails, alerts, the Guide) follows the writing rules in `src/guide/README.md`.
- **Guide:** `/guide` explains SoarCast to pilots. Pages are Markdown in `src/guide/pages/` with front matter (title, summary, order, `covers`: the code each page describes), rendered by `app/lib/guide.server.ts`. A number the code decides is a `{{name}}` placeholder from `src/guide/facts.ts`, which imports the code's own constant. `src/guide/__tests__/guide.test.ts` checks the rules a machine can (dashes, semicolons, sentence length, internal words, facts, covers).
- **Windgram:** D3 SVG chart (`src/components/windgram/windgram-d3.tsx`) — do NOT revert to canvas
- **Maps:** Leaflet via react-leaflet, use `React.lazy` + `Suspense` (no SSR)
- **Email:** Cloudflare Email Sending through the `EMAIL` `send_email` binding (`src/emails/send.ts`, template `src/emails/morning-digest.tsx`), from `soarcast@mckinleyaviation.com`. No API key. Local dev simulates sends (the binding has no `remote = true`).
- **Alerts:** an hourly Cron Trigger (`[triggers]` in `wrangler.toml`) runs `worker.ts` `scheduled`, which posts to `/api/notifications/check`. Each user's morning run (digest) is at their digest hour and the evening run at 18:00, in their `settings.timeZone` (`src/lib/alert-schedule.ts`). `?run=morning|evening` with the `CRON_SECRET` bearer forces a run for everyone.
- **Health:** after the alerts run, the cron calls `/api/health` (CRON_SECRET bearer): D1 write, Open-Meteo forecast, pgsites search and daily sync age, last alerts run. It emails the `HEALTH_ALERT_TO` secret when the result changes (failing or recovered) and throws, so the cron shows as failed in Cloudflare. State is in the `app_state` table.
- **pgsites calls** go through `fetchApi` in `src/lib/pgsites-client.ts`, which reuses answers from the Worker's edge cache for `PGSITES_CACHE_SECONDS` (6 h; a pgsites call can take a second when its Worker starts fresh). Pass `{ fresh: true }` where a live answer matters (the health check, `getSyncStatus`).
- **Speed:** every response carries a `Server-Timing` header (total, `cold` for a fresh Worker start, D1 queries, calls to Open-Meteo, pgsites and other hosts), and each page or `.data` load keeps a row in `request_timings` (page pattern such as `/sites/:slug`, never which site; newest 2000). `src/lib/request-timing.ts`, wired in `worker.ts`. The "Perf probe" workflow prints them with the D1 region and Open-Meteo timing.
- **Push notifications:** VAPID keys; send with `sendPush` (`src/lib/push-send.ts`). Never call web-push's `sendNotification`: it uses node:https, which Workers don't implement.

## Keep the Guide right (every change)

Before finishing any change, run `npm run guide:check` and decide whether the Guide needs a page added, changed or removed. Read each page it lists in full, and think about pages it doesn't list. Most changes need no Guide edit, but the check is required, and the pull request's Guide section says what you decided. Write by `src/guide/README.md`: the reader is a pilot who knows nothing about how SoarCast is built or any conversation behind it.

## CF Workers Patterns

- Environment variables come from `context.cloudflare.env` in loaders/actions, NOT `process.env`
- Database: `const db = getDb(env)` — wraps the D1 binding in Drizzle, cached per isolate
- Auth: `const session = await requireAuth(request, env)` or `getSession(request, env)`
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
```

Email needs no secret: the `EMAIL` binding in `wrangler.toml` sends through Cloudflare Email Sending, and `mckinleyaviation.com` must be onboarded there.
