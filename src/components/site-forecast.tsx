'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ForecastCredit } from '@/components/data-credits';
import { SiteGoalLine, type GoalTarget } from '@/components/site-goal-picker';
import { CompDayNotice } from '@/components/site-comps';
import { TypicalWeekLine } from '@/components/season-card';
import { WindgramLegend } from '@/components/windgram/windgram-legend';
import { altitudeRange } from '@/components/windgram/windgram-data';
import { useAttachTouchGestures } from '@/hooks/use-touch-gestures';
import { rainTrust } from '@/lib/forecast-engine';
import { addDays } from '@/lib/alert-schedule';
import { defaultGoal } from '@/lib/site-goals';
import {
  dayNumbers,
  feet,
  rainWord,
  riskWord,
  thermalWord,
  upperWindWord,
  type DayNumbers,
} from '@/lib/day-numbers';
import {
  STATUS_BADGE,
  STATUS_CELL,
  STATUS_WORD,
  cellLabel,
  dayName,
  daySentence,
  dayStatus,
  dayTitle,
  flightTime,
  longDate,
  shortDate,
  shortReason,
} from '@/lib/verdict-display';
import type { AtmosphericProfile } from '@/lib/weather-profile';
import type { Comp } from '@/lib/comps';
import type { DayScore, Site } from '@/types';

// d3 takes long to initialize, and Cloudflare caps the Worker's startup CPU,
// so the chart's module loads on first render instead of at startup.
const WindgramD3 = lazy(() =>
  import('@/components/windgram/windgram-d3').then((m) => ({ default: m.WindgramD3 })),
);

const chartSkeleton = <Skeleton className="h-[400px] w-full md:h-[500px] lg:h-[580px]" />;

function LazyWindgramD3(props: ComponentProps<typeof WindgramD3>) {
  return (
    <Suspense fallback={chartSkeleton}>
      <WindgramD3 {...props} />
    </Suspense>
  );
}

// Profiles already fetched in this tab, so moving between pages doesn't fetch again
const PROFILE_CACHE_MS = 5 * 60 * 1000;
const profileCache = new Map<string, { data: AtmosphericProfile; cachedAt: number }>();

/** The hour-by-hour profile behind the windgram and the day's numbers, fetched in the browser. */
function useProfile(latitude: number, longitude: number, days: number) {
  const [state, setState] = useState<{
    profile: AtmosphericProfile | null;
    failed: boolean;
  }>({ profile: null, failed: false });

  useEffect(() => {
    let live = true;
    const key = `${latitude.toFixed(3)},${longitude.toFixed(3)},${days}`;
    const cached = profileCache.get(key);
    if (cached && Date.now() - cached.cachedAt < PROFILE_CACHE_MS) {
      setState({ profile: cached.data, failed: false });
      return;
    }
    fetch(`/api/weather/profile?lat=${latitude}&lng=${longitude}&days=${days}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Profile: ${response.status}`);
        return response.json() as Promise<AtmosphericProfile>;
      })
      .then((data) => {
        profileCache.set(key, { data, cachedAt: Date.now() });
        if (live) setState({ profile: data, failed: false });
      })
      .catch(() => {
        if (live) setState({ profile: null, failed: true });
      });
    return () => {
      live = false;
    };
  }, [latitude, longitude, days]);

  return state;
}

/** Shown when Open-Meteo can't be reached and nothing is cached. */
export function ForecastUnavailable() {
  return (
    <Card className="gap-1 border-marginal-border bg-marginal p-5 text-marginal-foreground">
      <p className="font-semibold">Forecast unavailable right now</p>
      <p className="text-sm">The forecast service is busy. Reload the page in a minute.</p>
    </Card>
  );
}

interface SiteForecastProps {
  site: Site;
  scores: DayScore[];
  /** Today's date where the site is (YYYY-MM-DD) */
  today: string;
  /** Set when the pilot follows or owns the site, so they can change its goal */
  goalTarget?: GoalTarget;
  /** Comps held at the site, for a line when one is on this week */
  comps?: Comp[];
  /** Go days in a typical week here at this time of year, from the site's season */
  typicalWeek?: number | null;
}

/**
 * The week at a site: a tile for each day, then the chosen day in words, its
 * numbers and its windgram.
 */
export function SiteForecast({
  site,
  scores,
  today,
  goalTarget,
  comps = [],
  typicalWeek = null,
}: SiteForecastProps) {
  const week = useMemo(() => {
    const ahead = scores.filter((s) => s.date >= today);
    return (ahead.length > 0 ? ahead : scores).slice(0, 7);
  }, [scores, today]);
  const [selected, setSelected] = useState(week[0]?.date ?? today);
  const day = week.find((d) => d.date === selected) ?? week[0];
  const index = week.findIndex((d) => d.date === day?.date);

  const launchElevation = site.elevation > 0 ? site.elevation : undefined;
  const { profile, failed } = useProfile(site.latitude, site.longitude, 7);
  const numbers = useMemo(
    () =>
      profile && day
        ? dayNumbers(profile, day.date, day.flyableWindow, launchElevation ?? 0)
        : null,
    [profile, day, launchElevation],
  );

  const weekEnd = addDays(today, 6);
  const weekGoDays = week.filter((s) => s.date <= weekEnd && dayStatus(s) === 'go').length;
  const goal = site.goal ?? defaultGoal(site.kind);

  if (!day) return <ForecastUnavailable />;

  return (
    <section aria-label="Forecast" className="space-y-4">
      <DayStrip days={week} today={today} selected={day.date} onSelect={setSelected} />

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-8">
        <SiteGoalLine target={goalTarget} goal={goal} />
        <TypicalWeekLine weekGoDays={weekGoDays} typicalWeek={typicalWeek} />
      </div>

      <CompDayNotice comps={comps} today={today} />

      <Card className="gap-0 p-5 md:p-7" id="forecast-day" role="tabpanel">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
          <DayWords day={day} />
          <DayNumberGrid
            day={day}
            numbers={numbers}
            loading={!profile && !failed}
            lowRainTrust={rainTrust(site.latitude) === 'low'}
          />
        </div>
      </Card>

      <WindgramCard
        profile={profile}
        failed={failed}
        date={day.date}
        launchElevation={launchElevation}
        maxWindSpeed={site.maxWindSpeed}
        onPrevious={index > 0 ? () => setSelected(week[index - 1].date) : undefined}
        onNext={index < week.length - 1 ? () => setSelected(week[index + 1].date) : undefined}
      />
    </section>
  );
}

/** The week as a row of tiles, each in its day's color, choosing the day shown below. */
function DayStrip({
  days,
  today,
  selected,
  onSelect,
}: {
  days: DayScore[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Forecast days"
      className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-1 pb-2 md:mx-0 md:grid md:grid-cols-7 md:overflow-visible md:px-0 md:pb-0"
    >
      {days.map((day) => {
        const status = dayStatus(day);
        const isSelected = day.date === selected;
        const label = status === 'no' ? (shortReason(day) ?? STATUS_WORD.no) : cellLabel(day);
        const when =
          status === 'marginal' ? day.flyableWindow : status === 'no' ? null : flightTime(day);
        return (
          <button
            key={day.date}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="forecast-day"
            onClick={() => onSelect(day.date)}
            className={`relative flex min-h-[92px] w-[88px] shrink-0 snap-start flex-col items-start rounded-xl px-2.5 py-2 text-left transition md:w-auto md:px-3 ${STATUS_CELL[status]} ${
              isSelected ? 'outline-2 outline-offset-2 outline-foreground' : ''
            }`}
          >
            <span className="text-sm leading-tight font-semibold">{dayName(day.date, today)}</span>
            <span className="text-xs leading-tight opacity-80">{shortDate(day.date)}</span>
            <span className="mt-auto pt-2 text-[13px] leading-tight font-semibold">
              {status === 'no' && label !== STATUS_WORD.no && (
                <span className="sr-only">{STATUS_WORD.no}: </span>
              )}
              {label}
            </span>
            {when && <span className="text-[11px] leading-tight opacity-90">{when}</span>}
          </button>
        );
      })}
    </div>
  );
}

const REASONS_HEADING = {
  go: 'The rest of the day',
  flyable: 'The rest of the day',
  marginal: 'What to watch',
  no: 'What stops it',
} as const;

/** The chosen day in words: its date, word, flight and what limits the rest of it. */
function DayWords({ day }: { day: DayScore }) {
  const status = dayStatus(day);
  const sentence = daySentence(day);
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-primary">{longDate(day.date)}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={`inline-flex items-center rounded-sm px-2.5 py-1 text-[15px] font-bold ${STATUS_BADGE[status]}`}
        >
          {STATUS_WORD[status]}
        </span>
        <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{dayTitle(day)}</h2>
      </div>
      {sentence && <p className="text-[15px] leading-relaxed">{sentence}</p>}
      {day.reasons.length > 0 && (
        <div className="space-y-2 pt-1">
          <h3 className="label-caps text-muted-foreground">{REASONS_HEADING[status]}</h3>
          <ul className="space-y-1.5">
            {day.reasons.map((reason) => (
              <li key={reason} className="flex gap-2.5 text-sm leading-snug">
                <span className="mt-[5px] size-2 shrink-0 rounded-[2px] bg-marginal-border" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {day.rainNote && <p className="text-xs text-muted-foreground">{day.rainNote}</p>}
      {day.stormNote && <p className="text-xs text-muted-foreground">{day.stormNote}</p>}
    </div>
  );
}

function Num({
  label,
  value,
  alt,
  sub,
}: {
  label: string;
  /** Null while the forecast loads */
  value: ReactNode | null;
  /** The same value in other units, smaller */
  alt?: string | null;
  sub?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-muted/60 px-3.5 py-3">
      <span className="label-caps text-muted-foreground">{label}</span>
      {value === null ? (
        <Skeleton className="my-1 h-5 w-20 bg-border" />
      ) : (
        <span className="text-lg leading-tight font-semibold tabular-nums">
          {value}
          {alt && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{alt}</span>}
        </span>
      )}
      {sub && <span className="text-xs leading-snug text-muted-foreground">{sub}</span>}
    </div>
  );
}

const meters = (m: number) => `${m.toLocaleString('en-US')} m`;
const inFeet = (m: number) => `${feet(m).toLocaleString('en-US')} ft`;

/** The numbers behind the day: wind, thermals, heights and rain over its flyable hours. */
function DayNumberGrid({
  day,
  numbers,
  loading,
  lowRainTrust,
}: {
  day: DayScore;
  numbers: DayNumbers | null;
  loading: boolean;
  lowRainTrust: boolean;
}) {
  // Null while loading shows a placeholder; a dash when the forecast has nothing
  const fromProfile = <T,>(pick: (n: DayNumbers) => T): T | null | '–' =>
    numbers ? pick(numbers) : loading ? null : '–';
  const peak = day.peakCeilingMsl ?? null;
  const above = day.topOfLiftAboveLaunch ?? null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <Num
          label="Wind on launch"
          value={fromProfile((n) => `${n.launchWind} km/h ${n.launchDirection}`)}
          sub={numbers ? `Gusts to ${numbers.launchGust} km/h` : null}
        />
        <Num
          label="Thermals"
          value={day.wStar ? `${day.wStar.toFixed(1)} m/s` : 'None'}
          sub={thermalWord(day.wStar)}
        />
        <Num
          label="Top of lift"
          value={peak ? meters(peak) : 'None'}
          alt={peak ? inFeet(peak) : null}
          sub={above && above > 0 ? `${meters(above)} above launch` : null}
        />
        <Num
          label="Cloud base"
          value={fromProfile((n) => (n.cloudBaseMsl ? meters(n.cloudBaseMsl) : 'None'))}
          alt={numbers?.cloudBaseMsl ? inFeet(numbers.cloudBaseMsl) : null}
          sub={
            numbers
              ? numbers.cloudBaseMsl
                ? 'Where cumulus clouds form'
                : 'No cumulus clouds'
              : null
          }
        />
        <Num
          label="Wind at 1,500 m"
          value={fromProfile((n) => `${n.upperWind} km/h ${n.upperDirection}`)}
          sub={numbers ? upperWindWord(numbers.upperWind) : null}
        />
        <Num
          label="Chance of rain"
          value={fromProfile((n) => `${n.rainChance}%`)}
          sub={
            numbers
              ? lowRainTrust
                ? 'Models overstate it here'
                : rainWord(numbers.rainChance)
              : null
          }
        />
      </div>
      <dl className="grid grid-cols-3 gap-2.5 px-1 text-xs">
        <div>
          <dt className="text-muted-foreground">Overdevelopment</dt>
          <dd className="font-medium">{riskWord(day.odRisk)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Wind shear</dt>
          <dd className="font-medium">{riskWord(day.windShear)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Freezing level</dt>
          <dd className="font-medium">
            {numbers?.freezingLevelMsl ? meters(numbers.freezingLevelMsl) : loading ? '…' : '–'}
          </dd>
        </div>
      </dl>
      <p className="px-1 text-xs text-muted-foreground">
        {day.flyableWindow
          ? `Over the launch window, ${day.flyableWindow}.`
          : 'Over the daylight hours.'}
      </p>
    </div>
  );
}

/** The chosen day's windgram, with the full key folded away. Swipe it to change the day. */
function WindgramCard({
  profile,
  failed,
  date,
  launchElevation,
  maxWindSpeed,
  onPrevious,
  onNext,
}: {
  profile: AtmosphericProfile | null;
  failed: boolean;
  date: string;
  launchElevation?: number;
  maxWindSpeed?: number;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const swipeLeft = useCallback(() => onNext?.(), [onNext]);
  const swipeRight = useCallback(() => onPrevious?.(), [onPrevious]);
  useAttachTouchGestures(chartRef, { onSwipeLeft: swipeLeft, onSwipeRight: swipeRight });

  // One height scale for the whole week, so days compare at a glance
  const range = useMemo(
    () => (profile ? altitudeRange(profile, launchElevation) : undefined),
    [profile, launchElevation],
  );
  const dayProfile = useMemo(
    () =>
      profile ? { ...profile, hours: profile.hours.filter((h) => h.time.startsWith(date)) } : null,
    [profile, date],
  );

  return (
    <Card className="gap-3 p-4 md:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Windgram</h2>
        <Link
          to="/guide/reading-the-windgram"
          className="text-sm font-medium text-primary hover:underline"
        >
          How to read it
        </Link>
      </div>
      <p className="-mt-1 text-sm text-muted-foreground">
        {longDate(date)}. Wind, temperature and thermals from the ground up, hour by hour.
      </p>

      <div ref={chartRef}>
        {failed ? (
          <p className="rounded-xl bg-muted p-4 text-sm">
            The windgram can&apos;t load right now. The forecast service is busy. Reload the page in
            a minute.
          </p>
        ) : dayProfile && dayProfile.hours.length > 0 ? (
          <div key={date} className="animate-in fade-in duration-300">
            <LazyWindgramD3
              data={dayProfile}
              loading={false}
              launchElevation={launchElevation}
              maxWindSpeed={maxWindSpeed}
              range={range}
            />
            {(onPrevious || onNext) && (
              <p className="text-xs text-muted-foreground md:hidden">
                Swipe the chart to change the day.
              </p>
            )}
          </div>
        ) : dayProfile ? (
          <p className="rounded-xl bg-muted p-4 text-sm">No windgram for this day yet.</p>
        ) : (
          chartSkeleton
        )}
      </div>

      <details className="group rounded-xl border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium select-none">
          All colors and symbols
        </summary>
        <div className="pt-3">
          <WindgramLegend maxWindSpeed={maxWindSpeed} />
        </div>
      </details>
      <ForecastCredit />
    </Card>
  );
}
