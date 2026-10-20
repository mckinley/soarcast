import { LAPSE_BANDS, LAPSE_GROUP_LABEL, type LapseGroup } from './lapse-rate-utils';
import { windBarbPath, windSpeedToBarb } from './wind-barb-utils';

const GROUPS: LapseGroup[] = ['inversion', 'stable', 'conditional', 'unstable'];

function Sample({ children }: { children: React.ReactNode }) {
  return (
    <svg width={30} height={18} viewBox="-15 -9 30 18" className="shrink-0" aria-hidden>
      {children}
    </svg>
  );
}

/** How to read the windgram: the lapse-rate colors and each symbol */
export function WindgramLegend({ maxWindSpeed }: { maxWindSpeed?: number }) {
  const breaks = LAPSE_BANDS.slice(1).map((b) => b.min);
  const barb = windBarbPath(windSpeedToBarb(25, 270), 14);

  return (
    <div className="space-y-3 text-xs text-muted-foreground">
      <div>
        <p className="mb-1.5 font-medium text-foreground">
          Background: how fast the air cools with height (°C per 1000 ft)
        </p>
        <div className="flex h-4 overflow-hidden rounded border border-border">
          {LAPSE_BANDS.map((band) => (
            <div key={band.min} className="flex-1" style={{ backgroundColor: band.color }} />
          ))}
        </div>
        <div className="relative mt-0.5 h-4">
          {breaks.map((b, i) => (
            <span
              key={b}
              className="absolute -translate-x-1/2 tabular-nums"
              style={{ left: `${((i + 1) / LAPSE_BANDS.length) * 100}%` }}
            >
              {b}
            </span>
          ))}
        </div>
        <div className="flex">
          {GROUPS.map((group) => {
            const count = LAPSE_BANDS.filter((b) => b.group === group).length;
            return (
              <span key={group} className="text-center leading-tight" style={{ flex: count }}>
                {LAPSE_GROUP_LABEL[group]}
              </span>
            );
          })}
        </div>
        <p className="mt-1.5">
          Rising dry air cools 3° per 1000 ft. Thermals climb through red, orange, pink and
          lavender, fade in tan, and stop where it turns blue or grey.
        </p>
      </div>

      <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <Sample>
            <rect x={-15} y={-9} width={30} height={18} fill="rgb(128,128,230)" />
            <g transform="translate(9,2) rotate(270)">
              <path d={barb} fill="none" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" />
            </g>
          </Sample>
          <span>
            Wind barbs point into the wind, in km/h: long feather 10, short 5, flag 50
            {maxWindSpeed !== undefined && <>; red is over this site&apos;s {maxWindSpeed} km/h</>}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Sample>
            <line x1={-13} x2={13} y1={0} y2={0} stroke="rgba(0,0,0,0.6)" strokeWidth={5} strokeLinecap="round" />
            <line x1={-13} x2={13} y1={0} y2={0} stroke="#fde047" strokeWidth={2.5} strokeLinecap="round" />
          </Sample>
          <span>Top of lift, in hours with thermals of 1 m/s or more</span>
        </li>
        <li className="flex items-center gap-2">
          <Sample>
            <path
              d="M-9 3a3.5 3.5 0 0 1 2-6.4a5 5 0 0 1 9.2-1.6a4 4 0 0 1 6.6 3.4a3 3 0 0 1 0.2 4.6Z"
              fill="#fff"
              stroke="rgba(60,60,80,0.8)"
            />
          </Sample>
          <span>Cumulus base, where thermals reach it</span>
        </li>
        <li className="flex items-center gap-2">
          <Sample>
            <defs>
              <pattern id="legend-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={6} stroke="rgba(25,25,40,0.6)" strokeWidth={1.2} />
              </pattern>
            </defs>
            <rect x={-15} y={-9} width={30} height={18} fill="rgb(204,191,255)" />
            <rect x={-15} y={-9} width={30} height={18} fill="url(#legend-hatch)" />
          </Sample>
          <span>Cloud in the model (hatched)</span>
        </li>
        <li className="flex items-center gap-2">
          <Sample>
            <line x1={-13} x2={13} y1={-3} y2={-3} stroke="rgba(30,30,120,0.7)" />
            <line x1={-13} x2={13} y1={4} y2={4} stroke="#1d4ed8" strokeWidth={1.6} strokeDasharray="5 3" />
          </Sample>
          <span>Temperature every 5 °C; dashed blue is freezing</span>
        </li>
        <li className="flex items-center gap-2">
          <Sample>
            <line x1={-13} x2={13} y1={0} y2={0} stroke="currentColor" strokeWidth={1.5} strokeDasharray="7 4" />
          </Sample>
          <span>Launch height; dark ground is the model&apos;s terrain</span>
        </li>
      </ul>
    </div>
  );
}
