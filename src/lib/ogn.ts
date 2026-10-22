// Gliders, hang gliders and paragliders flying now, from the Open Glider
// Network (OGN): receivers on the ground pick up the FLARM and OGN trackers
// many aircraft carry, best covered in Europe. SoarCast reads the positions
// OGN's live map shows (live.glidernet.org), which already leaves out
// aircraft whose owners asked not to be tracked. It counts them near a
// launch for the Up now card (app/lib/ogn.server.ts) and draws them on the
// map's Flying now layer (src/components/map-layers.tsx). It never keeps a
// position and never shows who is flying: no name, registration or
// competition number. OGN's data is under the ODbL. It never changes a
// verdict.

import { calculateDistance } from './site-utils';

export const OGN_LIVE = 'https://live.glidernet.org/lxml.php';

/** OGN's aircraft types SoarCast reads (OGN numbers them 0 to 15). */
const KINDS = { 1: 'glider', 6: 'hang glider', 7: 'paraglider' } as const;
export type OgnKind = (typeof KINDS)[keyof typeof KINDS];

/** The map's Flying now layer fetches positions again this often (seconds). */
export const FLYING_NOW_REFRESH_SECONDS = 30;
/** A position older than this (seconds) is left out. */
export const OGN_MAX_AGE_SECONDS = 300;
/** Moving at least this fast (km/h), or climbing or sinking, counts as in the air. */
export const OGN_MIN_SPEED_KMH = 10;
const OGN_MIN_CLIMB_MS = 0.5;

export interface OgnAircraft {
  /** OGN's anonymous key for the aircraft, only to tell positions apart */
  key: string;
  kind: OgnKind;
  latitude: number;
  longitude: number;
  /** m above sea level */
  altitude: number;
  /** Seconds since the position */
  age: number;
  /** Heading, degrees, ground speed km/h, climb m/s */
  track: number;
  speed: number;
  climb: number;
}

/**
 * The gliders, hang gliders and paragliders in the air in an answer from
 * OGN's live map. Each marker is
 * lat,lon,cn,registration,alt,time,age,track,speed,climb,type,receiver,device,key.
 */
export function parseOgnMarkers(xml: string): OgnAircraft[] {
  const out: OgnAircraft[] = [];
  for (const match of xml.matchAll(/<m a="([^"]*)"/g)) {
    const f = match[1].split(',');
    const kind = KINDS[Number(f[10]) as keyof typeof KINDS];
    if (!kind || f.length < 14) continue;
    const aircraft: OgnAircraft = {
      key: f[13],
      kind,
      latitude: Number(f[0]),
      longitude: Number(f[1]),
      altitude: Number(f[4]),
      age: Number(f[6]),
      track: Number(f[7]),
      speed: Number(f[8]),
      climb: Number(f[9]),
    };
    if (
      [aircraft.latitude, aircraft.longitude, aircraft.altitude, aircraft.age].some(
        (n) => !Number.isFinite(n),
      ) ||
      aircraft.age > OGN_MAX_AGE_SECONDS
    ) {
      continue;
    }
    if (aircraft.speed < OGN_MIN_SPEED_KMH && Math.abs(aircraft.climb) < OGN_MIN_CLIMB_MS) {
      continue;
    }
    out.push(aircraft);
  }
  return out;
}

/** The query for aircraft inside a box. */
export function ognQuery(south: number, west: number, north: number, east: number): string {
  const p = new URLSearchParams({
    a: '0',
    b: north.toFixed(3),
    c: south.toFixed(3),
    d: east.toFixed(3),
    e: west.toFixed(3),
  });
  return `${OGN_LIVE}?${p}`;
}

/** The box (south, west, north, east) reaching `km` from a place. */
export function boxAround(latitude: number, longitude: number, km: number) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((latitude * Math.PI) / 180));
  return [latitude - dLat, longitude - dLon, latitude + dLat, longitude + dLon] as const;
}

export interface OgnNow {
  /** When SoarCast asked, unix seconds */
  at: number;
  radiusKm: number;
  paragliders: number;
  hangGliders: number;
  gliders: number;
  /** The highest paraglider or hang glider, m above sea level */
  topAltitude: number | null;
}

/** What OGN shows in the air within `radiusKm` of a launch. */
export function ognNowNear(
  aircraft: OgnAircraft[],
  latitude: number,
  longitude: number,
  radiusKm: number,
  at: number,
): OgnNow {
  const near = aircraft.filter(
    (a) => calculateDistance(latitude, longitude, a.latitude, a.longitude) <= radiusKm,
  );
  const count = (kind: OgnKind) =>
    new Set(near.filter((a) => a.kind === kind).map((a) => a.key)).size;
  const free = near.filter((a) => a.kind !== 'glider');
  return {
    at,
    radiusKm,
    paragliders: count('paraglider'),
    hangGliders: count('hang glider'),
    gliders: count('glider'),
    topAltitude: free.length ? Math.max(...free.map((a) => a.altitude)) : null,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 paragliders, 1 hang glider and 2 gliders", or null when none. */
function countsInWords(now: OgnNow): string | null {
  const parts = [
    now.paragliders && plural(now.paragliders, 'paraglider', 'paragliders'),
    now.hangGliders && plural(now.hangGliders, 'hang glider', 'hang gliders'),
    now.gliders && plural(now.gliders, 'glider', 'gliders'),
  ].filter((p): p is string => Boolean(p));
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** Whether OGN shows anything in the air near the launch. */
export function ognAnyUp(now: OgnNow): boolean {
  return now.paragliders + now.hangGliders + now.gliders > 0;
}

/** What a site page says about OGN now, or null when nothing is up. */
export function ognLines(now: OgnNow, launchAltitude: number | null): string[] | null {
  const counts = countsInWords(now);
  if (!counts) return null;
  const lines = [`On OGN: ${counts} in the air within ${now.radiusKm} km.`];
  if (now.topAltitude != null && launchAltitude) {
    const gain = Math.round((now.topAltitude - launchAltitude) / 10) * 10;
    const free = now.paragliders + now.hangGliders;
    const who =
      free > 1
        ? 'The highest paraglider or hang glider is'
        : now.paragliders
          ? 'The paraglider is'
          : 'The hang glider is';
    if (gain >= 50) lines.push(`${who} ${gain.toLocaleString('en-US')} m above launch.`);
    else if (gain <= -50) lines.push(`${who} ${(-gain).toLocaleString('en-US')} m below launch.`);
  }
  return lines;
}
