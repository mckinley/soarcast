import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { VerdictCell } from '@/components/verdict-cell';
import { SiteCard } from '@/components/dashboard/site-card';
import { ForecastCredit } from '@/components/data-credits';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SiteForecastData } from '~/app/routes/_auth.dashboard';
import type { DayScore, Settings } from '@/types';
import { addDays } from '@/lib/alert-schedule';
import { VERDICT_BADGE, VERDICT_WORD, dayName, shortDate } from '@/lib/verdict-display';
import { LayoutGrid, Table, MapPinPlus } from 'lucide-react';

/** Build the detail-page URL for a site (launch sites use their slug). */
function siteHref(siteType: string, slug: string | undefined, siteId: string): string {
  return siteType === 'launch' && slug ? `/sites/${slug}` : `/sites/custom/${siteId}`;
}

const VERDICT_RANK: Record<DayScore['verdict'], number> = { go: 2, marginal: 1, no: 0 };

interface DashboardClientProps {
  data: SiteForecastData[];
  settings: Settings;
  isAuthenticated: boolean; // Always true since dashboard requires auth
}

export function DashboardClient({ data, settings, isAuthenticated }: DashboardClientProps) {
  // Empty state when authenticated user has no sites
  if (data.length === 0 && isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h1 className="text-3xl font-bold mb-4">Welcome to SoarCast</h1>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          No sites yet. Browse launch sites to find your home site, or pin your own launch if it
          isn&apos;t listed.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/sites/browse">
            <Button size="lg">Browse Launch Sites</Button>
          </Link>
          <Link to="/sites/custom/new">
            <Button size="lg" variant="outline">
              <MapPinPlus className="mr-2 h-4 w-4" />
              Add your own site
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

    // Check if score meets threshold
    return score.overallScore >= settings.notifications.minScoreThreshold;
  };

  // Today's best site: a flyable window first, then soaring quality
  const bestSiteToday =
    data.length >= 2
      ? data.reduce<{
          siteData: SiteForecastData;
          score: DayScore;
        } | null>((best, item) => {
          const todayScore = item.scores.find((s) => s.date === item.today);
          if (!todayScore || todayScore.verdict === 'no') return best;
          if (
            !best ||
            VERDICT_RANK[todayScore.verdict] > VERDICT_RANK[best.score.verdict] ||
            (todayScore.verdict === best.score.verdict &&
              todayScore.overallScore > best.score.overallScore)
          ) {
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
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_BADGE[bestSiteToday.score.verdict]}`}
            >
              {VERDICT_WORD[bestSiteToday.score.verdict]} {bestSiteToday.score.flyableWindow}
            </span>
            {bestSiteToday.score.wStar != null && bestSiteToday.score.wStar > 0 && (
              <span className="text-xs text-muted-foreground">
                Thermals {bestSiteToday.score.wStar.toFixed(1)} m/s
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
          <h1 className="text-3xl font-bold">Your week</h1>
          <p className="text-muted-foreground mt-1">
            When each of your sites is flyable. Open a site for its windgram.
          </p>
        </div>
        <Button variant="outline" size="lg" asChild>
          <Link to="/sites/custom/new">
            <MapPinPlus className="mr-2 h-4 w-4" />
            Add your own site
          </Link>
        </Button>
      </div>

      {/* Tabbed View: Cards (default) vs Table */}
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
            {data.map(({ site, scores, today, siteType, slug, error }) => (
              <SiteCard
                key={site.id}
                site={site}
                scores={scores}
                today={today}
                siteType={siteType}
                slug={slug}
                error={error}
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
                {data.map(({ site, scores, siteType, slug, error }) => {
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
                        const showNotification = shouldShowNotification(score, site.id, dateIndex);
                        return (
                          <td key={date} className="py-2 px-1">
                            <VerdictCell
                              score={score}
                              showNotification={showNotification}
                              href={score ? href : undefined}
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

      <ForecastCredit />
    </div>
  );
}
