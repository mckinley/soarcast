interface WindDirectionBadgesProps {
  directions: number[];
  className?: string;
}

/**
 * Converts degrees to cardinal/inter cardinal direction
 */
function degreesToCardinal(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((degrees % 360) / 45) % 8);
  return directions[index];
}

/**
 * Displays ideal wind directions as badges with arrow indicators
 */
export function WindDirectionBadges({ directions, className = '' }: WindDirectionBadgesProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {directions.map((deg) => {
        const cardinal = degreesToCardinal(deg);
        return (
          <div
            key={deg}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
          >
            <span
              className="inline-block transform"
              style={{ transform: `rotate(${deg}deg)` }}
              aria-hidden="true"
            >
              ↑
            </span>
            <span>
              {cardinal} ({deg}°)
            </span>
          </div>
        );
      })}
    </div>
  );
}
