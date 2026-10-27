import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { WeekBoard, StatusLegend, type BoardRow } from '@/components/week-board';
import { ForecastCredit } from '@/components/data-credits';
import type {
  DashboardArea,
  NearYou,
  ShownArea,
  SiteForecastData,
} from '~/app/routes/_auth.dashboard';
import type { DayScore, Settings } from '@/types';
import { addDays } from '@/lib/alert-schedule';
import { compsOn } from '@/lib/comps';
import { bestSiteDay } from '@/lib/site-areas';
import { GOAL_LABEL } from '@/lib/site-goals';
import {
  STATUS_BADGE,
  STATUS_WORD,
  compareDays,
  dayLabel,
  dayStatus,
  dayTitle,
} from '@/lib/verdict-display';
import { MapPin, MapPinPlus, ArrowRight, Trophy } from 'lucide-react';

/** Build the detail-page URL for a site (launch sites use their slug). */
function siteHref(siteType: string, slug: string | undefined, siteId: string): string {
  return siteType === 'launch' && slug ? `/sites/${slug}` : `/sites/custom/${siteId}`;
}

/** A listed launch offered to a pilot who follows no sites yet, or none near where they are. */
export interface SuggestedSite {
  id: string;
  name: string;
  slug: string;
  elevation: number | null;
}

/** Listed launches as links to their pages. */
function SuggestedSites({ sites }: { sites: SuggestedSite[] }) {
  return (
    <div className="divide-y rounded-xl border bg-card">
      {sites.map((site) => (
        <Link
          key={site.id}
          to={`/sites/${site.slug}`}
          className="flex min-h-12 items-center gap-3 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent"
        >
          <MapPin className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{site.name}</div>
            {site.elevation != null && (
              <div className="text-xs text-muted-foreground">
                {site.elevation.toLocaleString('en-US')} m
              </div>
            )}
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

/** One chip per area, and All areas: Forecast shows one at a time. */
function AreaChips({ areas, shown }: { areas: DashboardArea[]; shown: ShownArea }) {
  // One area still shows, so the pilot sees where areas live and can split it
  const several = areas.length > 1;
  const chips = [
    ...areas.map((a) => ({ key: a.id, label: a.name })),
    ...(several ? [{ key: 'all', label: 'All areas' }] : []),
  ];
  return (
    <nav aria-label="Areas" className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => {
        const active = chip.key === shown.area;
        return (
          <Link
            key={chip.key}
            to={`?area=${encodeURIComponent(chip.key)}`}
            preventScrollReset
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'border-foreground bg-foreground text-background'
                : 'border-input bg-card hover:bg-accent'
            }`}
            aria-current={active ? 'true' : undefined}
          >
            {chip.label}
          </Link>
        );
      })}
      {several && shown.chosenBy === 'location' && (
        <span className="text-xs text-muted-foreground">Nearest to you</span>
      )}
      <Link
        to="/settings#areas"
        className="ml-1 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Edit areas
      </Link>
    </nav>
  );
}

/** A day worth knowing about: its best site, and how many sites are a go. */
interface BestDay {
  date: string;
  site: SiteForecastData;
  score: DayScore;
  goSites: number;
}

/** Each day's best site, best days first: a go, then the better flight. */
function bestDays(data: SiteForecastData[], dates: string[]): BestDay[] {
  const days: BestDay[] = [];
  for (const date of dates) {
    const best = bestSiteDay(
      data.map((d) => ({ site: d, scores: d.scores })),
      date,
    );
    if (!best || best.score.verdict === 'no') continue;
    const goSites = data.filter((d) => {
      const s = d.scores.find((x) => x.date === date);
      return s && dayStatus(s) === 'go';
    }).length;
    days.push({ date, site: best.site, score: best.score, goSites });
  }
  return days.sort((a, b) => compareDays(a.score, b.score));
}

/** The days to look at first this week, in date order. */
function BestDaysAhead({
  data,
  dates,
  today,
}: {
  data: SiteForecastData[];
  dates: string[];
  today: string;
}) {
  const ranked = bestDays(data, dates);
  const goDays = ranked.filter((d) => dayStatus(d.score) === 'go');
  const shown = (goDays.length > 0 ? goDays : ranked)
    .slice(0, 3)
    .sort((a, b) => a.date.localeCompare(b.date));
  const heading = goDays.length > 0 ? 'Best days ahead' : 'No go days this week';

  return (
    <section aria-label={heading} className="space-y-3">
      <h2 className="label-caps text-muted-foreground">{heading}</h2>
      {shown.length === 0 ? (
        <p className="rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground">
          Nothing is flyable at these sites in the next 7 days.
        </p>
      ) : (
        <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0">
          {shown.map((day) => {
            const status = dayStatus(day.score);
            const others = day.goSites - (status === 'go' ? 1 : 0);
            const climb =
              day.score.wStar != null && day.score.wStar > 0 && day.score.flight !== 'sled'
                ? `Climbs about ${day.score.wStar.toFixed(1)} m/s.`
                : null;
            const comp = compsOn(day.site.comps, day.date)[0];
            return (
              <Link
                key={day.date}
                to={siteHref(day.site.siteType, day.site.slug, day.site.site.id)}
                className="flex w-[78%] shrink-0 snap-start flex-col gap-1.5 rounded-2xl border bg-card px-4 py-3.5 transition-colors hover:border-primary/40 md:w-auto md:px-5 md:py-4"
              >
                <span className="text-[13px] font-semibold text-primary">
                  {dayLabel(day.date, today)}
                </span>
                <span className="truncate text-lg font-semibold">{day.site.site.name}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[status]}`}
                  >
                    {STATUS_WORD[status]}
                  </span>
                  <span className="truncate text-sm font-medium">{dayTitle(day.score)}</span>
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {[
                    climb,
                    others > 0
                      ? `Also a go at ${others === 1 ? '1 more site' : `${others} more sites`}.`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' ') || ' '}
                </span>
                {comp && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Trophy className="size-3.5 shrink-0" />
                    <span className="truncate">Comp on: {comp.name}</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface DashboardClientProps {
  data: SiteForecastData[];
  settings: Settings;
  isAuthenticated: boolean; // Always true since dashboard requires auth
  suggestions?: SuggestedSite[];
  /** The suggestions are near the pilot, not around Seattle */
  suggestionsNearYou?: boolean;
  areas?: DashboardArea[];
  shown?: ShownArea;
  nearYou?: NearYou | null;
}

function AddPrivateSite({ className = '' }: { className?: string }) {
  return (
    <Button variant="outline" asChild className={className}>
      <Link to="/sites/custom/new">
        <MapPinPlus className="size-4" />
        Add a private site
      </Link>
    </Button>
  );
}

export function DashboardClient({
  data,
  settings,
  isAuthenticated,
  suggestions = [],
  suggestionsNearYou = false,
  areas = [],
  shown = { area: null, chosenBy: 'size' },
  nearYou = null,
}: DashboardClientProps) {
  // Empty state when authenticated user has no sites
  if (data.length === 0 && isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-6 py-10 md:py-16">
        <div className="space-y-2">
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight md:text-[30px]">
            Welcome to SoarCast
          </h1>
          <p className="text-muted-foreground">
            Save the launches you fly. Forecast then shows which days this week are good at each
            one, and when. If a launch isn&apos;t listed, add it as a private site.
          </p>
        </div>
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              {suggestionsNearYou ? 'Launches near you' : 'Launches around Seattle'}
            </p>
            <SuggestedSites sites={suggestions} />
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link to="/sites">Find a site</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/sites/custom/new">
              <MapPinPlus className="size-4" />
              Add a private site
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // The week, from today where the sites are (the first site with a forecast)
  const today = (data.find((d) => d.scores.length > 0) ?? data[0]).today;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  // Alerts go out for go days within the alert window, at sites with alerts on
  const alertDay = (score: DayScore | null, siteId: string, dayIndex: number): boolean =>
    score != null &&
    (settings.notifications.sitePreferences[siteId] ?? true) &&
    dayIndex < settings.notifications.daysAhead &&
    score.goalMet === true;

  const rows: BoardRow[] =
    shown.area === 'all'
      ? areas.map((area) => {
          const sites = data.filter((d) => d.areaId === area.id);
          const comps = sites.flatMap((d) => d.comps);
          return {
            key: area.id,
            name: area.name,
            href: `?area=${encodeURIComponent(area.id)}`,
            meta: area.siteCount === 1 ? '1 site' : `${area.siteCount} sites`,
            cells: dates.map((date) => {
              const best = bestSiteDay(
                sites.map((d) => ({ site: d, scores: d.scores })),
                date,
              );
              return {
                date,
                score: best?.score ?? null,
                href: best
                  ? siteHref(best.site.siteType, best.site.slug, best.site.site.id)
                  : undefined,
                where: best?.site.site.name,
                comp: compsOn(comps, date)[0],
              };
            }),
          };
        })
      : data.map(({ site, scores, siteType, slug, error, comps }) => {
          const href = siteHref(siteType, slug, site.id);
          const meta =
            error ??
            [
              siteType === 'custom' ? 'Private' : null,
              `${site.elevation.toLocaleString('en-US')} m`,
              site.goal ? GOAL_LABEL[site.goal] : null,
            ]
              .filter(Boolean)
              .join(' · ');
          return {
            key: site.id,
            name: site.name,
            href,
            meta,
            cells: dates.map((date, i) => {
              const score = scores.find((s) => s.date === date) ?? null;
              return {
                date,
                score,
                href: score ? href : undefined,
                bell: alertDay(score, site.id, i),
                comp: compsOn(comps, date)[0],
              };
            }),
          };
        });

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <div>
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight md:text-[30px]">
              Forecast
            </h1>
            <p className="mt-1 text-[15px] text-muted-foreground">The next 7 days at saved sites</p>
          </div>
          {areas.length > 0 && <AreaChips areas={areas} shown={shown} />}
        </div>
        <AddPrivateSite className="hidden md:inline-flex" />
      </div>

      {nearYou && (
        <div className="max-w-md space-y-2">
          <p className="text-sm">
            No saved sites near {nearYou.city ?? 'you'}. Listed launches nearby:
          </p>
          <SuggestedSites sites={nearYou.sites} />
        </div>
      )}

      <BestDaysAhead data={data} dates={dates} today={today} />

      <div className="space-y-3">
        {shown.area === 'all' && (
          <p className="text-sm text-muted-foreground">
            Each area shows its best site each day. Open an area for all its sites.
          </p>
        )}
        <WeekBoard
          dates={dates}
          today={today}
          rows={rows}
          label={shown.area === 'all' ? 'The week in each area' : 'The week at each site'}
          firstColumn={shown.area === 'all' ? 'Area' : 'Site'}
        />
        <div className="px-1">
          <StatusLegend />
        </div>
      </div>

      <AddPrivateSite className="w-full md:hidden" />

      <ForecastCredit />
    </div>
  );
}
