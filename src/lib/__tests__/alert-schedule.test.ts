import { describe, it, expect } from 'vitest';
import { addDays, dueAlertRun, localDate, localHour, resolveTimeZone } from '../alert-schedule';

describe('localHour and localDate', () => {
  it('converts UTC to the local hour and date', () => {
    // 01:00 UTC on Oct 20 is 18:00 PDT on Oct 19 in Seattle
    const now = new Date('2026-10-20T01:00:00Z');
    expect(localHour(now, 'America/Los_Angeles')).toBe(18);
    expect(localDate(now, 'America/Los_Angeles')).toBe('2026-10-19');
    expect(localHour(now, 'Europe/Zurich')).toBe(3);
    expect(localDate(now, 'Europe/Zurich')).toBe('2026-10-20');
  });

  it('reports midnight as hour 0', () => {
    expect(localHour(new Date('2026-10-19T07:00:00Z'), 'America/Los_Angeles')).toBe(0);
  });
});

describe('dueAlertRun', () => {
  it('sends the morning run at the digest hour, in local time', () => {
    // 15:00 UTC is 08:00 PDT
    expect(dueAlertRun(new Date('2026-10-19T15:00:00Z'), 'America/Los_Angeles', '08:00')).toBe(
      'morning',
    );
    // Winter: 16:00 UTC is 08:00 PST
    expect(dueAlertRun(new Date('2026-12-19T16:00:00Z'), 'America/Los_Angeles', '08:00')).toBe(
      'morning',
    );
  });

  it('sends the evening run at 18:00 local', () => {
    expect(dueAlertRun(new Date('2026-10-20T01:00:00Z'), 'America/Los_Angeles', '08:00')).toBe(
      'evening',
    );
  });

  it('sends nothing in other hours', () => {
    // The old 06:00 UTC run: 23:00 in Seattle
    expect(dueAlertRun(new Date('2026-10-19T06:00:00Z'), 'America/Los_Angeles', '08:00')).toBe(
      null,
    );
  });

  it('falls back to Pacific time and 08:00', () => {
    expect(dueAlertRun(new Date('2026-10-19T15:00:00Z'), null, null)).toBe('morning');
    expect(resolveTimeZone('Not/AZone')).toBe('America/Los_Angeles');
  });

  it('uses only the hour of the digest time', () => {
    expect(dueAlertRun(new Date('2026-10-19T13:00:00Z'), 'America/Los_Angeles', '06:45')).toBe(
      'morning',
    );
  });
});

describe('addDays', () => {
  it('crosses month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-19', 0)).toBe('2026-10-19');
  });
});
