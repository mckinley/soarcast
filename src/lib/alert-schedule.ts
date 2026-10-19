// When each user's alerts go out. The Worker's cron fires hourly (UTC);
// a user gets the morning run at their digest hour and the evening run at
// EVENING_ALERT_HOUR, both in their own time zone.

// Users who haven't saved a time zone yet: SoarCast's pilots are in the
// Pacific Northwest so far.
export const DEFAULT_TIME_ZONE = 'America/Los_Angeles';
export const DEFAULT_DIGEST_TIME = '08:00';
export const EVENING_ALERT_HOUR = 18;

export type AlertRun = 'morning' | 'evening';

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

/** The hour (0-23) at `now` in `timeZone`. */
export function localHour(now: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now),
  );
}

/** The calendar date (YYYY-MM-DD) at `now` in `timeZone`. */
export function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** `date` (YYYY-MM-DD) plus `days` days. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Which alert run, if any, is due for a user in the hour starting at `now`. */
export function dueAlertRun(
  now: Date,
  timeZone: string | null | undefined,
  digestTime: string | null | undefined,
): AlertRun | null {
  const hour = localHour(now, resolveTimeZone(timeZone));
  const digestHour = Number((digestTime || DEFAULT_DIGEST_TIME).split(':')[0]);
  if (hour === digestHour) return 'morning';
  if (hour === EVENING_ALERT_HOUR) return 'evening';
  return null;
}
