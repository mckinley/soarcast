'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { WindIndicator } from '@/components/wind-indicator';
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
 * Format date string for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00'); // Avoid timezone shift
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  } else {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
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

export function SiteDetailClient({ site, forecast, scores }: SiteDetailClientProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(scores[0]?.date || null);

  const selectedScore = scores.find((s) => s.date === selectedDate);
  const hourlyData = selectedDate ? getHourlyDataForDay(forecast, selectedDate) : [];

  return (
    <div className="space-y-8">
      {/* Daily forecast cards */}
      <div>
        <h2 className="text-xl font-semibold mb-4">7-Day Forecast</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {scores.map((score) => {
            const [minTemp, maxTemp] = getTemperatureRange(forecast, score.date);
            const dayHourly = getHourlyDataForDay(forecast, score.date);
            const avgWindSpeed =
              dayHourly.length > 0
                ? Math.round(
                    dayHourly.reduce((sum, h) => sum + h.windSpeed, 0) / dayHourly.length
                  )
                : 0;
            const avgWindDirection =
              dayHourly.length > 0
                ? Math.round(
                    dayHourly.reduce((sum, h) => sum + h.windDirection, 0) / dayHourly.length
                  )
                : 0;
            const avgCape =
              dayHourly.length > 0
                ? Math.round(
                    dayHourly.reduce((sum, h) => sum + (h.cape || 0), 0) / dayHourly.length
                  )
                : 0;
            const avgCloudCover =
              dayHourly.length > 0
                ? Math.round(
                    dayHourly.reduce((sum, h) => sum + h.cloudCover, 0) / dayHourly.length
                  )
                : 0;
            const avgPrecip =
              dayHourly.length > 0
                ? Math.round(
                    dayHourly.reduce((sum, h) => sum + h.precipProbability, 0) /
                      dayHourly.length
                  )
                : 0;

            return (
              <Card
                key={score.date}
                className={`cursor-pointer transition-all hover:border-primary ${
                  selectedDate === score.date ? 'border-2 border-primary' : ''
                }`}
                onClick={() => setSelectedDate(score.date)}
              >
                <div className="p-4 space-y-3">
                  {/* Date and score badge */}
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{formatDate(score.date)}</div>
                    <Badge className={getScoreColorClass(score.overallScore)}>
                      {score.overallScore} - {score.label}
                    </Badge>
                  </div>

                  {/* Wind */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Wind:</span>
                    <div className="flex items-center gap-2">
                      <WindIndicator direction={avgWindDirection} size={16} />
                      <span className="font-medium">{avgWindSpeed} km/h</span>
                    </div>
                  </div>

                  {/* CAPE */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">CAPE:</span>
                    <span className="font-medium">{avgCape} J/kg</span>
                  </div>

                  {/* Cloud cover */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Cloud Cover:</span>
                    <span className="font-medium">{avgCloudCover}%</span>
                  </div>

                  {/* Precipitation */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Precip:</span>
                    <span className="font-medium">{avgPrecip}%</span>
                  </div>

                  {/* Temperature range */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Temp:</span>
                    <span className="font-medium">
                      {Math.round(minTemp)}° - {Math.round(maxTemp)}°C
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Hourly timeline for selected day */}
      {selectedDate && selectedScore && hourlyData.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">
            Hourly Details - {formatDate(selectedDate)}
          </h2>
          <Card>
            <div className="p-6">
              {/* Hourly chart/table */}
              <div className="space-y-4">
                {/* Wind speed and CAPE chart */}
                <div>
                  <h3 className="text-sm font-medium mb-3">Wind Speed & CAPE</h3>
                  <div className="relative h-48 border rounded">
                    {/* Simple bar chart visualization */}
                    <div className="absolute inset-0 p-4 flex items-end justify-between gap-1">
                      {hourlyData.map((hour) => {
                        const windHeight = Math.min((hour.windSpeed / 60) * 100, 100);
                        const capeHeight = Math.min(((hour.cape || 0) / 2000) * 100, 100);

                        return (
                          <div
                            key={hour.hour}
                            className="flex-1 flex flex-col items-center gap-1"
                            title={`${hour.hour}:00 - Wind: ${hour.windSpeed} km/h, CAPE: ${hour.cape || 0} J/kg`}
                          >
                            {/* CAPE bar (green) */}
                            <div className="w-full relative" style={{ height: '45%' }}>
                              <div
                                className="absolute bottom-0 w-full bg-green-500/40 rounded-t"
                                style={{ height: `${capeHeight}%` }}
                              />
                            </div>
                            {/* Wind bar (blue) */}
                            <div className="w-full relative" style={{ height: '45%' }}>
                              <div
                                className="absolute bottom-0 w-full bg-blue-500/40 rounded-t"
                                style={{ height: `${windHeight}%` }}
                              />
                            </div>
                            {/* Hour label */}
                            <div className="text-[10px] text-muted-foreground">
                              {hour.hour}h
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-blue-500/40 rounded" />
                      <span>Wind Speed (max 60 km/h scale)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-green-500/40 rounded" />
                      <span>CAPE (max 2000 J/kg scale)</span>
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
                              <span>{Math.round(hour.windSpeed)} km/h</span>
                            </div>
                          </td>
                          <td className="py-2 px-2">{Math.round(hour.windGusts)} km/h</td>
                          <td className="py-2 px-2">{hour.cape ? Math.round(hour.cape) : 0} J/kg</td>
                          <td className="py-2 px-2">{Math.round(hour.cloudCover)}%</td>
                          <td className="py-2 px-2">{Math.round(hour.precipProbability)}%</td>
                          <td className="py-2 px-2">{Math.round(hour.temperature)}°C</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
