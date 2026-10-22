import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { VerdictCell } from '@/components/verdict-cell';
import { SiteCard } from '@/components/dashboard/site-card';
import { ForecastCredit } from '@/components/data-credits';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  STATUS_BADGE,
  STATUS_DOT,
  STATUS_WORD,
  compareDays,
  dayHeadline,
  dayName,
  dayStatus,
  shortDate,
} from '@/lib/verdict-display';
import { LayoutGrid, Table, MapPin, MapPinPlus, ArrowRight } from 'lucide-react';

/** Build the detail-page URL for a site (launch sites use their slug). */
function siteHref(siteType: string, slug: string | undefined, siteId: string): string {
  return siteType === 'launch' && slug ? `/sites/${slug}` : `/sites/custom/${siteId}`;
}

/** What the colors mean: a go is set by each site's goal. */
function StatusLegend() {
  const items: Array<[keyof typeof STATUS_WORD, string]> = [
    ['go', 'Go: the flying you want there'],
    ['flyable', 'Flyable, but less than you want'],
    ['marginal', 'Marginal'],
    ['no', 'Not flyable'],
  ];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([status, text]) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
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
    <div className="space-y-2">
      {sites.map((site) => (
        <Link
          key={site.id}
          to={`/sites/${site.slug}`}
          className="flex items-center gap-2 rounded-md border border-border p-3 transition-colors hover:bg-accent"
        >
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{site.name}</div>
            {site.elevation != null && (
              <div className="text-xs text-muted-foreground">
                {site.elevation.toLocaleString('en-US')} m
              </div>
            )}
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

/** One chip per area, and All areas: the dashboard shows one at a time. */
function AreaChips({ areas, shown }: { areas: DashboardArea[]; shown: ShownArea }) {
  // One area still shows, so the pilot sees where areas live and can split it
  const several = areas.length > 1;
  const chips = [
    ...areas.map((a) => ({ key: a.id, label: a.name })),
    ...(several ? [{ key: 'all', label: 'All areas' }] : []),
  ];
  return (
    <nav aria-label="Areas" className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => {
        const active = chip.key === shown.area;
        return (
          <Link
            key={chip.key}
            to={`?area=${encodeURIComponent(chip.key)}`}
            preventScrollReset
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-accent'
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
        className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Edit areas
      </Link>
    </nav>
  );
}

/** Every area side by side: each day is its best site that day. */
function AreasTable({
  areas,
  data,
  dates,
  today,
}: {
  areas: DashboardArea[];
  data: SiteForecastData[];
  dates: string[];
  today: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="py-3 px-4 text-left font-semibold min-w-[160px] sticky left-0 bg-background z-10">
              Area
            </th>
            {dates.map((date) => (
              <th key={date} className="py-3 px-1 text-center font-semibold min-w-[76px]">
                <div className="text-sm">{dayName(date, today)}</div>
                <div className="text-xs text-muted-foreground font-normal">{shortDate(date)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {areas.map((area) => {
            const sites = data.filter((d) => d.areaId === area.id);
            const comps = sites.flatMap((d) => d.comps);
            return (
              <tr key={area.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="py-2 px-4 font-medium sticky left-0 bg-background z-10">
                  <Link
                    to={`?area=${encodeURIComponent(area.id)}`}
                    className="block hover:text-primary"
                  >
                    <div className="font-semibold">{area.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {area.siteCount === 1 ? '1 site' : `${area.siteCount} sites`}
                    </div>
                  </Link>
                </td>
                {dates.map((date) => {
                  const best = bestSiteDay(
                    sites.map((d) => ({ site: d, scores: d.scores })),
                    date,
                  );
                  return (
                    <td key={date} className="py-2 px-1">
                      <VerdictCell
                        score={best?.score ?? null}
                        href={
                          best
                            ? siteHref(best.site.siteType, best.site.slug, best.site.site.id)
                            : undefined
                        }
                        where={best?.site.site.name}
                        comp={compsOn(comps, date)[0]}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
      <div className="flex flex-col items-center justify-center py-20">
        <h1 className="text-3xl font-bold mb-4">Welcome to SoarCast</h1>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          No sites yet. Add a launch to Favorites to see its flyable days and hours this week. If a
          launch isn&apos;t listed, add it as a private site.
        </p>
        {suggestions.length > 0 && (
          <div className="mb-6 w-full max-w-md space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {suggestionsNearYou ? 'Launches near you' : 'Launches around Seattle'}
            </p>
            <SuggestedSites sites={suggestions} />
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/sites/browse">
            <Button size="lg">Browse Launch Sites</Button>
          </Link>
          <Link to="/sites/custom/new">
            <Button size="lg" variant="outline">
              <MapPinPlus className="mr-2 h-4 w-4" />
              Add a private site
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // The week, from today where the sites are (the first site with a forecast)
  const today = (data.find((d) => d.scores.length > 0) ?? data[0]).today;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  // Determine if a notification indicator should be shown for a given score/site/date
  const shouldShowNotification = (
    score: DayScore | null,
    siteId: string,
    dayIndex: number,
  ): boolean => {
    if (!score) return false;

    // Check if site notifications are enabled (default to true if not set)
    const siteNotificationsEnabled = settings.notifications.sitePreferences[siteId] ?? true;
    if (!siteNotificationsEnabled) return false;

    // Check if day is within notification window (daysAhead)
    if (dayIndex >= settings.notifications.daysAhead) return false;

    // Alerts come for days that are a go for the site's goal
    return score.goalMet === true;
  };

  // Today's best site: a go for its goal first, then the better flight
  const bestSiteToday =
    data.length >= 2
      ? data.reduce<{
          siteData: SiteForecastData;
          score: DayScore;
        } | null>((best, item) => {
          const todayScore = item.scores.find((s) => s.date === item.today);
          if (!todayScore || todayScore.verdict === 'no') return best;
          if (!best || compareDays(todayScore, best.score) < 0) {
            return { siteData: item, score: todayScore };
          }
          return best;
        }, null)
      : null;

  return (
    <div className="space-y-4">
      {/* Today's Best banner */}
      {bestSiteToday && (
        <div className="rounded-lg bg-gradient-to-r from-sky-100 to-blue-50 dark:from-sky-900/30 dark:to-blue-900/20 p-4 border border-sky-200 dark:border-sky-800">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              Today&apos;s Best
            </span>
            <Link
              to={siteHref(
                bestSiteToday.siteData.siteType,
                bestSiteToday.siteData.slug,
                bestSiteToday.siteData.site.id,
              )}
              className="font-semibold text-foreground hover:underline"
            >
              {bestSiteToday.siteData.site.name}
            </Link>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[dayStatus(bestSiteToday.score)]}`}
            >
              {dayHeadline(bestSiteToday.score)}
            </span>
            {bestSiteToday.score.wStar != null &&
              bestSiteToday.score.wStar > 0 &&
              bestSiteToday.score.flight !== 'sled' && (
                <span className="text-xs text-muted-foreground">
                  Climbs about {bestSiteToday.score.wStar.toFixed(1)} m/s
                </span>
              )}
            {bestSiteToday.score.odRisk && bestSiteToday.score.odRisk !== 'none' && (
              <span className="text-xs text-orange-600 dark:text-orange-400">
                Overdevelopment: {bestSiteToday.score.odRisk}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">This week</h1>
          <p className="text-muted-foreground mt-1">
            {shown.area === 'all'
              ? 'Each area shows its best site each day. A day is a go when any site in the area is. Open an area for all its sites.'
              : "When each favorite site gives the flying it's worth going for. Open a site for its windgram."}
          </p>
          <StatusLegend />
        </div>
        <Button variant="outline" size="lg" asChild>
          <Link to="/sites/custom/new">
            <MapPinPlus className="mr-2 h-4 w-4" />
            Add a private site
          </Link>
        </Button>
      </div>

      {areas.length > 0 && <AreaChips areas={areas} shown={shown} />}

      {nearYou && (
        <div className="max-w-md space-y-2 rounded-lg border p-4">
          <p className="text-sm">
            No saved sites near {nearYou.city ?? 'you'}. Listed launches nearby:
          </p>
          <SuggestedSites sites={nearYou.sites} />
        </div>
      )}

      {shown.area === 'all' && <AreasTable areas={areas} data={data} dates={dates} today={today} />}

      {/* Tabbed View: Cards (default) vs Table */}
      {shown.area !== 'all' && (
        <Tabs defaultValue="cards" className="w-full">
          <TabsList>
            <TabsTrigger value="cards">
              <LayoutGrid className="mr-2 h-4 w-4" />
              Cards
            </TabsTrigger>
            <TabsTrigger value="table">
              <Table className="mr-2 h-4 w-4" />
              Table
            </TabsTrigger>
          </TabsList>

          {/* Card View */}
          <TabsContent value="cards" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.map(({ site, scores, today, siteType, slug, error, comps }) => (
                <SiteCard
                  key={site.id}
                  site={site}
                  scores={scores}
                  today={today}
                  siteType={siteType}
                  slug={slug}
                  error={error}
                  comps={comps}
                />
              ))}
            </div>
          </TabsContent>

          {/* Table View */}
          <TabsContent value="table" className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="py-3 px-4 text-left font-semibold min-w-[160px] sticky left-0 bg-background z-10">
                      Site
                    </th>
                    {dates.map((date) => (
                      <th key={date} className="py-3 px-1 text-center font-semibold min-w-[76px]">
                        <div className="text-sm">{dayName(date, today)}</div>
                        <div className="text-xs text-muted-foreground font-normal">
                          {shortDate(date)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map(({ site, scores, siteType, slug, error, comps }) => {
                    const href = siteHref(siteType, slug, site.id);
                    return (
                      <tr key={site.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-4 font-medium sticky left-0 bg-background z-10">
                          <Link to={href} className="block hover:text-primary">
                            <div className="font-semibold">{site.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {error ?? `${site.elevation}m • ${site.maxWindSpeed}km/h max`}
                            </div>
                          </Link>
                        </td>
                        {dates.map((date, dateIndex) => {
                          const score = scores.find((s) => s.date === date) || null;
                          const showNotification = shouldShowNotification(
                            score,
                            site.id,
                            dateIndex,
                          );
                          return (
                            <td key={date} className="py-2 px-1">
                              <VerdictCell
                                score={score}
                                showNotification={showNotification}
                                href={score ? href : undefined}
                                comp={compsOn(comps, date)[0]}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      )}

      <ForecastCredit />
    </div>
  );
}
