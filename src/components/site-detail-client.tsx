'use client';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { WindIndicator } from '@/components/wind-indicator';
import { calculateCircularMean } from '@/lib/scoring';
import { formatForecastDate, degreesToCompass } from '@/lib/utils';
import type { Site, Forecast, DayScore } from '@/types';

interface SiteDetailClientProps {
  site: Site;
  forecast: Forecast;
  scores: DayScore[];
}

/**
 * Get color class based on score value
 */
function getScoreColorClass(score: number): string {
  if (score <= 30) return 'bg-red-500';
  if (score <= 50) return 'bg-orange-500';
  if (score <= 70) return 'bg-yellow-500';
  if (score <= 85) return 'bg-lime-500';
  return 'bg-green-500';
}

/**
 * Single labeled score-factor bar
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
        <div className="h-full bg-primary transition-all" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

/**
 * Get hourly data for a specific day
 */
function getHourlyDataForDay(forecast: Forecast, date: string) {
  const hours: {
    hour: number;
    temperature: number;
    windSpeed: number;
    windDirection: number;
    windGusts: number;
    cape: number | null;
    cloudCover: number;
    precipProbability: number;
    blh: number | null;
    wind850hPa: number | null;
  }[] = [];

  forecast.hourly.time.forEach((timeStr, index) => {
    const [dayPart] = timeStr.split('T');
    if (dayPart === date) {
      const hour = parseInt(timeStr.split('T')[1].split(':')[0], 10);
      hours.push({
        hour,
        temperature: forecast.hourly.temperature_2m[index],
        windSpeed: forecast.hourly.wind_speed_10m[index],
        windDirection: forecast.hourly.wind_direction_10m[index],
        windGusts: forecast.hourly.wind_gusts_10m[index],
        cape: forecast.hourly.cape[index],
        cloudCover: forecast.hourly.cloud_cover[index],
        precipProbability: forecast.hourly.precipitation_probability[index],
        blh: forecast.hourly.boundary_layer_height?.[index] ?? null,
        wind850hPa: forecast.hourly.wind_speed_850hPa?.[index] ?? null,
      });
    }
  });

  return hours;
}

/**
 * Get temperature range for a day
 */
function getTemperatureRange(forecast: Forecast, date: string): [number, number] {
  const temps: number[] = [];
  forecast.hourly.time.forEach((timeStr, index) => {
    const [dayPart] = timeStr.split('T');
    if (dayPart === date) {
      temps.push(forecast.hourly.temperature_2m[index]);
    }
  });
  return temps.length > 0 ? [Math.min(...temps), Math.max(...temps)] : [0, 0];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

type DayHourly = ReturnType<typeof getHourlyDataForDay>;

/**
 * Full detail block for a single day: summary, score breakdown,
 * hourly chart and hourly table — all shown without any reveal/click.
 */
function DayDetail({
  score,
  forecast,
}: {
  score: DayScore;
  forecast: Forecast;
}) {
  const dayHourly = getHourlyDataForDay(forecast, score.date);
  const [minTemp, maxTemp] = getTemperatureRange(forecast, score.date);

  const avgWindSpeed = Math.round(average(dayHourly.map((h) => h.windSpeed)));
  const avgWindDirection =
    dayHourly.length > 0
      ? Math.round(calculateCircularMean(dayHourly.map((h) => h.windDirection)))
      : 0;
  const avgCape = Math.round(average(dayHourly.map((h) => h.cape ?? 0)));
  const avgCloudCover = Math.round(average(dayHourly.map((h) => h.cloudCover)));
  const avgPrecip = Math.round(average(dayHourly.map((h) => h.precipProbability)));
  const avgBlh = Math.round(
    average(dayHourly.map((h) => h.blh).filter((v): v is number => v !== null))
  );
  const avgWind850 = Math.round(
    average(dayHourly.map((h) => h.wind850hPa).filter((v): v is number => v !== null))
  );

  return (
    <Card id={`day-${score.date}`} className="scroll-mt-20">
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{formatForecastDate(score.date)}</h3>
          <Badge className={getScoreColorClass(score.overallScore)}>
            {score.overallScore} - {score.label}
          </Badge>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Wind:</span>
            <span className="flex items-center gap-1 font-medium">
              <WindIndicator direction={avgWindDirection} size={14} />
              {degreesToCompass(avgWindDirection)} {avgWindSpeed} km/h
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">CAPE:</span>
            <span className="font-medium">{avgCape} J/kg</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">BLH:</span>
            <span className="font-medium">{avgBlh > 0 ? `${avgBlh}m` : '-'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">850hPa:</span>
            <span className="font-medium">{avgWind850 > 0 ? `${avgWind850} km/h` : '-'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Cloud:</span>
            <span className="font-medium">{avgCloudCover}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Precip:</span>
            <span className="font-medium">{avgPrecip}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Temp:</span>
            <span className="font-medium">
              {Math.round(minTemp)}° - {Math.round(maxTemp)}°C
            </span>
          </div>
        </div>

        {/* Score breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Score Breakdown
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <FactorBar label="CAPE / Thermal Strength" score={score.factors.cape} weight="25%" />
            <FactorBar label="Wind Speed" score={score.factors.windSpeed} weight="20%" />
            <FactorBar label="Wind Direction Match" score={score.factors.windDirection} weight="15%" />
            <FactorBar label="Boundary Layer Height" score={score.factors.blh} weight="15%" />
            <FactorBar label="Upper Wind (850hPa)" score={score.factors.upperWind} weight="10%" />
            <FactorBar label="Cloud Cover" score={score.factors.cloudCover} weight="10%" />
            <FactorBar label="Precipitation Risk" score={score.factors.precipitation} weight="5%" />
          </div>
        </div>

        {/* Hourly chart + table */}
        {dayHourly.length > 0 && <HourlyDetails hourlyData={dayHourly} />}
      </div>
    </Card>
  );
}

/**
 * Hourly chart and table for a day's data.
 */
function HourlyDetails({ hourlyData }: { hourlyData: DayHourly }) {
  return (
    <div className="space-y-4">
      {/* Wind speed, CAPE, and BLH chart */}
      <div>
        <h4 className="text-sm font-medium mb-3">Hourly: Wind Speed, CAPE &amp; BLH</h4>
        <div className="relative h-48 border rounded">
          <div className="absolute inset-0 p-4 flex items-end justify-between gap-1">
            {hourlyData.map((hour) => {
              const windHeight = Math.min((hour.windSpeed / 60) * 100, 100);
              const capeHeight = Math.min(((hour.cape || 0) / 2000) * 100, 100);
              const blhHeight = Math.min(((hour.blh || 0) / 3000) * 100, 100);

              return (
                <div
                  key={hour.hour}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${hour.hour}:00 - Wind: ${hour.windSpeed} km/h, CAPE: ${hour.cape || 0} J/kg, BLH: ${hour.blh || 0}m`}
                >
                  <div className="w-full relative" style={{ height: '30%' }}>
                    <div
                      className="absolute bottom-0 w-full bg-green-500/40 rounded-t"
                      style={{ height: `${capeHeight}%` }}
                    />
                  </div>
                  <div className="w-full relative" style={{ height: '30%' }}>
                    <div
                      className="absolute bottom-0 w-full bg-purple-500/40 rounded-t"
                      style={{ height: `${blhHeight}%` }}
                    />
                  </div>
                  <div className="w-full relative" style={{ height: '30%' }}>
                    <div
                      className="absolute bottom-0 w-full bg-blue-500/40 rounded-t"
                      style={{ height: `${windHeight}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">{hour.hour}h</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500/40 rounded" />
            <span>Wind Speed (max 60 km/h scale)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500/40 rounded" />
            <span>CAPE (max 2000 J/kg scale)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-purple-500/40 rounded" />
            <span>BLH (max 3000m scale)</span>
          </div>
        </div>
      </div>

      {/* Hourly data table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-2">Time</th>
              <th className="text-left py-2 px-2">Wind</th>
              <th className="text-left py-2 px-2">Gusts</th>
              <th className="text-left py-2 px-2">CAPE</th>
              <th className="text-left py-2 px-2">BLH</th>
              <th className="text-left py-2 px-2">850hPa</th>
              <th className="text-left py-2 px-2">Clouds</th>
              <th className="text-left py-2 px-2">Precip</th>
              <th className="text-left py-2 px-2">Temp</th>
            </tr>
          </thead>
          <tbody>
            {hourlyData.map((hour) => (
              <tr key={hour.hour} className="border-b">
                <td className="py-2 px-2 font-medium">{hour.hour}:00</td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    <WindIndicator direction={hour.windDirection} size={14} />
                    <span>
                      {degreesToCompass(hour.windDirection)} {Math.round(hour.windSpeed)} km/h
                    </span>
                  </div>
                </td>
                <td className="py-2 px-2">{Math.round(hour.windGusts)} km/h</td>
                <td className="py-2 px-2">{hour.cape ? Math.round(hour.cape) : 0} J/kg</td>
                <td className="py-2 px-2">{hour.blh !== null ? `${Math.round(hour.blh)}m` : '-'}</td>
                <td className="py-2 px-2">
                  {hour.wind850hPa !== null ? `${Math.round(hour.wind850hPa)} km/h` : '-'}
                </td>
                <td className="py-2 px-2">{Math.round(hour.cloudCover)}%</td>
                <td className="py-2 px-2">{Math.round(hour.precipProbability)}%</td>
                <td className="py-2 px-2">{Math.round(hour.temperature)}°C</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SiteDetailClient({ forecast, scores }: SiteDetailClientProps) {
  return (
    <div className="space-y-8">
      {/* Quick overview grid (jumps to each day's full detail below) */}
      <div>
        <h2 className="text-xl font-semibold mb-4">7-Day Forecast</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {scores.map((score) => (
            <a
              key={score.date}
              href={`#day-${score.date}`}
              className="flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors hover:border-primary"
            >
              <span className="text-xs font-medium">{formatForecastDate(score.date)}</span>
              <Badge className={`${getScoreColorClass(score.overallScore)} text-xs`}>
                {score.overallScore}
              </Badge>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {score.label}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Full per-day details — everything visible, no clicks required */}
      <div className="space-y-6">
        {scores.map((score) => (
          <DayDetail key={score.date} score={score} forecast={forecast} />
        ))}
      </div>
    </div>
  );
}
