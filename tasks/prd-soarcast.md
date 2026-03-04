# PRD: SoarCast — Paragliding XC Weather Monitor

## Introduction

SoarCast monitors weather conditions and soaring forecasts to identify good cross-country paragliding days. It pulls data from weather APIs, scores flying conditions for configured sites, and shows a dashboard of upcoming flyable days. Users can configure their flying sites and receive alerts when good conditions arise.

## Goals

- Provide at-a-glance XC potential forecasts for paragliding sites
- Score days based on thermals, wind, cloud base, and stability
- Use free weather APIs (Open-Meteo) — no API keys required for MVP
- Store all data in JSON files on the filesystem (no external database)
- Clean, modern UI with shadcn components
- Deploy on Vercel

## Tech Stack

- Next.js 15 (App Router)
- TypeScript (strict mode)
- Tailwind CSS v4 + shadcn/ui
- JSON file-system storage (data/ directory)
- Open-Meteo API (weather data)
- Deployed on Vercel

## User Stories

### US-001: Project Foundation & Layout
**Description:** As a developer, I want the app shell and layout set up so I have a solid foundation to build on.
**Acceptance Criteria:**
- App has a responsive layout with header (logo/title "SoarCast"), sidebar navigation, and main content area
- Navigation includes: Dashboard, Sites, Settings
- Dark mode support via shadcn theme toggle
- Mobile-responsive (sidebar collapses to hamburger menu)
- TypeScript strict mode enabled in tsconfig
- Typecheck passes

### US-002: JSON File Storage Layer
**Description:** As a developer, I want a simple JSON file storage utility so the app can persist data without a database.
**Acceptance Criteria:**
- Utility module at `src/lib/storage.ts` with read/write/update functions for JSON files
- Data stored in `data/` directory at project root
- Type-safe: generic functions that accept TypeScript types
- Handles concurrent reads safely (read-modify-write pattern)
- Stores: `sites.json`, `forecasts.json`, `settings.json`
- TypeScript interfaces defined for all data shapes in `src/types/index.ts`
- Typecheck passes

### US-003: Site Management
**Description:** As a user, I want to add and manage my flying sites so I can track conditions at places I fly.
**Acceptance Criteria:**
- Sites page (`/sites`) listing all configured sites in a card grid
- "Add Site" dialog with form fields: name, latitude, longitude, elevation (m), ideal wind directions (multi-select compass points), max wind speed (km/h), notes
- Edit and delete functionality for existing sites
- Form validation with error messages (name required, lat/lng in range, elevation positive)
- Sites persisted to `data/sites.json` via server actions
- Typecheck passes

### US-004: Weather Data Fetching
**Description:** As the system, I want to fetch weather forecast data from Open-Meteo so I can analyze flying conditions.
**Acceptance Criteria:**
- Service module at `src/lib/weather.ts` that fetches from Open-Meteo API
- Fetches 7-day hourly forecast for a given lat/lng including: temperature, wind speed, wind direction, wind gusts, cloud cover, CAPE, precipitation probability, pressure
- Also fetches model elevation and sunrise/sunset times
- Results cached in `data/forecasts.json` keyed by site ID + fetch date
- Cache expires after 6 hours (re-fetches if stale)
- Error handling for API failures (returns null, logs error)
- TypeScript types for API response and internal forecast model
- Typecheck passes

### US-005: XC Soaring Score Algorithm
**Description:** As a user, I want each day scored for XC potential so I can quickly see which days look good.
**Acceptance Criteria:**
- Scoring module at `src/lib/scoring.ts`
- Analyzes hourly weather data for the flyable window (10:00–17:00 local time)
- Scoring factors with weights: CAPE/thermal strength (30%), wind speed vs site max (25%), wind direction match (20%), cloud cover (15%), precipitation probability (10%)
- Overall score 0–100 with labels: Poor (0-30), Fair (31-50), Good (51-70), Great (71-85), Epic (86-100)
- Returns per-day score object with overall score, label, and breakdown by factor
- Handles missing data gracefully (uses neutral scores for missing fields)
- Typecheck passes

### US-006: Dashboard — Forecast Overview
**Description:** As a user, I want a dashboard showing the next 7 days of forecasts for all my sites so I can plan my flying.
**Acceptance Criteria:**
- Dashboard page (`/`) showing a grid/table: rows = sites, columns = next 7 days
- Each cell shows the XC score (0-100) with color coding (red→yellow→green gradient)
- Clicking a cell opens a detail panel/dialog showing the score breakdown and hourly weather data
- "Refresh forecasts" button that re-fetches weather data for all sites
- Auto-fetches on page load if data is stale (>6 hours old)
- Empty state when no sites configured (prompts to add sites)
- Loading states while fetching
- Typecheck passes

### US-007: Site Detail Page
**Description:** As a user, I want to see detailed forecasts for a specific site so I can analyze conditions in depth.
**Acceptance Criteria:**
- Site detail page (`/sites/[id]`) showing the site info and 7-day forecast
- Daily cards showing: score badge, wind speed/direction, CAPE, cloud cover, precipitation %, temperature range
- Hourly chart or timeline for the selected day showing wind speed and CAPE through the day
- Visual wind direction indicator (compass arrow or similar)
- Back navigation to sites list
- Typecheck passes

### US-008: Settings & Notifications Config
**Description:** As a user, I want to configure notification preferences so I get alerted about good flying days.
**Acceptance Criteria:**
- Settings page (`/settings`) with notification preferences
- Configurable minimum score threshold for alerts (default: 70 "Great")
- Configurable notification window (how many days ahead to alert, default: 2)
- Toggle notifications on/off per site
- Settings persisted to `data/settings.json`
- Note: actual notification delivery (email/push) is out of scope for v1 — just store the preferences and show a "notification would fire" indicator on the dashboard for qualifying days
- Typecheck passes

### US-009: Seed Data & Polish
**Description:** As a user, I want some example sites pre-loaded so I can see the app in action immediately.
**Acceptance Criteria:**
- Seed script or default data with 3 popular PNW paragliding sites: Tiger Mountain (47.4829, -121.9410, 460m), Dog Mountain (45.6996, -121.7073, 701m), Chelan Butte (47.8282, -120.0164, 390m)
- App has a favicon and meta tags (title: "SoarCast", description: "Paragliding XC forecast monitor")
- Loading/error boundaries for all pages
- 404 page styled consistently
- README.md updated with project description, setup instructions, and deployment notes
- Typecheck passes
