# SoarCast — Claude Code Instructions

## Project Overview

SoarCast is a paragliding soaring forecast web app. Next.js 16 + Turso (Drizzle ORM) + shadcn/ui + Leaflet + Tailwind v4. Deployed on Vercel.

## Ralph Integration

When running as a Ralph agent, read instructions from `scripts/ralph/CLAUDE.md`.
PRD is at `scripts/ralph/prd.json`. Progress log at `scripts/ralph/progress.txt`.

## Key Architecture

- **Auth:** NextAuth v5 with GitHub OAuth (`src/auth.ts`)
- **DB:** Turso (libsql/SQLite), Drizzle ORM (`src/db/schema.ts`)
- **Weather:** Open-Meteo API, free, no key needed (`src/lib/weather.ts`)
- **Scoring:** XC soaring score algorithm (`src/lib/scoring.ts`)
- **Maps:** Leaflet via react-leaflet, MUST use dynamic import with ssr:false

## Quality Commands

```bash
npm run build        # Next.js production build
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking
npm run test         # Vitest unit tests (when set up)
npm run test:e2e     # Playwright E2E tests (when set up)
npm run format:check # Prettier check (when set up)
```

## Important Patterns

- Leaflet components must be wrapped in a client component using `next/dynamic` with `ssr: false`
- SQLite JSON columns: `text('field', { mode: 'json' }).$type<T>()`
- All DB tables cascade delete on user removal
- Protected routes via middleware: pages redirect to sign-in, API returns 401
- Drizzle migrations: `npx drizzle-kit generate` then `npx drizzle-kit push`

## Environment Variables

- TURSO_DATABASE_URL
- TURSO_AUTH_TOKEN
- AUTH_SECRET
- AUTH_GITHUB_ID
- AUTH_GITHUB_SECRET
- NEXT_PUBLIC_VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
