import { Card } from '@/components/ui/card';
import { anyoneUp, localClock, upNowLines, type UpNowResult } from '@/lib/up-now';

/** Who is up at the launch now and how today has gone, from live trackers. Nothing when nobody flew yet. */
export function UpNowCard({ up, launchAltitude }: { up: UpNowResult; launchAltitude: number | null }) {
  const lines = upNowLines(up, launchAltitude);
  if (!lines) return null;
  const live = anyoneUp(up);
  return (
    <Card className="gap-2 p-4 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {live && (
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-green-600" />
          </span>
        )}
        {live ? 'Up now' : 'Flown today'}
      </h2>
      <p className="text-sm">{lines.join(' ')}</p>
      <p className="text-xs text-muted-foreground">
        Only pilots who share a live tracker show here, from{' '}
        <a href="https://syncingpilots.com" className="underline underline-offset-2">
          Syncing Pilots
        </a>
        . Checked at {localClock(up.at, up.query.timeZone)}.
      </p>
    </Card>
  );
}
