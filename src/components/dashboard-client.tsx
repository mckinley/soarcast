'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ScoreCell } from '@/components/score-cell';
import { ScoreDetailDialog } from '@/components/score-detail-dialog';
import type { SiteForecastData } from '@/app/actions';
import type { DayScore, Site, Forecast } from '@/types';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface DashboardClientProps {
  data: SiteForecastData[];
  refreshAction: () => Promise<{ success: boolean; message: string }>;
}

export function DashboardClient({ data, refreshAction }: DashboardClientProps) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedScore, setSelectedScore] = useState<DayScore | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [selectedForecast, setSelectedForecast] = useState<Forecast | null>(null);

  const handleRefresh = () => {
    startTransition(async () => {
      const result = await refreshAction();
      if (result.success) {
        console.log(result.message);
      } else {
        console.error(result.message);
      }
    });
  };

  const handleCellClick = (score: DayScore, site: Site, forecast: Forecast) => {
    setSelectedScore(score);
    setSelectedSite(site);
    setSelectedForecast(forecast);
    setDialogOpen(true);
  };

  // Empty state when no sites configured
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h1 className="text-3xl font-bold mb-4">Welcome to SoarCast</h1>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          Get started by adding your flying sites to see 7-day XC soaring forecasts.
        </p>
        <Link href="/sites">
          <Button size="lg">Add Your First Site</Button>
        </Link>
      </div>
    );
  }

  // Generate next 7 days
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date.toISOString().split('T')[0] || '');
  }

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00'); // Add time to avoid timezone issues
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    if (dateStr === todayStr) return 'Today';
    if (dateStr === tomorrowStr) return 'Tomorrow';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">7-Day XC Forecast</h1>
          <p className="text-muted-foreground mt-1">
            Click any score to see detailed breakdown and hourly data
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isPending} size="lg">
          <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          {isPending ? 'Refreshing...' : 'Refresh All'}
        </Button>
      </div>

      {/* Forecast Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="py-3 px-4 text-left font-semibold min-w-[160px] sticky left-0 bg-background z-10">
                Site
              </th>
              {dates.map((date) => (
                <th key={date} className="py-3 px-2 text-center font-semibold min-w-[100px]">
                  <div className="text-sm">{formatDate(date)}</div>
                  <div className="text-xs text-muted-foreground font-normal">
                    {date.substring(5)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(({ site, forecast, scores, error }) => (
              <tr key={site.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="py-2 px-4 font-medium sticky left-0 bg-background z-10">
                  <div>
                    <div className="font-semibold">{site.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {site.elevation}m • {site.maxWindSpeed}km/h max
                    </div>
                  </div>
                </td>
                {dates.map((date) => {
                  const score = scores.find((s) => s.date === date) || null;
                  return (
                    <td key={date} className="py-2 px-2">
                      <ScoreCell
                        score={score}
                        onClick={
                          score && forecast
                            ? () => handleCellClick(score, site, forecast)
                            : undefined
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Error Messages */}
      {data.some((d) => d.error) && (
        <div className="mt-4 p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
          <h3 className="font-semibold text-destructive mb-2">Errors fetching forecasts:</h3>
          <ul className="space-y-1 text-sm">
            {data
              .filter((d) => d.error)
              .map((d) => (
                <li key={d.site.id} className="text-destructive">
                  <span className="font-medium">{d.site.name}:</span> {d.error}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Score Detail Dialog */}
      <ScoreDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        score={selectedScore}
        site={selectedSite}
        forecast={selectedForecast}
      />
    </div>
  );
}
