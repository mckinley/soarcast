# SoarCast 🪂

**Paragliding XC Weather Monitor** — Track flying conditions at your favorite sites with 7-day weather forecasts, intelligent scoring, and push notifications.

SoarCast analyzes weather data from Open-Meteo to score each day's cross-country (XC) flying potential based on thermal strength (CAPE), wind conditions, boundary layer height, upper-air winds, cloud cover, and precipitation. Get instant visual feedback on which days look epic and which ones to skip.

## ✨ Features

### Core Features
- 🗺️ **Map-Based Site Picker** — Click on a map to add your flying sites, or search by location name
- 📊 **7-Day Dashboard** — Grid view showing XC scores (0-100) for all your sites across the next week
- 🔍 **Detailed Forecasts** — Site-specific pages with daily summaries, hourly weather timelines, and interactive charts
- 🧮 **Advanced Scoring Algorithm** — 7-factor weighted scoring including CAPE, surface winds, wind direction, boundary layer height, 850hPa winds, cloud cover, and precipitation
- 🔔 **Web Push Notifications** — Get notified when great flying conditions are forecasted at your sites
- 📱 **Progressive Web App** — Install on your phone for a native app experience
- 🔐 **User Authentication** — Sign in with Google or GitHub to sync your sites across devices
- 🌓 **Dark Mode** — Full dark mode support via next-themes
- 📱 **Responsive Design** — Mobile-friendly layout optimized for use in the field

### Demo Mode
- 👀 **Public Dashboard** — View demo sites with live weather data without signing in
- 🎯 **Try Before Sign In** — Experience the full interface before creating an account

## 🚀 Tech Stack

- **Framework**: Next.js 15 (App Router, React Server Components)
- **Language**: TypeScript (strict mode)
- **Database**: Turso (SQLite for the edge) + Drizzle ORM
- **Authentication**: NextAuth v5 (Auth.js) with OAuth providers
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui + Radix UI
- **Maps**: Leaflet + react-leaflet
- **Notifications**: Web Push API with VAPID
- **Weather API**: Open-Meteo (free, no API key needed)
- **Deployment**: Vercel (zero-cost tier)

## 📋 Prerequisites

- Node.js 18+ and npm/yarn/pnpm/bun
- [Turso](https://turso.tech/) database (free tier available)
- OAuth apps for Google and/or GitHub authentication
- VAPID keys for web push notifications

## 🛠️ Setup Instructions

### 1. Clone and Install

```bash
git clone <repo-url>
cd soarcast
npm install
```

### 2. Set Up Turso Database

Create a Turso database and get credentials:

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Create database
turso db create soarcast

# Get database URL
turso db show soarcast

# Create auth token
turso db tokens create soarcast
```

### 3. Configure OAuth Apps

**Google OAuth:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (and your production URL)
4. Copy Client ID and Client Secret

**GitHub OAuth:**
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create new OAuth App
3. Authorization callback URL: `http://localhost:3000/api/auth/callback/github` (and your production URL)
4. Copy Client ID and Client Secret

### 4. Generate VAPID Keys

```bash
npx web-push generate-vapid-keys
```

Copy the public and private keys for your environment variables.

### 5. Configure Environment Variables

Create `.env.local` from the example:

```bash
cp .env.example .env.local
```

Fill in all the values:

```env
# Turso Database
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# NextAuth
AUTH_SECRET=your-nextauth-secret  # Generate with: openssl rand -base64 32
AUTH_URL=http://localhost:3000

# OAuth Providers
AUTH_GOOGLE_ID=your-google-oauth-client-id
AUTH_GOOGLE_SECRET=your-google-oauth-client-secret
AUTH_GITHUB_ID=your-github-oauth-app-id
AUTH_GITHUB_SECRET=your-github-oauth-app-secret

# Web Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# Cron Secret (for notification checks)
CRON_SECRET=your-random-secret
```

### 6. Run Database Migrations

```bash
npx drizzle-kit push
```

This will create all required tables in your Turso database.

### 7. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📦 Database Schema

SoarCast uses the following tables:

- **users** — User accounts (NextAuth)
- **accounts** — OAuth provider accounts (NextAuth)
- **sessions** — User sessions (NextAuth)
- **verificationTokens** — Email verification tokens (NextAuth)
- **sites** — Flying sites with coordinates, wind preferences, and notes
- **forecastsCache** — Cached weather forecast data (6-hour TTL)
- **settings** — User preferences (notification thresholds, site preferences)
- **pushSubscriptions** — Web push notification subscriptions

## 🧮 Scoring Algorithm

Each day receives a score from 0-100 based on:

1. **CAPE (25%)** — Convective Available Potential Energy (thermal strength)
2. **Surface Wind (20%)** — Wind speed relative to site's max wind speed
3. **Wind Direction (15%)** — Match with site's ideal wind directions (circular mean)
4. **Boundary Layer Height (15%)** — Height of thermal mixing layer (higher = better)
5. **850hPa Wind (10%)** — Upper-level wind at ~1500m altitude (lower = better)
6. **Cloud Cover (10%)** — Lower is better for thermal development
7. **Precipitation (5%)** — Lower probability is better

Only flyable hours (10:00-17:00 local time) are analyzed. Scores are labeled:
- **0-30**: Poor ❌
- **31-50**: Fair 🌤️
- **51-70**: Good ☀️
- **71-85**: Great 🔥
- **86-100**: Epic 🚀

## 🔔 Notification System

SoarCast uses web push notifications to alert you of great flying conditions:

1. **Enable Notifications** on the Settings page
2. Grant browser notification permissions
3. Configure your score threshold (default: 70+)
4. Vercel Cron runs checks at 6 AM and 6 PM UTC daily
5. You'll receive push notifications when conditions meet your threshold

Notifications include:
- Site name
- Date
- Score and label (e.g., "Great" or "Epic")
- Click to view detailed forecast

## 🚢 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Add all environment variables from `.env.local` in the Vercel dashboard
4. Update OAuth redirect URIs with your production domain
5. Update `AUTH_URL` to your production URL
6. Deploy

The app includes a `vercel.json` with cron configuration for automated notification checks.

### Environment Variables for Production

Make sure to set in Vercel dashboard:
- All `AUTH_*` variables with production OAuth apps
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
- `CRON_SECRET` (Vercel auto-generates if not set)

### Database for Production

You can use the same Turso database for development and production, or create a separate production database:

```bash
turso db create soarcast-prod
turso db show soarcast-prod
turso db tokens create soarcast-prod
```

## 📁 Project Structure

```
soarcast/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # Dashboard (public demo or user sites)
│   │   ├── actions.ts         # Dashboard server actions
│   │   ├── sites/             # Site management pages
│   │   │   ├── page.tsx      # Sites list
│   │   │   ├── actions.ts    # Site CRUD actions
│   │   │   └── [id]/         # Site detail page
│   │   ├── settings/          # Settings page
│   │   │   ├── page.tsx
│   │   │   └── actions.ts
│   │   ├── auth/signin/       # Custom sign-in page
│   │   └── api/
│   │       ├── auth/          # NextAuth routes
│   │       └── notifications/ # Push notification endpoints
│   ├── components/            # React components
│   │   ├── ui/               # shadcn/ui components
│   │   ├── app-shell.tsx     # Main layout with nav and user menu
│   │   ├── dashboard-client.tsx
│   │   ├── site-form-dialog.tsx
│   │   ├── map-picker.tsx    # Interactive map for site selection
│   │   └── ...
│   ├── db/
│   │   ├── schema.ts         # Drizzle ORM schema
│   │   └── index.ts          # Turso client initialization
│   ├── lib/                  # Utilities
│   │   ├── weather.ts        # Open-Meteo API client with Turso caching
│   │   ├── scoring.ts        # XC scoring algorithm
│   │   └── seed.ts           # Demo site constants
│   ├── types/                # TypeScript type definitions
│   └── auth.ts               # NextAuth configuration
├── public/
│   ├── manifest.json         # PWA manifest
│   └── sw.js                 # Service worker (push notifications + PWA)
├── drizzle/                  # Database migrations
├── drizzle.config.ts         # Drizzle Kit configuration
└── vercel.json              # Vercel cron configuration
```

## 🧪 Development

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Build

```bash
npm run build
npm start
```

### Database Migrations

Generate new migration after schema changes:

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

View database in Drizzle Studio:

```bash
npx drizzle-kit studio
```

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 📄 License

MIT

---

Built with ❤️ for the paragliding XC community
