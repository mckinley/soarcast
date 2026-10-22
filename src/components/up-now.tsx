import { Card } from '@/components/ui/card';
import { ognAnyUp, ognLines, type OgnNow } from '@/lib/ogn';
import { anyoneUp, localClock, upNowLines, type UpNowResult } from '@/lib/up-now';

const link = 'underline underline-offset-2';

/**
 * Who is up at the launch now and how today has gone, from live trackers
 * on Syncing Pilots and the Open Glider Network. Nothing when nobody flew yet.
 */
export function UpNowCard({
  up,
  ogn,
  launchAltitude,
  timeZone,
}: {
  up: UpNowResult | null;
  ogn: OgnNow | null;
  launchAltitude: number | null;
  timeZone: string | null;
}) {
  const spLines = up ? upNowLines(up, launchAltitude) : null;
  const ognText = ogn ? ognLines(ogn, launchAltitude) : null;
  if (!spLines && !ognText) return null;
  const live = (up != null && anyoneUp(up)) || (ogn != null && ognAnyUp(ogn));
  const at = up?.at ?? ogn?.at;
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
      {spLines && <p className="text-sm">{spLines.join(' ')}</p>}
      {ognText && <p className="text-sm">{ognText.join(' ')}</p>}
      <p className="text-xs text-muted-foreground">
        Only pilots who share a live tracker on{' '}
        <a href="https://syncingpilots.com" className={link}>
          Syncing Pilots
        </a>
        , or carry a tracker the{' '}
        <a href="https://www.glidernet.org" className={link} target="_blank" rel="noreferrer">
          Open Glider Network
        </a>{' '}
        picks up, show here. OGN data is under the{' '}
        <a
          href="https://opendatacommons.org/licenses/odbl/"
          className={link}
          target="_blank"
          rel="noreferrer"
        >
          ODbL
        </a>
        .{at && timeZone ? ` Checked at ${localClock(at, timeZone)}.` : ''}
      </p>
    </Card>
  );
}
