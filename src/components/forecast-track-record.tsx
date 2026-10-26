import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { Card } from '@/components/ui/card';
import {
  rainText,
  rainTrustOf,
  totalRecord,
  TRUST_WORD,
  windText,
  windTrustOf,
  type MonthRecord,
  type Trust,
} from '@/lib/track-record';
import type { TrackRecordResponse } from '~/app/routes/api.track-record';

const TRUST_TEXT: Record<Trust, string> = {
  good: 'text-green-700 dark:text-green-400',
  fair: 'text-amber-700 dark:text-amber-400',
  poor: 'text-red-700 dark:text-red-400',
  unknown: 'text-muted-foreground',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A month with fewer scored days than this says too little on its own. */
const MIN_MONTH_DAYS = 10;

interface ForecastTrackRecordProps {
  latitude: number;
  longitude: number;
  /** Today's date where the site is (YYYY-MM-DD): its month leads */
  today: string;
}

function TrustWord({ label, trust }: { label: string; trust: Trust }) {
  return (
    <span className="text-sm">
      {label}: <span className={`font-semibold ${TRUST_TEXT[trust]}`}>{TRUST_WORD[trust]}</span>
    </span>
  );
}

/**
 * How the forecast has done at the airport nearest the site, so a pilot
 * knows how far to trust it there: this month first, then month by month.
 */
export function ForecastTrackRecord({ latitude, longitude, today }: ForecastTrackRecordProps) {
  const fetcher = useFetcher<TrackRecordResponse | { error: string }>();
  const url = `/api/track-record?lat=${latitude.toFixed(4)}&lng=${longitude.toFixed(4)}`;

  useEffect(() => {
    if (fetcher.state === 'idle' && !fetcher.data) fetcher.load(url);
  }, [url, fetcher]);

  const data = fetcher.data;
  let body: React.ReactNode;
  if (!data) {
    body = (
      <p className="text-sm text-muted-foreground">
        Checking how the forecast has done at the nearest airport...
      </p>
    );
  } else if ('error' in data) {
    body = (
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t check the forecast&apos;s track record right now.
      </p>
    );
  } else if (!data.record) {
    body = (
      <p className="text-sm text-muted-foreground">
        No airport within 60 km has enough weather reports, so SoarCast can&apos;t check its
        forecast here.
      </p>
    );
  } else {
    const { record, distanceKm } = data;
    const month = Number(today.slice(5, 7));
    const thisMonth = record.months.find((m) => m.month === month);
    const lead: MonthRecord =
      thisMonth && thisMonth.days >= MIN_MONTH_DAYS ? thisMonth : totalRecord(record.months);
    const leadName = lead.month ? `In ${MONTHS[lead.month - 1]}` : 'Over the year';
    const wind = windText(lead);
    body = (
      <>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <TrustWord label="Rain forecasts" trust={rainTrustOf(lead)} />
          <TrustWord label="Wind" trust={windTrustOf(lead)} />
        </div>
        <p className="text-sm">
          {leadName}: {rainText(lead)} {wind}
        </p>
        <p className="text-xs text-muted-foreground">
          The forecast from the day before against reports from {record.station.name} (
          {record.station.id}), {distanceKm} km away, 10:00-17:00 local time, {record.from} to{' '}
          {record.to}.
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Month by month</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Month</th>
                  <th className="py-1 pr-3 font-medium">Rain called / fell</th>
                  <th className="py-1 pr-3 font-medium">Rain</th>
                  <th className="py-1 pr-3 font-medium">Wind off by</th>
                  <th className="py-1 font-medium">Wind</th>
                </tr>
              </thead>
              <tbody>
                {record.months.map((m) => {
                  const rain = rainTrustOf(m);
                  const windTrust = windTrustOf(m);
                  return (
                    <tr key={m.month} className={m.month === month ? 'font-semibold' : ''}>
                      <td className="py-1 pr-3">{MONTHS[m.month - 1].slice(0, 3)}</td>
                      <td className="py-1 pr-3">
                        {m.rainForecastDays} / {m.rainSeenDays} of {m.days} days
                      </td>
                      <td className={`py-1 pr-3 ${TRUST_TEXT[rain]}`}>{TRUST_WORD[rain]}</td>
                      <td className="py-1 pr-3">
                        {m.windHours ? `${Math.round(m.windAbsErrorSum / m.windHours)} km/h` : '-'}
                      </td>
                      <td className={`py-1 ${TRUST_TEXT[windTrust]}`}>{TRUST_WORD[windTrust]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </>
    );
  }

  return (
    <Card className="gap-3 p-4 sm:p-6">
      <h2 className="text-lg font-semibold">How far to trust the forecast here</h2>
      {body}
    </Card>
  );
}
