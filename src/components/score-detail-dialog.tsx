'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { DayScore, Site, Forecast } from '@/types';

interface ScoreDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  score: DayScore | null;
  site: Site | null;
  forecast: Forecast | null;
}

/**
 * Format factor score with bar visualization
 */
function FactorBar({ label, score, weight }: { label: string; score: number; weight: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {label} <span className="text-xs">({weight})</span>
        </span>
        <span className="font-medium">{score}/100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Get hourly data for a specific date
 */
function getHourlyDataForDate(forecast: Forecast, date: string) {
  const hourlyData: {
    time: string;
    temp: number;
    windSpeed: number;
    windDir: number;
    cape: number;
    cloudCover: number;
    precip: number;
    blh: number | null;
    upperWind: number | null;
  }[] = [];

  forecast.hourly.time.forEach((time, idx) => {
    if (time.startsWith(date)) {
      hourlyData.push({
        time: time.split('T')[1] || time,
        temp: forecast.hourly.temperature_2m[idx] || 0,
        windSpeed: forecast.hourly.wind_speed_10m[idx] || 0,
        windDir: forecast.hourly.wind_direction_10m[idx] || 0,
        cape: forecast.hourly.cape[idx] || 0,
        cloudCover: forecast.hourly.cloud_cover[idx] || 0,
        precip: forecast.hourly.precipitation_probability[idx] || 0,
        blh: forecast.hourly.boundary_layer_height?.[idx] ?? null,
        upperWind: forecast.hourly.wind_speed_850hPa?.[idx] ?? null,
      });
    }
  });

  return hourlyData;
}

export function ScoreDetailDialog({
  open,
  onOpenChange,
  score,
  site,
  forecast,
}: ScoreDetailDialogProps) {
  if (!score || !site || !forecast) return null;

  const hourlyData = getHourlyDataForDate(forecast, score.date);

  // Filter for flyable hours (10:00 - 17:00)
  const flyableHours = hourlyData.filter((d) => {
    const hour = parseInt(d.time.split(':')[0] || '0');
    return hour >= 10 && hour <= 17;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {site.name} - {score.date}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Overall Score */}
          <div className="flex items-center gap-4">
            <div className="text-5xl font-bold">{score.overallScore}</div>
            <div>
              <Badge variant="outline" className="text-lg">
                {score.label}
              </Badge>
              <div className="text-sm text-muted-foreground mt-1">
                XC Soaring Score
              </div>
            </div>
          </div>

          {/* Factor Breakdown */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Score Breakdown
            </h3>
            <FactorBar label="CAPE / Thermal Strength" score={score.factors.cape} weight="25%" />
            <FactorBar label="Wind Speed" score={score.factors.windSpeed} weight="20%" />
            <FactorBar label="Wind Direction Match" score={score.factors.windDirection} weight="15%" />
            <FactorBar label="Boundary Layer Height" score={score.factors.blh} weight="15%" />
            <FactorBar label="Upper Wind (850hPa)" score={score.factors.upperWind} weight="10%" />
            <FactorBar label="Cloud Cover" score={score.factors.cloudCover} weight="10%" />
            <FactorBar label="Precipitation Risk" score={score.factors.precipitation} weight="5%" />
          </div>

          {/* Hourly Data Table */}
          {flyableHours.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Flyable Hours (10:00 - 17:00)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-muted-foreground">
                      <th className="py-2 text-left">Time</th>
                      <th className="py-2 text-right">Temp (°C)</th>
                      <th className="py-2 text-right">Wind (km/h)</th>
                      <th className="py-2 text-right">Dir (°)</th>
                      <th className="py-2 text-right">CAPE</th>
                      <th className="py-2 text-right">BLH (m)</th>
                      <th className="py-2 text-right">850hPa (km/h)</th>
                      <th className="py-2 text-right">Cloud %</th>
                      <th className="py-2 text-right">Precip %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flyableHours.map((hour, idx) => (
                      <tr key={idx} className="border-b border-muted/50">
                        <td className="py-2">{hour.time.substring(0, 5)}</td>
                        <td className="py-2 text-right">{hour.temp.toFixed(1)}</td>
                        <td className="py-2 text-right">{hour.windSpeed.toFixed(0)}</td>
                        <td className="py-2 text-right">{hour.windDir.toFixed(0)}</td>
                        <td className="py-2 text-right">{hour.cape.toFixed(0)}</td>
                        <td className="py-2 text-right">{hour.blh !== null ? hour.blh.toFixed(0) : '-'}</td>
                        <td className="py-2 text-right">{hour.upperWind !== null ? hour.upperWind.toFixed(0) : '-'}</td>
                        <td className="py-2 text-right">{hour.cloudCover.toFixed(0)}</td>
                        <td className="py-2 text-right">{hour.precip.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
