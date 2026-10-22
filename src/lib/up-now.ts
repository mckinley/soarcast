// Pilots up at a launch right now, from Syncing Pilots (live inReach and
// SPOT trackers; app/lib/up-now.server.ts asks for it), as site pages say
// it. Up now never changes a verdict.

import type { FlownDay } from './flown-days';

/** Pilots in the air this close (km) to a launch count as up there now. */
export const UP_NOW_AIR_KM = 10;

/** What Syncing Pilots' FlownDaysApi.upNow takes (its app/lib/up-now.ts). */
export interface UpNowQuery {
  latitude: number;
  longitude: number;
  altitude: number | null;
  /** Flights taking off this close (km) count for today, as with flown days */
  radiusKm: number;
  /** Pilots in the air this close (km) count as up now */
  airRadiusKm: number;
  timeZone: string;
}

export interface UpNowResult {
  query: UpNowQuery;
  /** When Syncing Pilots worked it out, unix seconds */
  at: number;
  /** Different pilots in the air near the launch now */
  inAir: number;
  /** Different pilots live on the ground at the launch */
  onLaunch: number;
  /** The highest pilot in the air, m above sea level */
  topAltitude: number | null;
  /** The newest position of the pilots counted, unix seconds */
  newestFixAt: number | null;
  /** The launch's day so far, or null when nobody launched yet */
  today: FlownDay | null;
}

const pilots = (n: number) => `${n} ${n === 1 ? 'pilot' : 'pilots'}`;

/** Whether anyone is up or on launch right now. */
export function anyoneUp(up: UpNowResult): boolean {
  return up.inAir + up.onLaunch > 0;
}

/** What a site page says about now and today, or null when there is nothing. */
export function upNowLines(up: UpNowResult, launchAltitude: number | null): string[] | null {
  const lines: string[] = [];
  if (up.inAir > 0) {
    lines.push(`${pilots(up.inAir)} in the air within ${up.query.airRadiusKm} km now.`);
    if (up.topAltitude != null && launchAltitude) {
      const gain = Math.round((up.topAltitude - launchAltitude) / 10) * 10;
      if (gain >= 50) lines.push(`The highest is ${gain} m above launch.`);
      else if (gain <= -50) lines.push(`The highest is ${-gain} m below launch.`);
    }
  }
  if (up.onLaunch > 0) lines.push(`${pilots(up.onLaunch)} on launch.`);
  const today = up.today;
  if (today && today.pilots > 0) {
    lines.push(
      today.firstTakeoff
        ? `${pilots(today.pilots)} launched here today, the first at ${today.firstTakeoff}.`
        : `${pilots(today.pilots)} launched here today.`,
    );
    if (up.inAir === 0 && today.lastLanding) lines.push(`The last landed at ${today.lastLanding}.`);
  }
  return lines.length > 0 ? lines : null;
}

/** "14:05" at the launch, the same on the server and in the browser. */
export function localClock(unixSeconds: number, timeZone: string): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  });
}
