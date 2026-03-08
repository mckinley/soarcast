# SoarCast — Claude Code Instructions

## Project Overview

SoarCast is a paragliding soaring forecast web app.
Stack: Next.js 15 + Turso/libSQL (Drizzle ORM) + shadcn/ui + Tailwind v4 + Leaflet. Deployed on Vercel.

---

## AI Workflow (How We Work)

This project uses **Beads + Ralph** for autonomous AI development. Do not use ad-hoc TODOs or markdown task lists.

### Task Tracking — Beads (`bd`)

All work is tracked in Beads (a Dolt-backed dependency-aware issue tracker).

```bash
bd list                          # See all tasks
bd ready                         # See tasks with no blockers (ready to work on)
bd create "title" -p 1 -t feature --description "..." --json
bd update <id> --status in_progress   # Claim before starting
bd close <id> --reason "Completed"    # Mark done after committing
bd dep add <id> --blocked-by <id>     # Set dependencies
```

The Dolt server must be running: `launchctl start com.beads.dolt-server`

### Running Ralph (autonomous coding agent)

```bash
# Start autonomous loop with Telegram notifications + auto-deploy + smoke tests:
bash scripts/ralph/run-ralph.sh --tool claude --label "Phase name" [max_iterations]

# Raw loop (no notifications, no deploy):
bash scripts/ralph/ralph.sh --tool claude [max_iterations]
```

Ralph reads `scripts/ralph/CLAUDE.md` for its instructions, picks up tasks via `bd ready`, implements one task per iteration, commits, then closes the task in Beads. When all tasks are done, it deploys to Vercel and runs smoke tests, then notifies Bronson via Telegram.

### Typical workflow for new features

1. Create tasks in Beads with clear descriptions and acceptance criteria
2. Set dependencies with `bd dep add` so tasks run in the right order
3. Run `bash scripts/ralph/run-ralph.sh --label "Feature name"`
4. Bronson gets a Telegram notification when done (success or failure)
5. Review the result, iterate if needed

### If you (Claude Code) are acting as Ralph

Read `scripts/ralph/CLAUDE.md` — those are your operating instructions.

---

## Key Architecture

- **Auth:** NextAuth v5 with GitHub + Google OAuth (`src/auth.ts`)
- **DB:** Turso (libsql/SQLite), Drizzle ORM (`src/db/schema.ts`)
- **Weather:** Open-Meteo API, free, no key needed (`src/lib/weather.ts`, `src/lib/weather-profile.ts`)
- **Scoring:** XC soaring score algorithm (`src/lib/scoring.ts`)
- **Windgram:** D3 SVG chart (`src/components/windgram/windgram-d3.tsx`) — do NOT revert to canvas
- **Maps:** Leaflet via react-leaflet, MUST use `next/dynamic` with `ssr: false`
- **Email:** Resend API (`src/emails/morning-digest.tsx`)
- **Push notifications:** web-push + VAPID keys (`src/app/api/notifications/`)
- **Caching:** Next.js `unstable_cache` in API routes + browser-side Map cache in client components

## Quality Commands

```bash
npm run build        # Next.js production build (must pass before committing)
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
npm run test         # Vitest unit tests
```

## Important Patterns

- Leaflet components: `next/dynamic` with `ssr: false`, always
- SQLite JSON columns: `text('field', { mode: 'json' }).$type<T>()`
- All DB tables cascade delete on user removal
- Protected routes via middleware: pages redirect to sign-in, API returns 401
- Drizzle migrations: `npx drizzle-kit generate` then `npx drizzle-kit push`
- D3 windgram renders as SVG — altitude Y-axis is linear in meters (not by pressure level index)

## Environment Variables

```
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
AUTH_SECRET
AUTH_URL=https://soarcast.vercel.app   # Must be set in Vercel
AUTH_GITHUB_ID / AUTH_GITHUB_SECRET
AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
CRON_SECRET
RESEND_API_KEY
```

## Deployment

```bash
vercel --prod --yes                                  # Deploy to production
bash scripts/ralph/smoke-test.sh https://soarcast.vercel.app  # Verify
```
