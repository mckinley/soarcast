// Sites a pilot pins themselves: unlisted hike-and-fly peaks and private
// launches. Only their owner sees them, and they're rated and alerted on
// like listed sites. The owner can share one: pgsites then lists a copy
// (place, height, directions and what it gives) that any pilot can follow.

import type { CustomSite } from '@/db/schema';
import type { Site, SiteGoal, SiteKind, SiteTerrain } from '@/types';
import type { SharedSiteBody } from '@/lib/pgsites-client';
import { COMPASS_POINTS } from '@/lib/site-utils';
import { defaultWindLimit } from '@/lib/forecast-engine';
import { defaultGoal, isSiteGoal, isSiteKind } from '@/lib/site-goals';
import { isSiteTerrain, siteTerrain } from '@/lib/site-terrain';

export const MAX_NAME_LENGTH = 80;
export const MAX_NOTES_LENGTH = 2000;
export const MIN_WIND_LIMIT = 10;
export const MAX_WIND_LIMIT = 80;
const MAX_ELEVATION = 9000;

/** A private site as the engine rates it; `margins`: its owner keeps wider margins in big mountains. */
export function customSiteToSite(row: CustomSite, margins: boolean): Site {
  const terrain = margins ? siteTerrain(row.terrain, row.terrainSlope, row.terrainRelief) : null;
  return {
    id: row.id,
    name: row.name,
    latitude: parseFloat(row.latitude),
    longitude: parseFloat(row.longitude),
    elevation: row.elevation,
    idealWindDirections: row.idealWindDirections ?? [],
    okWindDirections: row.okWindDirections ?? [],
    // 0: the usual limit for its terrain
    maxWindSpeed: row.maxWindSpeed > 0 ? row.maxWindSpeed : defaultWindLimit(terrain, row.siteKind),
    kind: row.siteKind,
    // Pilots pin hike-and-fly peaks they're happy to sled off
    goal: row.goal ?? defaultGoal(row.siteKind, true),
    terrain,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** { N: 2, NE: 0, ... }: 2 = works well, 1 = works cross, 0 = doesn't. */
export function directionRatings(good: number[], ok: number[]): Record<string, number> {
  return Object.fromEntries(
    COMPASS_POINTS.map(({ label, degrees }) => [
      label,
      good.includes(degrees) ? 2 : ok.includes(degrees) ? 1 : 0,
    ]),
  );
}

/** What the add and edit forms submit, parsed. */
export interface CustomSiteInput {
  name: string;
  latitude: number;
  longitude: number;
  elevation: number | null; // null: not entered, look it up from terrain
  goodDirections: number[];
  okDirections: number[];
  /** km/h; 0 takes the usual limit for the terrain */
  maxWindSpeed: number;
  /** What the launch gives; null when the pilot isn't sure */
  kind: SiteKind | null;
  /** The ground round it; null goes by the measure */
  terrain: SiteTerrain | null;
  /** What makes a day worth going; null uses the default */
  goal: SiteGoal | null;
  notes: string | null;
  /** Listed for other pilots through pgsites */
  share: boolean;
}

export type CustomSiteField =
  | 'name'
  | 'location'
  | 'elevation'
  | 'maxWindSpeed'
  | 'notes'
  | 'share';
export type CustomSiteErrors = Partial<Record<CustomSiteField, string>>;

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** Compass degrees from a comma-separated field, ignoring anything else. */
function directions(form: FormData, key: string): number[] {
  const valid = new Set<number>(COMPASS_POINTS.map((p) => p.degrees));
  const values = text(form, key)
    .split(',')
    .filter((v) => v.trim() !== '')
    .map((v) => Number(v))
    .filter((v) => valid.has(v));
  return [...new Set(values)].sort((a, b) => a - b);
}

export function parseCustomSiteForm(form: FormData): {
  input: CustomSiteInput;
  errors: CustomSiteErrors;
} {
  const errors: CustomSiteErrors = {};

  const name = text(form, 'name');
  if (!name) errors.name = 'Give the site a name.';
  else if (name.length > MAX_NAME_LENGTH)
    errors.name = `Keep the name under ${MAX_NAME_LENGTH} characters.`;

  const latitude = Number(text(form, 'latitude'));
  const longitude = Number(text(form, 'longitude'));
  const pinned =
    text(form, 'latitude') !== '' &&
    text(form, 'longitude') !== '' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0);
  if (!pinned) errors.location = 'Drop a pin on the launch.';

  const elevationText = text(form, 'elevation');
  const elevation = elevationText === '' ? null : Math.round(Number(elevationText));
  if (elevation !== null && !(elevation >= 0 && elevation <= MAX_ELEVATION)) {
    errors.elevation = `Enter the launch elevation in meters, 0 to ${MAX_ELEVATION.toLocaleString('en-US')}.`;
  }

  const windText = text(form, 'maxWindSpeed');
  const maxWindSpeed = windText === '' ? 0 : Math.round(Number(windText));
  if (windText !== '' && !(maxWindSpeed >= MIN_WIND_LIMIT && maxWindSpeed <= MAX_WIND_LIMIT)) {
    errors.maxWindSpeed = `The wind limit must be between ${MIN_WIND_LIMIT} and ${MAX_WIND_LIMIT} km/h.`;
  }

  const notes = text(form, 'notes');
  if (notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `Keep notes under ${MAX_NOTES_LENGTH.toLocaleString('en-US')} characters.`;
  }

  const goodDirections = directions(form, 'good');
  const okDirections = directions(form, 'ok').filter((d) => !goodDirections.includes(d));
  const share = text(form, 'share') === 'on';
  // Other pilots can't tell when a launch works without its directions
  if (share && goodDirections.length + okDirections.length === 0) {
    errors.share = 'To share the site, mark at least one wind direction.';
  }

  return {
    input: {
      name,
      latitude,
      longitude,
      elevation,
      goodDirections,
      okDirections,
      maxWindSpeed,
      kind: isSiteKind(text(form, 'kind')) ? (text(form, 'kind') as SiteKind) : null,
      terrain: isSiteTerrain(text(form, 'terrain')) ? (text(form, 'terrain') as SiteTerrain) : null,
      goal: isSiteGoal(text(form, 'goal')) ? (text(form, 'goal') as SiteGoal) : null,
      notes: notes || null,
      share,
    },
    errors,
  };
}

/** What sharing a site sends: never the notes, wind limit or goal. */
export function sharedSiteBody(input: CustomSiteInput, elevation: number): SharedSiteBody {
  return {
    name: input.name,
    latitude: input.latitude,
    longitude: input.longitude,
    altitude: elevation,
    wind: COMPASS_POINTS.map(({ degrees }) =>
      input.goodDirections.includes(degrees) ? 2 : input.okDirections.includes(degrees) ? 1 : 0,
    ),
    kind: input.kind,
  };
}

/** pgsites' name for a shared custom site. */
export const sharedSiteRef = (customSiteId: string) => `soarcast:${customSiteId}`;
