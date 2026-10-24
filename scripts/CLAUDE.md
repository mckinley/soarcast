# Scripts Directory

This directory contains utility scripts (icon generation). Database migrations live in `migrations/`.

## Site Utilities

Shared site utilities live in `src/lib/site-utils.ts`:

- `calculateDistance()`: Haversine formula for lat/lng distance
- `namesAreSimilar()`: Fuzzy name matching for site names
- `findNearbySites()`: Find launch sites near a location
