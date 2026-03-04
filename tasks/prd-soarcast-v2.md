# PRD: SoarCast v2 — Production-Ready Paragliding XC Weather Monitor

## Introduction

SoarCast v2 upgrades from a JSON-file prototype to a production-ready multi-user app. It replaces the filesystem storage with Turso (SQLite over HTTP), adds authentication via NextAuth, fixes scoring bugs, adds winds aloft data, a map-based site picker, and real Web Push notifications. Deployable on Vercel at zero cost.

## Goals

- Multi-user app with social auth (Google/GitHub)
- Zero-cost deployment (Vercel + Turso free tiers)
- Fix known v1 bugs (wind direction averaging, race conditions)
- Enhanced scoring with upper-air weather data
- Map-based site discovery for pilots worldwide
- Real push notifications for good flying days
- PWA support for mobile pilots

## Tech Stack

- Next.js 15 (App Router)
- TypeScript (strict mode)
- Tailwind CSS v4 + shadcn/ui
- **Turso** (libSQL) + **Drizzle ORM**
- **NextAuth.js v5** (Auth.js) with Google + GitHub providers
- **Leaflet** + OpenStreetMap for maps
- **Web Push API** for notifications
- Open-Meteo API (weather data)
- Vercel (deploy + cron)

## User Stories

### US-001: Turso + Drizzle Database Setup
**Description:** As a developer, I want to replace JSON file storage with Turso and Drizzle ORM so the app works on serverless platforms.
**Acceptance Criteria:**
- Install `@libsql/client` and `drizzle-orm` + `drizzle-kit`
- Create Drizzle schema in `src/db/schema.ts` with tables: users, accounts, sessions, sites, forecasts_cache, settings, push_subscriptions
- Sites table: id, userId, name, latitude, longitude, elevation, idealWindDirections (JSON), maxWindSpeed, notes, createdAt, updatedAt
- Forecasts cache table: id, siteId, fetchDate, data (JSON), fetchedAt, expiresAt
- Settings table: id, userId, minScoreThreshold (default 70), daysAhead (default 2), updatedAt
- Push subscriptions table: id, userId, endpoint, keys (JSON), createdAt
- Create `src/db/index.ts` that initializes the Turso client using env vars (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
- Add `drizzle.config.ts` for migrations
- Generate and apply initial migration
- Remove old `src/lib/storage.ts` and `data/` directory references
- Add `.env.example` with required env vars
- Typecheck passes

### US-002: NextAuth Authentication
**Description:** As a user, I want to sign in with Google or GitHub so my sites and settings are saved to my account.
**Acceptance Criteria:**
- Install `next-auth@beta` (Auth.js v5)
- Configure NextAuth with Drizzle adapter for Turso
- Google and GitHub OAuth providers configured via env vars
- Auth middleware protecting /sites, /settings, and API routes (dashboard remains public for demo)
- Sign in / sign out buttons in the app header
- User avatar and name shown when signed in
- Unauthenticated users see the dashboard with seed demo sites (read-only)
- Session provider wrapping the app
- Auth-related env vars in `.env.example`
- Typecheck passes

### US-003: Migrate Site Management to Turso
**Description:** As a user, I want my sites stored in the database so they persist across devices.
**Acceptance Criteria:**
- Rewrite site server actions to use Drizzle queries instead of JSON file ops
- All CRUD operations (create, read, update, delete) work with Turso
- Sites are scoped to the authenticated user (userId foreign key)
- Site form unchanged from v1 (same fields, same validation)
- Sites page requires authentication (redirect to sign-in if not logged in)
- Typecheck passes

### US-004: Migrate Settings to Turso
**Description:** As a user, I want my notification settings stored in the database.
**Acceptance Criteria:**
- Rewrite settings server actions to use Drizzle
- Settings scoped to authenticated user
- Per-site notification toggles stored as JSON column or separate join table
- Default settings created on first sign-in
- Settings page requires authentication
- Typecheck passes

### US-005: Fix Weather Fetching + Add Winds Aloft
**Description:** As a pilot, I want weather data that includes upper-air conditions so I can better assess XC potential.
**Acceptance Criteria:**
- Keep Open-Meteo as the data source (free, no API key)
- Add hourly parameters: `boundary_layer_height`, `wind_speed_850hPa`, `wind_direction_850hPa`, `lifted_index` (if available), `convective_inhibition`
- Update Forecast TypeScript types to include new fields
- Cache forecasts in Turso forecasts_cache table instead of JSON file
- Cache expiration logic unchanged (6 hours)
- Handle missing upper-air fields gracefully (some may not be available for all locations)
- Typecheck passes

### US-006: Fix Scoring Algorithm
**Description:** As a pilot, I want accurate scoring that properly handles wind direction and includes upper-air data.
**Acceptance Criteria:**
- Fix wind direction averaging to use circular mean (atan2-based vector averaging)
- Add boundary layer height to scoring: higher BLH = better thermals (new factor, 10% weight)
- Add 850hPa wind to scoring: strong upper winds reduce XC safety (new factor, 5% weight, replaces some weight from surface wind)
- Revised weights: CAPE 25%, surface wind 20%, wind direction 15%, cloud cover 10%, precipitation 5%, boundary layer height 15%, upper wind 10%
- Flyable window respects the site's timezone from Open-Meteo response
- Score label thresholds unchanged
- All existing scoring tests (if any) updated
- Typecheck passes

### US-007: Dashboard Updates
**Description:** As a user, I want the dashboard to show forecasts for my sites or demo sites if not logged in.
**Acceptance Criteria:**
- Authenticated users: show their own sites with full interactivity
- Unauthenticated users: show 3 demo seed sites (Tiger Mountain, Dog Mountain, Chelan Butte) read-only
- Score detail dialog shows the new factors (BLH, upper wind) in the breakdown
- Notification bell indicator uses real settings from database
- Refresh button works correctly with Turso-cached forecasts
- Loading and error states maintained
- Typecheck passes

### US-008: Map-Based Site Picker
**Description:** As a pilot, I want to pick my flying site on a map so I don't need to know exact coordinates.
**Acceptance Criteria:**
- Install `leaflet` and `react-leaflet` (both free, OpenStreetMap tiles)
- Add a map component to the Add Site dialog
- Click on map to set latitude/longitude (auto-fills the coordinate fields)
- Search box on map to find locations by name (using Nominatim geocoding — free)
- Map also shown on site detail page showing the site location
- Small map preview on site cards
- Map works on mobile (touch interactions)
- Typecheck passes

### US-009: Site Detail Page Improvements
**Description:** As a pilot, I want richer detail views with the new weather parameters.
**Acceptance Criteria:**
- Hourly table includes: boundary layer height, 850hPa wind speed/direction
- Add a wind rose or compass visualization showing ideal vs actual wind direction
- Score breakdown chart shows all 7 factors with visual bars
- Daily cards show BLH (boundary layer height) alongside existing metrics
- Hourly chart shows BLH as an additional layer
- Typecheck passes

### US-010: Web Push Notifications
**Description:** As a pilot, I want to receive push notifications on my phone/browser when good conditions are forecasted.
**Acceptance Criteria:**
- Generate VAPID keys (add to env vars)
- Service worker registration for push notifications (`public/sw.js`)
- "Enable notifications" button on Settings page that triggers browser permission request
- Push subscription stored in Turso (push_subscriptions table)
- API route `POST /api/notifications/check` that: fetches forecasts for all sites, scores them, finds users whose thresholds are met within their daysAhead window, sends web push to their subscriptions
- Notification payload includes: site name, date, score, label
- Clicking notification opens the site detail page
- Vercel cron job (`vercel.json`) calling the check endpoint twice daily (6am and 6pm UTC)
- Users can unsubscribe from push on Settings page
- Typecheck passes

### US-011: PWA Support
**Description:** As a mobile pilot, I want to install SoarCast as an app on my phone.
**Acceptance Criteria:**
- Web app manifest (`public/manifest.json`) with app name, icons, theme color, display: standalone
- Generate PWA icons (192x192, 512x512) from the SoarCast logo/icon
- Service worker caches app shell for offline access (pages load without network)
- Add to Home Screen prompt works on Android Chrome and iOS Safari
- Meta tags for PWA in layout.tsx (theme-color, apple-mobile-web-app-capable)
- Typecheck passes

### US-012: Seed Data + Demo Mode + Polish
**Description:** As a new visitor, I want to see the app working immediately with demo data, and the app should be polished for production.
**Acceptance Criteria:**
- Demo sites (Tiger Mountain, Dog Mountain, Chelan Butte) shown on dashboard for unauthenticated users
- Demo data fetched fresh from Open-Meteo (not hardcoded forecasts)
- Landing hero section on dashboard for unauthenticated users explaining the app with "Sign in to add your own sites" CTA
- Updated README with: Turso setup instructions, NextAuth config, VAPID key generation, Vercel deployment guide
- Environment variable documentation complete
- All pages have proper meta tags and Open Graph data
- Favicon and PWA icons consistent
- Error boundaries on all routes
- Loading skeletons on all data-fetching pages
- Typecheck passes
