import { COMPASS_POINTS } from '@/lib/site-utils';

/** 2 = works well, 1 = works cross, 0 = doesn't work */
export type DirectionRating = 0 | 1 | 2;

const INNER_RADIUS = 24;
const OUTER_RADIUS = 78;
const LABEL_RADIUS = 92;

const RATING_TEXT: Record<DirectionRating, string> = {
  2: 'works well',
  1: 'works cross',
  0: "doesn't work",
};

const RATING_FILL: Record<DirectionRating, string> = {
  2: 'fill-green-500/80 hover:fill-green-500',
  1: 'fill-sky-400/70 hover:fill-sky-400',
  0: 'fill-muted hover:fill-muted-foreground/30',
};

// Off, then works well, then cross: most launches have one or two good
// directions, so the first tap is the common case.
const NEXT_RATING: Record<DirectionRating, DirectionRating> = { 0: 2, 2: 1, 1: 0 };

function point(degrees: number, radius: number): string {
  const rad = (degrees * Math.PI) / 180;
  return `${(radius * Math.sin(rad)).toFixed(2)} ${(-radius * Math.cos(rad)).toFixed(2)}`;
}

function wedgePath(center: number): string {
  const start = center - 22.5;
  const end = center + 22.5;
  return [
    `M ${point(start, INNER_RADIUS)}`,
    `L ${point(start, OUTER_RADIUS)}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${point(end, OUTER_RADIUS)}`,
    `L ${point(end, INNER_RADIUS)}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${point(start, INNER_RADIUS)}`,
    'Z',
  ].join(' ');
}

interface LaunchDirectionPickerProps {
  /** Rating per compass direction in degrees (0, 45, ... 315); missing = 0 */
  ratings: Record<number, DirectionRating>;
  /** Omit for a read-only rose */
  onChange?: (degrees: number, rating: DirectionRating) => void;
  className?: string;
}

/**
 * A compass rose of the wind directions a launch works in. Each wedge is
 * the direction the wind comes from; tapping one cycles works well, works
 * cross, off.
 */
export function LaunchDirectionPicker({
  ratings,
  onChange,
  className,
}: LaunchDirectionPickerProps) {
  return (
    <svg
      viewBox="-110 -110 220 220"
      className={className ?? 'w-56 h-56'}
      role="group"
      aria-label="Wind directions the launch works in"
    >
      {COMPASS_POINTS.map(({ label, degrees }) => {
        const rating = ratings[degrees] ?? 0;
        const cycle = () => onChange?.(degrees, NEXT_RATING[rating]);
        return (
          <g key={degrees}>
            <path
              d={wedgePath(degrees)}
              className={`stroke-background stroke-2 transition-colors ${RATING_FILL[rating]} ${
                onChange ? 'cursor-pointer focus:outline-none focus-visible:stroke-ring' : ''
              }`}
              role={onChange ? 'button' : 'img'}
              tabIndex={onChange ? 0 : undefined}
              aria-label={`${label} wind: ${RATING_TEXT[rating]}`}
              onClick={onChange ? cycle : undefined}
              onKeyDown={
                onChange
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        cycle();
                      }
                    }
                  : undefined
              }
            />
            <text
              x={point(degrees, LABEL_RADIUS).split(' ')[0]}
              y={point(degrees, LABEL_RADIUS).split(' ')[1]}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted-foreground text-[13px] font-medium select-none pointer-events-none"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function DirectionLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-green-500/80" /> Works well
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-sky-400/70" /> Works cross
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-muted border" /> Doesn&apos;t work
      </span>
    </div>
  );
}
