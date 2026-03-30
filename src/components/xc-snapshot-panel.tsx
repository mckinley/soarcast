'use client';

import { Skeleton } from '@/components/ui/skeleton';
import type { AtmosphericProfile, AtmosphericHour } from '@/lib/weather-profile';
import type { DayScore } from '@/types';

interface XcSnapshotPanelProps {
  dayScore: DayScore;
  profile: AtmosphericProfile;
  dateString: string;
  loading?: boolean;
}

function mToFt(m: number): number {
  return m * 3.28084;
}

/** Get flyable hours (10-17 local) for a day from profile */
function getFlyableHours(profile: AtmosphericProfile, dateString: string): AtmosphericHour[] {
  return profile.hours.filter((h) => {
    if (!h.time.startsWith(dateString)) return false;
    const hour = parseInt(h.time.slice(11, 13));
    return hour >= 10 && hour <= 17;
  });
}

/** Get thermal strength label from W* */
function wStarLabel(ws: number | null): string {
  if (ws === null || ws < 0.5) return 'None';
  if (ws < 1) return 'Weak';
  if (ws < 2) return 'Moderate';
  if (ws < 3) return 'Strong';
  return 'Very Strong';
}

/** Get thermal strength color class from W* */
function wStarColorClass(ws: number | null): string {
  if (ws === null || ws < 0.5) return 'text-gray-500';
  if (ws < 1) return 'text-blue-500';
  if (ws < 2) return 'text-green-500';
  if (ws < 3) return 'text-orange-500';
  return 'text-red-500';
}

/** Risk badge colors */
function riskColor(risk: string | undefined): string {
  switch (risk) {
    case 'high':
      return 'bg-red-500/15 text-red-600 dark:text-red-400';
    case 'moderate':
      return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
    case 'low':
      return 'bg-green-500/15 text-green-600 dark:text-green-400';
    default:
      return 'bg-gray-500/10 text-gray-500';
  }
}

function riskLabel(risk: string | undefined): string {
  if (!risk || risk === 'none') return 'None';
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

/** Freezing safety label */
function freezingSafety(
  freezingLevel: number | null,
  cloudBase: number | null,
): { label: string; colorClass: string } {
  if (freezingLevel === null || cloudBase === null) {
    return { label: 'N/A', colorClass: 'text-gray-500' };
  }
  const margin = freezingLevel - cloudBase;
  if (margin > 500) return { label: 'Safe', colorClass: 'text-green-600 dark:text-green-400' };
  if (margin > 200)
    return { label: 'Marginal', colorClass: 'text-orange-600 dark:text-orange-400' };
  return { label: 'Caution', colorClass: 'text-red-600 dark:text-red-400' };
}

/** Lapse rate label */
function lapseRateLabel(lr: number | null): { label: string; colorClass: string } {
  if (lr === null) return { label: 'N/A', colorClass: 'text-gray-500' };
  if (lr < 2.5) return { label: 'Stable', colorClass: 'text-blue-500' };
  if (lr <= 3.0) return { label: 'Moderate', colorClass: 'text-orange-500' };
  return { label: 'Unstable', colorClass: 'text-green-600 dark:text-green-400' };
}

function MetricCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-1">
      <div className="text-xs text-muted-foreground font-medium">{title}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function XcSnapshotPanel({ dayScore, profile, dateString, loading }: XcSnapshotPanelProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  const flyableHours = getFlyableHours(profile, dateString);

  // 1. Thermal Strength — peak W*
  const wStarValues = flyableHours
    .map((h) => ({ ws: h.derived.wStar, time: h.time }))
    .filter((v) => v.ws !== null);
  const peakWStarEntry = wStarValues.reduce(
    (best, cur) => ((cur.ws ?? 0) > (best.ws ?? 0) ? cur : best),
    wStarValues[0] || { ws: null, time: '' },
  );
  const peakWStar = peakWStarEntry?.ws ?? null;
  const peakTime = peakWStarEntry?.time ? peakWStarEntry.time.slice(11, 16) : '';

  // 3. Cloud Base — avg
  const cloudBases = flyableHours
    .map((h) => h.derived.estimatedCloudBase)
    .filter((v): v is number => v !== null);
  const avgCloudBase =
    cloudBases.length > 0
      ? Math.round(cloudBases.reduce((a, b) => a + b, 0) / cloudBases.length)
      : null;

  // 4. Freezing Level — avg
  const freezingLevels = flyableHours
    .map((h) => h.derived.freezingLevel)
    .filter((v): v is number => v !== null);
  const avgFreezing =
    freezingLevels.length > 0
      ? Math.round(freezingLevels.reduce((a, b) => a + b, 0) / freezingLevels.length)
      : null;
  const safety = freezingSafety(avgFreezing, avgCloudBase);

  // 8. Lapse Rate — avg
  const lapseRates = flyableHours
    .map((h) => h.derived.lapseRate)
    .filter((v): v is number => v !== null);
  const avgLapseRate =
    lapseRates.length > 0
      ? Math.round((lapseRates.reduce((a, b) => a + b, 0) / lapseRates.length) * 10) / 10
      : null;
  const lrInfo = lapseRateLabel(avgLapseRate);

  // Best window formatting
  const bestWindow = dayScore.bestWindow || '';
  const windowDuration = bestWindow
    ? (() => {
        const [start, end] = bestWindow.split('-').map((t) => parseInt(t.split(':')[0]));
        return end && start ? `${end - start} hrs` : '';
      })()
    : '';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {/* 1. Thermal Strength */}
      <MetricCard title="Thermal Strength">
        <div className={`font-semibold ${wStarColorClass(peakWStar)}`}>
          {peakWStar !== null ? `${peakWStar.toFixed(1)} m/s` : '—'}
        </div>
        <div className="text-xs text-muted-foreground">
          {wStarLabel(peakWStar)}
          {peakTime && ` at ${peakTime}`}
        </div>
      </MetricCard>

      {/* 2. Max Altitude */}
      <MetricCard title="Max Altitude">
        <div className="font-semibold">
          {dayScore.peakCeilingMsl ? `${dayScore.peakCeilingMsl.toLocaleString()}m` : '—'}
        </div>
        <div className="text-xs text-muted-foreground">
          {dayScore.peakCeilingMsl
            ? `${Math.round(mToFt(dayScore.peakCeilingMsl)).toLocaleString()} ft ASL`
            : 'No data'}
        </div>
      </MetricCard>

      {/* 3. Cloud Base */}
      <MetricCard title="Cloud Base">
        <div className="font-semibold">{avgCloudBase !== null ? `${avgCloudBase}m AGL` : '—'}</div>
        <div className="text-xs text-muted-foreground">
          {avgCloudBase !== null
            ? `${Math.round(mToFt(avgCloudBase)).toLocaleString()} ft AGL`
            : 'No data'}
        </div>
      </MetricCard>

      {/* 4. Freezing Level */}
      <MetricCard title="Freezing Level">
        <div className="font-semibold">
          {avgFreezing !== null ? `${avgFreezing.toLocaleString()}m MSL` : '—'}
        </div>
        <div className={`text-xs font-medium ${safety.colorClass}`}>{safety.label}</div>
      </MetricCard>

      {/* 5. Best Window */}
      <MetricCard title="Best Window">
        <div className="font-semibold">{bestWindow || '—'}</div>
        <div className="text-xs text-muted-foreground">
          {windowDuration ? `(${windowDuration})` : 'No window'}
        </div>
      </MetricCard>

      {/* 6. OD Risk */}
      <MetricCard title="OD Risk">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${riskColor(dayScore.odRisk)}`}
        >
          {riskLabel(dayScore.odRisk)}
        </span>
      </MetricCard>

      {/* 7. Wind Shear */}
      <MetricCard title="Wind Shear">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${riskColor(dayScore.windShear)}`}
        >
          {riskLabel(dayScore.windShear)}
        </span>
      </MetricCard>

      {/* 8. Lapse Rate */}
      <MetricCard title="Lapse Rate (850-700)">
        <div className="font-semibold">
          {avgLapseRate !== null ? `${avgLapseRate}°C/1000ft` : '—'}
        </div>
        <div className={`text-xs font-medium ${lrInfo.colorClass}`}>{lrInfo.label}</div>
      </MetricCard>
    </div>
  );
}
