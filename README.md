# SoarCast 🪂

**Paragliding XC Weather Monitor** — Track flying conditions at your favorite sites with 7-day weather forecasts and XC soaring scores.

SoarCast analyzes weather data from Open-Meteo to score each day's cross-country (XC) flying potential based on thermal strength (CAPE), wind conditions, cloud cover, and precipitation. Get instant visual feedback on which days look epic and which ones to skip.

## Features

- 🗺️ **Site Management** — Add and manage your flying sites with location, elevation, ideal wind directions, and max wind speed preferences
- 📊 **7-Day Dashboard** — Grid view showing XC scores (0-100) for all your sites across the next week
- 🔍 **Detailed Forecasts** — Site-specific pages with daily summaries and hourly weather timelines
- 🧮 **Smart Scoring Algorithm** — Weighted scoring based on CAPE (30%), wind speed (25%), wind direction (20%), cloud cover (15%), and precipitation (10%)
- 🔔 **Notification Preferences** — Configure score thresholds and notification windows (visual indicators only in v1)
- 🌓 **Dark Mode** — Full dark mode support via next-themes
- 📱 **Responsive Design** — Mobile-friendly layout with collapsible sidebar navigation

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui
- **Data Storage**: JSON files (no database required)
- **Weather API**: Open-Meteo (free, no API key needed)

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm/bun

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd soarcast
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

On first run, SoarCast will automatically seed three example Pacific Northwest flying sites:
- Tiger Mountain (Seattle area)
- Dog Mountain (Columbia River Gorge)
- Chelan Butte (Eastern Washington)

### Build for Production

```bash
npm run build
npm start
```

### Type Checking

```bash
npm run typecheck
```

## Project Structure

```
soarcast/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── page.tsx      # Dashboard (/)
│   │   ├── sites/        # Site management pages
│   │   ├── settings/     # Settings page
│   │   └── actions.ts    # Server actions
│   ├── components/       # React components
│   │   ├── ui/          # shadcn/ui components
│   │   └── ...          # Custom components
│   ├── lib/             # Utilities
│   │   ├── storage.ts   # JSON file storage
│   │   ├── weather.ts   # Open-Meteo API client
│   │   ├── scoring.ts   # XC scoring algorithm
│   │   └── seed.ts      # Default seed data
│   └── types/           # TypeScript type definitions
├── data/                # JSON data storage (gitignored)
│   ├── sites.json       # User sites
│   ├── forecasts.json   # Cached weather data
│   └── settings.json    # User preferences
└── public/              # Static assets
```

## Data Storage

SoarCast uses simple JSON file storage in the `data/` directory:

- **sites.json**: Stores your configured flying sites
- **forecasts.json**: Caches weather data (6-hour expiration)
- **settings.json**: Stores notification preferences

Data persists across server restarts and is gitignored by default.

## Weather Data

Powered by [Open-Meteo](https://open-meteo.com/), a free weather API with no authentication required. Forecasts include:

- Temperature, wind speed/direction/gusts
- Cloud cover, CAPE (thermal strength)
- Precipitation probability, pressure
- Sunrise/sunset times

Forecast data is cached for 6 hours to reduce API load.

## Scoring Algorithm

Each day receives a score from 0-100 based on:

1. **CAPE (30%)** — Thermal strength (0-2000 J/kg range)
2. **Wind Speed (25%)** — Relative to site's max wind speed
3. **Wind Direction (20%)** — Match with site's ideal directions
4. **Cloud Cover (15%)** — Lower is better for thermals
5. **Precipitation (10%)** — Lower probability is better

Only flyable hours (10:00-17:00 local time) are analyzed. Scores are labeled:
- 0-30: Poor
- 31-50: Fair
- 51-70: Good
- 71-85: Great
- 86-100: Epic

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the repository in [Vercel](https://vercel.com)
3. Deploy (zero configuration needed)

The `data/` directory will be created automatically on first run in the deployed environment.

### Other Platforms

SoarCast works on any Node.js hosting platform that supports:
- Next.js 15+
- File system write access for JSON storage

Ensure the `data/` directory is writable in your deployment environment.

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

---

Built with ❤️ for the paragliding XC community
