import { describe, it, expect } from 'vitest';
import {
  parseMetarCsv,
  rainText,
  rainTrustOf,
  scoreTrackRecord,
  totalRecord,
  windText,
  windTrustOf,
  type HourlyForecast,
  type MonthRecord,
} from '../track-record';

const HEADER = 'station,valid,sknt,drct,wxcodes,p01i';

/** An hourly report at each listed hour of the day; wet hours report -RA. */
function metars(date: string, hours: number[], wet: number[] = [], knots = 10, drct = 270) {
  return hours.map((h) => {
    const t = `${date} ${String(h - 1).padStart(2, '0')}:53`;
    return `XXXX,${t},${knots},${drct},${wet.includes(h) ? '-RA' : 'M'},M`;
  });
}

/** A forecast for one day: rain (mm) at the given hours, 15 km/h from the west all day. */
function forecastDay(date: string, rain: Record<number, number> = {}): HourlyForecast {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return {
    time: hours.map((h) => `${date}T${String(h).padStart(2, '0')}:00`),
    precipitation: hours.map((h) => rain[h] ?? 0),
    windSpeed: hours.map(() => 15),
    windDirection: hours.map(() => 270),
  };
}

const DAY_HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // reports ending 08..19

describe('parseMetarCsv', () => {
  it('puts a report in the hour it falls in for rain, and the nearest hour for wind', () => {
    const obs = parseMetarCsv([HEADER, 'SKGO,2026-01-10 12:53,10,90,-SHRA,M'].join('\n'));
    expect(obs.get('2026-01-10T13:00')).toMatchObject({ reports: 1, wet: true });
    expect(obs.get('2026-01-10T13:00')?.wind?.speed).toBeCloseTo(18.52);
    expect(obs.get('2026-01-10T13:00')?.wind?.direction).toBe(90);
  });

  it('ignores showers in the vicinity, mist and recent rain', () => {
    const obs = parseMetarCsv(
      [
        HEADER,
        'SKGO,2026-01-10 12:00,5,90,VCSH,M',
        'SKGO,2026-01-10 13:00,5,90,BR,M',
        'SKGO,2026-01-10 14:00,5,90,RERA,M',
      ].join('\n'),
    );
    expect([...obs.values()].some((h) => h.wet)).toBe(false);
  });

  it('counts a trace of rain in the hourly amount as wet', () => {
    const obs = parseMetarCsv([HEADER, 'RNT,2026-07-01 14:53,4,0,M,T'].join('\n'));
    expect(obs.get('2026-07-01T15:00')?.wet).toBe(true);
  });
});

describe('scoreTrackRecord', () => {
  it('counts rain forecast, rain seen, and both, by month', () => {
    const csv = [
      HEADER,
      ...metars('2026-01-10', DAY_HOURS, [14]), // rain forecast and seen
      ...metars('2026-01-11', DAY_HOURS), // rain forecast, dry
      ...metars('2026-02-01', DAY_HOURS, [12]), // dry forecast, rain seen
    ].join('\n');
    const day = (date: string, rain: Record<number, number>) => forecastDay(date, rain);
    const days = [
      day('2026-01-10', { 14: 1.0 }),
      day('2026-01-11', { 15: 0.5 }),
      day('2026-02-01', {}),
    ];
    const forecast: HourlyForecast = {
      time: days.flatMap((d) => d.time),
      precipitation: days.flatMap((d) => d.precipitation),
      windSpeed: days.flatMap((d) => d.windSpeed),
      windDirection: days.flatMap((d) => d.windDirection),
    };
    const months = scoreTrackRecord(forecast, parseMetarCsv(csv));
    expect(months.map((m) => m.month)).toEqual([1, 2]);
    expect(months[0]).toMatchObject({
      days: 2,
      rainForecastDays: 2,
      rainSeenDays: 1,
      rainBothDays: 1,
    });
    expect(months[1]).toMatchObject({ days: 1, rainForecastDays: 0, rainSeenDays: 1 });
    // 15 km/h forecast against 10 kt (18.5 km/h) reported: 3.5 km/h low, right direction
    expect(months[0].windAbsErrorSum / months[0].windHours).toBeCloseTo(3.52);
    expect(months[0].directionRightHours).toBe(months[0].directionHours);
  });

  it('skips a day the airport barely reported', () => {
    const csv = [HEADER, ...metars('2026-01-10', [11, 12, 13])].join('\n');
    expect(scoreTrackRecord(forecastDay('2026-01-10'), parseMetarCsv(csv))).toEqual([]);
  });

  it('ignores rain under the amount the engine calls rain', () => {
    const csv = [HEADER, ...metars('2026-01-10', DAY_HOURS)].join('\n');
    const [m] = scoreTrackRecord(forecastDay('2026-01-10', { 14: 0.2 }), parseMetarCsv(csv));
    expect(m.rainForecastDays).toBe(0);
  });
});

function month(overrides: Partial<MonthRecord>): MonthRecord {
  return {
    month: 1,
    days: 31,
    rainForecastDays: 0,
    rainSeenDays: 0,
    rainBothDays: 0,
    windHours: 248,
    windAbsErrorSum: 248 * 4,
    windBiasSum: 0,
    directionHours: 100,
    directionRightHours: 85,
    ...overrides,
  };
}

describe('trust', () => {
  it('trusts rain forecasts that came true, like Washington airports', () => {
    expect(rainTrustOf(month({ rainForecastDays: 8, rainSeenDays: 9, rainBothDays: 6 }))).toBe(
      'good',
    );
  });

  it('calls rain forecasts poor when rain is forecast far more often than it falls', () => {
    // Pereira in the dry season: rain forecast on 79% of days, seen on 33%, 37% came true
    expect(rainTrustOf(month({ rainForecastDays: 24, rainSeenDays: 10, rainBothDays: 9 }))).toBe(
      'poor',
    );
  });

  it('says too little when rain was hardly forecast', () => {
    expect(rainTrustOf(month({ rainForecastDays: 2, rainBothDays: 2, rainSeenDays: 3 }))).toBe(
      'unknown',
    );
  });

  it('marks wind down a level when the direction is often wrong', () => {
    expect(windTrustOf(month({}))).toBe('good');
    expect(windTrustOf(month({ directionRightHours: 40 }))).toBe('fair');
    expect(windTrustOf(month({ windAbsErrorSum: 248 * 12 }))).toBe('poor');
  });
});

describe('texts', () => {
  it('says how often forecast rain fell, and the rain it missed', () => {
    expect(rainText(month({ rainForecastDays: 18, rainSeenDays: 5, rainBothDays: 4 }))).toBe(
      'The forecast called rain in the flying hours on 18 of 31 days, and rain fell on 4 of them. Rain also fell on 1 day that was forecast dry.',
    );
  });

  it('says how far off the wind was and which way it leans', () => {
    expect(windText(month({ windBiasSum: -248 * 4 }))).toBe(
      'Wind was off by 4 km/h on average. The forecast ran 4 km/h low. Its direction was within 45° 85% of the time.',
    );
  });

  it('adds months together for the year', () => {
    const t = totalRecord([month({ days: 10 }), month({ month: 2, days: 20 })]);
    expect(t).toMatchObject({ month: 0, days: 30, windHours: 496 });
  });
});
