// Flown-day check: rates the last two years at well-flown launches the way
// the season build does, and lines the days up with the days pilots flew
// (SoarCast's /api/flown-days, from Syncing Pilots' trackers). It prints how
// the ratings did, and for the days rated below Go, the weather the engine
// saw. A run on main saves its ratings as the baseline. A run on a branch
// compares its ratings with that baseline day by day: the days a change
// moves up to Go, or down from it, and how often pilots flew them.
//
// Runs in the "Flown-day check" workflow: Open-Meteo is out of reach from
// Claude's sandbox. The archived forecasts are cached in FLOWN_CACHE between
// runs, so only the first run at a launch spends Open-Meteo calls (about 240
// a launch). The repo is public: the log gives counts per launch and across
// launches, never dates.
//
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (to find the launches in
// pgsites); FLOWN_CACHE (default .cache/flown-check); FLOWN_CALL_BUDGET
// (default 4500, under Open-Meteo's 5,000 an hour); FLOWN_MIN_DAYS (default
// 10 flown days); FLOWN_SITES: more pgsites ids, comma-separated;
// FLOWN_BASELINE: "save" (on main) or "compare" (on a branch).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  evaluateDays,
  evaluateHours,
  launchProfileFromSite,
  THERMAL_MIN_WSTAR,
  type HourVerdict,
  type LaunchProfile,
} from '../../src/lib/forecast-engine';
import { angleDifference } from '../../src/lib/forecast-engine/gates';
import {
  profileFromOpenMeteo,
  type AtmosphericProfile,
  type OpenMeteoProfileResponse,
} from '../../src/lib/weather-profile';
import { seasonDayFromScore, seasonStatus, type SeasonDay } from '../../src/lib/seasons';
import { soaringDay, type FlownDay } from '../../src/lib/flown-days';
import type { DayStatus } from '../../src/lib/verdict-display';
import type { DayScore } from '../../src/types';
import {
  ACCOUNT,
  PG_COLUMNS,
  PGSITES_DB,
  TOKEN,
  callWeight,
  chunks,
  cleanProfile,
  d1,
  destinationJobs,
  fetchChunk,
  jobFor,
  merge,
  seasonRange,
  siteFromPgRow,
  type Job,
  type PgRow,
} from './lib';

const CACHE = process.env.FLOWN_CACHE || '.cache/flown-check';
const BUDGET = Number(process.env.FLOWN_CALL_BUDGET || 4500);
const MIN_DAYS = Number(process.env.FLOWN_MIN_DAYS || 10);
const EXTRA_SITES = (process.env.FLOWN_SITES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const BASELINE_MODE = process.env.FLOWN_BASELINE === 'save' ? 'save' : 'compare';
const BASELINE_FILE = `${CACHE}/baseline.json.gz`;
const SOARCAST = 'https://soarcast.mckinleyaviation.com';

/** One day's rating next to whether, and how, pilots flew it. */
interface RatedDay {
  score: DayScore;
  season: SeasonDay;
  status: DayStatus; // as a launch: Go when the launch is safe, whatever the flight
  hours: HourVerdict[]; // daylight hours
  flown: FlownDay | null;
}

interface Launch {
  job: Job;
  launch: LaunchProfile;
  /** Launch height above the forecast's ground, m */
  aboveModel: number;
  days: RatedDay[];
  /** Share of the launch's Go days that someone flew, and of its soaring Go days that someone soared */
  goRate: number;
  soarRate: number;
}

// ---------------------------------------------------------------- inputs

async function extraJobs(): Promise<Job[]> {
  if (EXTRA_SITES.length === 0) return [];
  const rows = (await d1(
    PGSITES_DB,
    'query',
    `SELECT ${PG_COLUMNS} FROM sites WHERE id IN (${EXTRA_SITES.map(() => '?').join(',')})`,
    EXTRA_SITES,
  )) as PgRow[];
  return rows.map((row) =>
    jobFor(`pg:${row.id}`, siteFromPgRow(row), {
      label: row.name,
      name: row.name,
      countryCode: row.country_code.toLowerCase(),
      destination: null,
    }),
  );
}

async function flownDays(siteId: string): Promise<FlownDay[] | null> {
  const res = await fetch(`${SOARCAST}/api/flown-days?site=${siteId}`, {
    headers: { 'User-Agent': 'soarcast-flown-check', Accept: 'application/json' },
  });
  if (!res.ok) {
    console.log(`  flown days: HTTP ${res.status}`);
    return null;
  }
  const body = (await res.json()) as { days?: FlownDay[] };
  return body.days ?? null;
}

/** The launch's archived forecasts, from the cache or from Open-Meteo while the budget lasts. */
async function archivedForecast(
  job: Job,
  budget: { spent: number },
): Promise<OpenMeteoProfileResponse | null> {
  const range = seasonRange();
  const file = `${CACHE}/${job.site.id}_${range.from}_${range.to}.json.gz`;
  if (existsSync(file)) return JSON.parse(gunzipSync(readFileSync(file)).toString());
  const parts = chunks(range);
  const cost = parts.reduce((s, p) => s + callWeight(p), 0);
  if (budget.spent + cost > BUDGET) return null;
  const responses: OpenMeteoProfileResponse[] = [];
  for (const part of parts) {
    responses.push(await fetchChunk(job.site.latitude, job.site.longitude, part));
    budget.spent += callWeight(part);
  }
  const merged = merge(responses);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, gzipSync(JSON.stringify(merged)));
  return merged;
}

function rate(job: Job, profile: AtmosphericProfile, flown: FlownDay[]): Launch {
  const launch = launchProfileFromSite(job.site);
  const byDate = new Map(flown.map((d) => [d.date, d]));
  const hoursByDate = new Map<string, HourVerdict[]>();
  for (const h of evaluateHours(profile, launch)) {
    if (h.gates.some((g) => g.gate === 'daylight' && g.status === 'fail')) continue;
    const date = h.time.slice(0, 10);
    if (!hoursByDate.has(date)) hoursByDate.set(date, []);
    hoursByDate.get(date)!.push(h);
  }
  const days = evaluateDays(profile, launch).map((score) => {
    const season = seasonDayFromScore(score);
    return {
      score,
      season,
      status: seasonStatus(season, 'launch'),
      hours: hoursByDate.get(score.date) ?? [],
      flown: byDate.get(score.date) ?? null,
    };
  });
  const goDays = days.filter((d) => d.status === 'go');
  const soarGo = days.filter((d) => expectsSoaring(d));
  return {
    job,
    launch,
    aboveModel: launch.elevation - profile.elevation,
    days,
    goRate: share(goDays.filter((d) => d.flown).length, goDays.length),
    soarRate: share(soarGo.filter((d) => d.flown && soaringDay(d.flown)).length, soarGo.length),
  };
}

const share = (part: number, whole: number) => (whole > 0 ? part / whole : 0);
const pct = (part: number, whole: number) => `${Math.round(share(part, whole) * 100)}%`;

function expectsSoaring(d: RatedDay): boolean {
  return d.score.verdict === 'go' && !!d.score.flight && d.score.flight !== 'sled';
}

// ---------------------------------------------------------------- tallies

/**
 * Days split by one measure into bins. Each day counts whether pilots flew
 * it, and how often a Go day at its launch was flown: "as often as Go days"
 * near 1 means pilots flew those days like Go days, so a rule that holds
 * them back is too strict there.
 */
class Tally {
  private bins = new Map<string, { days: number; flown: number; expected: number }>();
  constructor(
    readonly title: string,
    private readonly order: string[],
  ) {}
  add(bin: string, flown: boolean, expected: number) {
    const b = this.bins.get(bin) ?? { days: 0, flown: 0, expected: 0 };
    b.days++;
    if (flown) b.flown++;
    b.expected += expected;
    this.bins.set(bin, b);
  }
  print() {
    if (this.bins.size === 0) return;
    console.log(`  ${this.title}`);
    const keys = [
      ...this.order.filter((k) => this.bins.has(k)),
      ...[...this.bins.keys()].filter((k) => !this.order.includes(k)),
    ];
    for (const k of keys) {
      const b = this.bins.get(k)!;
      const ratio = b.expected > 0 ? (b.flown / b.expected).toFixed(2) : '-';
      console.log(
        `    ${k.padEnd(22)} ${String(b.days).padStart(6)} days ${String(b.flown).padStart(5)} flown   x${ratio} as often as Go days`,
      );
    }
  }
}

function bin(value: number | null, edges: number[], unit = ''): string {
  if (value === null || Number.isNaN(value)) return 'unknown';
  for (let i = 0; i < edges.length; i++) {
    if (value < edges[i])
      return i === 0 ? `under ${edges[0]}${unit}` : `${edges[i - 1]}-${edges[i]}${unit}`;
  }
  return `${edges[edges.length - 1]}${unit} or more`;
}
const binOrder = (edges: number[], unit = '') => [
  `under ${edges[0]}${unit}`,
  ...edges.slice(1).map((e, i) => `${edges[i]}-${e}${unit}`),
  `${edges[edges.length - 1]}${unit} or more`,
];

/** The hour the engine liked best in a day: fewest failing then marginal checks, nearest early afternoon. */
function bestHour(hours: HourVerdict[], gate?: string): HourVerdict | null {
  const candidates = gate
    ? hours.filter((h) => h.gates.some((g) => g.gate === gate && g.status !== 'pass'))
    : hours;
  const pool = candidates.length > 0 ? candidates : hours;
  let best: HourVerdict | null = null;
  let bestKey = Infinity;
  for (const h of pool) {
    const fails = h.gates.filter((g) => g.status === 'fail').length;
    const marginals = h.gates.filter((g) => g.status === 'marginal').length;
    const key = fails * 100 + marginals * 10 + Math.abs(h.hour - 13) / 24;
    if (key < bestKey) {
      bestKey = key;
      best = h;
    }
  }
  return best;
}

const SPEED = [10, 15, 20, 30];
const OFF = [45, 67.5, 90, 135];
const GUST = [0, 10, 20, 30];
const SPREAD = [10, 15, 20, 25, 35];
const CAPE = [500, 1000, 1500, 2500];
const LI = [-6, -4, -2, 0];
const CHANCE = [30, 60];
const HOUR = [10, 12, 14, 16];
const CLEAR = [0, 150, 500];
const LIFT = [0, 250, 500, 1000];
const WSTAR = [1, 1.5, 2, 3];
const ABOVE = [0, 300, 600, 1000];

function newTallies() {
  return {
    window: new Tally('Daylight hours that pass every check', binOrder([1, 2, 4, 6], ' h')),
    direction: {
      speed: new Tally('Wind at launch (km/h)', binOrder(SPEED)),
      off: new Tally('Degrees off the nearest listed direction', binOrder(OFF, '°')),
      thermic: new Tally('Thermals at that hour', ['climbable', 'none']),
    },
    gusts: {
      over: new Tally('Gusts over the launch limit (km/h)', binOrder(GUST)),
      spread: new Tally('Gusts over the mean wind (km/h)', binOrder(SPREAD)),
      thermic: new Tally('Thermals at that hour', ['climbable', 'none']),
    },
    storm: {
      cape: new Tally('Storm energy, CAPE (J/kg)', binOrder(CAPE)),
      li: new Tally('Lifted index', binOrder(LI)),
      chance: new Tally('Chance of rain (%)', binOrder(CHANCE, '%')),
      first: new Tally('First hour with storm risk', binOrder(HOUR, 'h')),
    },
    cloud: {
      clear: new Tally('Cloud base above launch (m)', binOrder(CLEAR)),
    },
    soaring: {
      why: new Tally('Why no soaring was expected', []),
      lift: new Tally('Top of lift above launch (m), peak of the day', binOrder(LIFT)),
      wstar: new Tally('Thermal strength (m/s), peak of the day', binOrder(WSTAR)),
      above: new Tally('Launch above the forecast ground (m)', binOrder(ABOVE)),
    },
  };
}

// ---------------------------------------------------------------- baseline

/** One day as saved in the baseline: [status, soaring expected, flown, soared, gate or sled reason]. */
type SavedDay = [DayStatus, 0 | 1, 0 | 1, 0 | 1, string];

interface SavedLaunch {
  name: string;
  goRate: number;
  soarRate: number;
  days: Record<string, SavedDay>;
}

interface Baseline {
  sha: string;
  launches: Record<string, SavedLaunch>;
}

function snapshot(launches: Launch[]): Baseline {
  const out: Baseline = { sha: (process.env.GITHUB_SHA ?? 'local').slice(0, 7), launches: {} };
  for (const l of launches) {
    const days: Record<string, SavedDay> = {};
    for (const d of l.days) {
      days[d.score.date] = [
        d.status,
        expectsSoaring(d) ? 1 : 0,
        d.flown ? 1 : 0,
        d.flown && soaringDay(d.flown) ? 1 : 0,
        d.status !== 'go' ? (d.season.gate ?? 'other') : `sled: ${d.score.sled?.reason ?? '-'}`,
      ];
    }
    out.launches[l.job.site.id] = {
      name: l.job.name ?? '',
      goRate: l.goRate,
      soarRate: l.soarRate,
      days,
    };
  }
  return out;
}

/** Days that moved one way, counted by a label, with how often pilots flew them. */
class Moves {
  private by = new Map<string, { days: number; flown: number; expected: number }>();
  add(label: string, flown: boolean, expected: number) {
    for (const key of ['all', label]) {
      const m = this.by.get(key) ?? { days: 0, flown: 0, expected: 0 };
      m.days++;
      if (flown) m.flown++;
      m.expected += expected;
      this.by.set(key, m);
    }
  }
  print(title: string, unit: string) {
    const all = this.by.get('all');
    if (!all) return console.log(`  ${title}: none`);
    const line = (m: { days: number; flown: number; expected: number }) =>
      `${String(m.days).padStart(6)} days ${String(m.flown).padStart(5)} ${unit}  x${m.expected > 0 ? (m.flown / m.expected).toFixed(2) : '-'}`;
    console.log(`  ${title}: ${line(all)}`);
    for (const [k, m] of [...this.by]
      .filter(([k]) => k !== 'all')
      .sort((a, b) => b[1].days - a[1].days))
      console.log(`    ${k.padEnd(24)} ${line(m)}`);
  }
}

function compare(base: Baseline, launches: Launch[]) {
  const now = snapshot(launches);
  const ids = Object.keys(now.launches).filter((id) => base.launches[id]);
  console.log(`\nCOMPARED WITH MAIN (baseline ${base.sha}, ${ids.length} launches in both)`);
  console.log(
    "(x1.00 means the moved days were flown as often as the launch's Go days on main, or soared as often as its soaring days)",
  );
  const up = new Moves();
  const down = new Moves();
  const soarUp = new Moves();
  const soarDown = new Moves();
  const count = { go: [0, 0], flownGo: [0, 0], flown: 0, soarExp: [0, 0], soared: 0 };
  const perLaunch: string[] = [];
  for (const id of ids) {
    const b = base.launches[id];
    const n = now.launches[id];
    const moved = { up: 0, upFlown: 0, down: 0, downFlown: 0, soarUp: 0, soarUpFlown: 0 };
    for (const [date, nd] of Object.entries(n.days)) {
      const bd = b.days[date];
      if (!bd) continue;
      const [bStatus, bSoar, flown, soared, bWhy] = bd;
      const [nStatus, nSoar, , , nWhy] = nd;
      count.go[0] += Number(bStatus === 'go');
      count.go[1] += Number(nStatus === 'go');
      count.flownGo[0] += Number(flown && bStatus === 'go');
      count.flownGo[1] += Number(flown && nStatus === 'go');
      count.flown += flown;
      count.soarExp[0] += Number(soared && bSoar);
      count.soarExp[1] += Number(soared && nSoar);
      count.soared += soared;
      if (bStatus !== 'go' && nStatus === 'go') {
        up.add(bWhy, !!flown, b.goRate);
        moved.up++;
        moved.upFlown += flown;
      } else if (bStatus === 'go' && nStatus !== 'go') {
        down.add(nWhy, !!flown, b.goRate);
        moved.down++;
        moved.downFlown += flown;
      }
      if (!bSoar && nSoar) {
        soarUp.add(bWhy, !!soared, b.soarRate);
        moved.soarUp++;
        moved.soarUpFlown += soared;
      } else if (bSoar && !nSoar) {
        soarDown.add(nWhy, !!soared, b.soarRate);
      }
    }
    const ratio = (part: number, days: number, rate: number) =>
      days > 0 && rate > 0 ? `x${(part / (days * rate)).toFixed(2)}` : '-';
    if (moved.up + moved.down + moved.soarUp > 0)
      perLaunch.push(
        `    ${b.name.slice(0, 32).padEnd(32)} Go ${(Math.round(b.goRate * 100) + '%').padStart(4)} ` +
          `up ${String(moved.up).padStart(4)} days ${String(moved.upFlown).padStart(3)} flown ${ratio(moved.upFlown, moved.up, b.goRate).padStart(6)}, ` +
          `down ${String(moved.down).padStart(3)} | soaring up ${String(moved.soarUp).padStart(4)} days ${String(moved.soarUpFlown).padStart(3)} soared ${ratio(moved.soarUpFlown, moved.soarUp, b.soarRate).padStart(6)}`,
      );
  }
  const years = ids.length * 2;
  console.log(
    `  Go days a launch's year: ${(count.go[0] / years).toFixed(0)} -> ${(count.go[1] / years).toFixed(0)}`,
  );
  console.log(
    `  flown days rated Go: ${pct(count.flownGo[0], count.flown)} -> ${pct(count.flownGo[1], count.flown)}`,
  );
  console.log(
    `  Go days flown: ${pct(count.flownGo[0], count.go[0])} -> ${pct(count.flownGo[1], count.go[1])}`,
  );
  console.log(
    `  soaring expected on days pilots soared: ${pct(count.soarExp[0], count.soared)} -> ${pct(count.soarExp[1], count.soared)}`,
  );
  up.print('Up to Go, by what held them back on main', 'flown');
  down.print('Down from Go, by what holds them back now', 'flown');
  soarUp.print('Soaring now expected, by why not on main', 'soared');
  soarDown.print('Soaring no longer expected, by why not now', 'soared');
  if (perLaunch.length > 0) {
    console.log("  By launch (Go: share of the launch's Go days flown on main):");
    perLaunch.forEach((l) => console.log(l));
  }
}

function baseline(launches: Launch[]) {
  if (BASELINE_MODE === 'save') {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(BASELINE_FILE, gzipSync(JSON.stringify(snapshot(launches))));
    console.log(`\nSaved these ratings as the baseline for branch runs.`);
    return;
  }
  if (!existsSync(BASELINE_FILE)) {
    console.log('\nNo baseline from main yet: run the check on main first.');
    return;
  }
  compare(JSON.parse(gunzipSync(readFileSync(BASELINE_FILE)).toString()) as Baseline, launches);
}

// ---------------------------------------------------------------- main

async function main() {
  if (!ACCOUNT || !TOKEN)
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are needed');
  const range = seasonRange();
  console.log(
    `Flown-day check, ${range.from} to ${range.to}, launches with ${MIN_DAYS}+ flown days`,
  );

  const jobs = [...(await extraJobs()), ...(await destinationJobs())];
  const withFlown: Array<{ job: Job; flown: FlownDay[] }> = [];
  for (const job of jobs) {
    const flown = await flownDays(job.site.id);
    const inRange = (flown ?? []).filter((d) => d.date >= range.from && d.date <= range.to);
    if (inRange.length >= MIN_DAYS) withFlown.push({ job, flown: inRange });
  }
  withFlown.sort((a, b) => b.flown.length - a.flown.length);
  console.log(`${jobs.length} launches, ${withFlown.length} with enough flown days`);

  const budget = { spent: 0 };
  const launches: Launch[] = [];
  let waiting = 0;
  for (const { job, flown } of withFlown) {
    try {
      const raw = await archivedForecast(job, budget);
      if (!raw) {
        waiting++;
        continue;
      }
      launches.push(rate(job, cleanProfile(profileFromOpenMeteo(raw)), flown));
    } catch (error) {
      console.log(`${job.name}: failed, ${error instanceof Error ? error.message : error}`);
      if (String(error).includes('Open-Meteo 429')) break;
    }
  }
  console.log(
    `Rated ${launches.length} launches (~${budget.spent.toFixed(0)} Open-Meteo calls)${waiting ? `, ${waiting} wait for the next run` : ''}\n`,
  );

  // Per launch
  console.log('LAUNCHES (as a launch: Go when safe to launch)');
  console.log(
    `${'launch'.padEnd(32)} flown | Go  Marg  No  | Go flown  No flown | soaring  expected`,
  );
  for (const l of launches) {
    const flownDays = l.days.filter((d) => d.flown);
    const by = (s: DayStatus) => flownDays.filter((d) => d.status === s).length;
    const rated = (s: DayStatus) => l.days.filter((d) => d.status === s);
    const soaring = flownDays.filter((d) => soaringDay(d.flown!));
    console.log(
      `${(l.job.name ?? '').slice(0, 32).padEnd(32)} ${String(flownDays.length).padStart(5)} | ` +
        `${String(by('go')).padStart(3)} ${String(by('marginal')).padStart(4)} ${String(by('no')).padStart(4)} | ` +
        `${pct(rated('go').filter((d) => d.flown).length, rated('go').length).padStart(8)} ${pct(rated('no').filter((d) => d.flown).length, rated('no').length).padStart(9)} | ` +
        `${String(soaring.length).padStart(7)} ${pct(soaring.filter(expectsSoaring).length, soaring.length).padStart(9)}`,
    );
  }

  // Across launches
  const all = launches.flatMap((l) => l.days.map((d) => ({ ...d, l })));
  const flown = all.filter((d) => d.flown);
  console.log('\nACROSS LAUNCHES');
  for (const s of ['go', 'marginal', 'no'] as DayStatus[]) {
    const rated = all.filter((d) => d.status === s);
    const f = rated.filter((d) => d.flown).length;
    console.log(
      `  ${s.padEnd(9)} ${String(rated.length).padStart(6)} days, ${String(f).padStart(5)} flown (${pct(f, rated.length)}), ${pct(f, flown.length)} of flown days`,
    );
  }
  const held = new Map<string, number>();
  for (const d of flown)
    if (d.status !== 'go')
      held.set(d.season.gate ?? 'other', (held.get(d.season.gate ?? 'other') ?? 0) + 1);
  console.log(
    `  flown days held back by: ${[...held]
      .sort((a, b) => b[1] - a[1])
      .map(([g, n]) => `${g} ${n}`)
      .join(', ')}`,
  );
  const soaringFlown = flown.filter((d) => soaringDay(d.flown!));
  console.log(
    `  soaring expected on ${pct(soaringFlown.filter(expectsSoaring).length, soaringFlown.length)} of ${soaringFlown.length} days pilots soared`,
  );
  const perYear = (s: DayStatus) =>
    (all.filter((d) => d.status === s).length / launches.length / 2).toFixed(0);
  console.log(
    `  a launch's year: ${perYear('go')} Go, ${perYear('marginal')} Marginal, ${perYear('no')} Not flyable days`,
  );

  // Why days were held back: the weather the engine saw
  const t = newTallies();
  for (const d of all) {
    const flewIt = !!d.flown;
    const w = d.l.goRate;
    if (d.status !== 'go') {
      const passing = d.hours.filter((h) => h.status === 'pass').length;
      t.window.add(bin(passing, [1, 2, 4, 6], ' h'), flewIt, w);
      const gate = d.season.gate;
      const h = gate ? bestHour(d.hours, gate) : null;
      if (h && gate === 'direction') {
        const c = h.conditions;
        const dirs = [...d.l.launch.goodDirections, ...d.l.launch.okDirections];
        const off = dirs.length
          ? Math.min(...dirs.map((x) => angleDifference(c.windDirection, x)))
          : null;
        t.direction.speed.add(bin(c.windSpeed, SPEED), flewIt, w);
        t.direction.off.add(bin(off, OFF, '°'), flewIt, w);
        t.direction.thermic.add(
          (c.wStar ?? 0) >= THERMAL_MIN_WSTAR ? 'climbable' : 'none',
          flewIt,
          w,
        );
      }
      if (h && gate === 'gusts') {
        const c = h.conditions;
        t.gusts.over.add(bin(c.windGust - d.l.launch.maxWindSpeed, GUST), flewIt, w);
        t.gusts.spread.add(bin(c.windGust - c.windSpeed, SPREAD), flewIt, w);
        t.gusts.thermic.add((c.wStar ?? 0) >= THERMAL_MIN_WSTAR ? 'climbable' : 'none', flewIt, w);
      }
      if (h && gate === 'storm') {
        const c = h.conditions;
        t.storm.cape.add(bin(c.cape, CAPE), flewIt, w);
        t.storm.li.add(bin(c.liftedIndex, LI), flewIt, w);
        t.storm.chance.add(bin(c.precipitationProbability, CHANCE, '%'), flewIt, w);
        const first = d.hours.find((x) =>
          x.gates.some((g) => g.gate === 'storm' && g.status !== 'pass'),
        );
        t.storm.first.add(bin(first ? first.hour : null, HOUR, 'h'), flewIt, w);
      }
      if (h && gate === 'cloud') {
        const c = h.conditions;
        t.cloud.clear.add(
          bin(c.cloudBaseMsl === null ? null : c.cloudBaseMsl - d.l.launch.elevation, CLEAR),
          flewIt,
          w,
        );
      }
    }
    if (!expectsSoaring(d) && d.score.verdict !== 'no') {
      const soared = !!d.flown && soaringDay(d.flown);
      const sw = d.l.soarRate;
      t.soaring.why.add(
        d.score.verdict !== 'go'
          ? `held back: ${d.season.gate ?? 'other'}`
          : `sled: ${d.score.sled?.reason ?? '?'}`,
        soared,
        sw,
      );
      const tops = d.hours
        .map((x) => x.conditions.topOfLiftMsl)
        .filter((v): v is number => v !== null);
      t.soaring.lift.add(
        bin(tops.length ? Math.max(...tops) - d.l.launch.elevation : null, LIFT),
        soared,
        sw,
      );
      t.soaring.wstar.add(
        bin(Math.max(0, ...d.hours.map((x) => x.conditions.wStar ?? 0)), WSTAR),
        soared,
        sw,
      );
      t.soaring.above.add(bin(d.l.aboveModel, ABOVE), soared, sw);
    }
  }

  console.log('\nDAYS BELOW GO, by what the engine saw at its best hour that day');
  console.log(
    "(as often as Go days: x1.00 means pilots flew those days as often as the launch's Go days)",
  );
  t.window.print();
  for (const [gate, tallies] of Object.entries({
    direction: t.direction,
    gusts: t.gusts,
    storm: t.storm,
    cloud: t.cloud,
  })) {
    console.log(` held back by ${gate}:`);
    for (const tally of Object.values(tallies)) tally.print();
  }
  console.log('\nDAYS WITH NO SOARING EXPECTED (flyable ones), and how often pilots soared them');
  console.log('(x1.00 means as often as days the engine expected soaring)');
  for (const tally of Object.values(t.soaring)) tally.print();

  baseline(launches);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
