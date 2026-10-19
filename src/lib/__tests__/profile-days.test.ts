import { describe, it, expect } from 'vitest';
import {
  isCachedProfileFresh,
  profileDates,
  profileToday,
  trimProfileDays,
  type AtmosphericProfile,
} from '../weather-profile';
import { formatDateLabel } from '../notifications';

// A Pacific-time profile fetched on Oct 19 local: 7 days of hours from local midnight
function profile(firstDay = '2026-10-19', days = 7): AtmosphericProfile {
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(`${firstDay}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  return {
    latitude: 47.5,
    longitude: -121.8,
    elevation: 500,
    timezone: 'America/Los_Angeles',
    fetchedAt: '',
    expiresAt: '',
    sunriseByDay: Object.fromEntries(dates.map((d) => [d, `${d}T07:30`])),
    sunsetByDay: Object.fromEntries(dates.map((d) => [d, `${d}T18:20`])),
    hours: dates.flatMap((d) =>
      Array.from({ length: 24 }, (_, h) => ({
        time: `${d}T${String(h).padStart(2, '0')}:00`,
        pressureLevels: [],
        surface: {},
        derived: {},
      })),
    ) as unknown as AtmosphericProfile['hours'],
  };
}

describe('profileToday', () => {
  it("is the site's local date, not UTC's", () => {
    // 01:30 UTC on Oct 20 is still the evening of Oct 19 in Seattle
    expect(profileToday(profile(), new Date('2026-10-20T01:30:00Z'))).toBe('2026-10-19');
    expect(profileToday(profile(), new Date('2026-10-20T08:00:00Z'))).toBe('2026-10-20');
  });
});

describe('trimProfileDays', () => {
  it('keeps the requested days from today', () => {
    const one = trimProfileDays(profile(), 1, new Date('2026-10-19T20:00:00Z'));
    expect(profileDates(one)).toEqual(['2026-10-19']);
    expect(one.hours).toHaveLength(24);
    expect(Object.keys(one.sunriseByDay!)).toEqual(['2026-10-19']);
  });

  it("drops yesterday from a profile cached before the site's midnight", () => {
    const trimmed = trimProfileDays(profile(), 7, new Date('2026-10-20T09:00:00Z'));
    expect(profileDates(trimmed)[0]).toBe('2026-10-20');
    expect(profileDates(trimmed)).toHaveLength(6);
  });
});

describe('isCachedProfileFresh', () => {
  const now = new Date('2026-10-19T20:00:00Z');
  const later = new Date('2026-10-19T23:00:00Z');

  it('serves a full week that has not expired', () => {
    expect(isCachedProfileFresh({ data: profile(), expiresAt: later }, 7, now)).toBe(true);
  });

  it('refetches a one-day row cached by the alerts or health check', () => {
    expect(isCachedProfileFresh({ data: profile('2026-10-19', 1), expiresAt: later }, 7, now)).toBe(
      false,
    );
  });

  it("serves a week cached before the site's midnight for its remaining days", () => {
    const afterMidnight = new Date('2026-10-20T07:30:00Z');
    const row = { data: profile(), expiresAt: new Date('2026-10-20T09:00:00Z') };
    expect(isCachedProfileFresh(row, 7, afterMidnight)).toBe(true);
  });

  it('refetches an expired row', () => {
    expect(isCachedProfileFresh({ data: profile(), expiresAt: now }, 7, later)).toBe(false);
  });
});

describe('formatDateLabel', () => {
  it("names days relative to the pilot's today", () => {
    expect(formatDateLabel('2026-10-19', '2026-10-19')).toBe('today');
    expect(formatDateLabel('2026-10-20', '2026-10-19')).toBe('tomorrow');
    expect(formatDateLabel('2026-10-22', '2026-10-19')).toBe('Thursday');
  });
});
