import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OrientationBadgesProps {
  orientations: Record<string, number>;
  className?: string;
}

/**
 * Displays site orientations as color-coded badges
 * Two checks (●●) = Preferred, one check (●) = Possible
 */
export function OrientationBadges({ orientations, className = '' }: OrientationBadgesProps) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  return (
    <TooltipProvider>
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {directions.map((dir) => {
          const rating = orientations[dir] || 0;
          if (rating === 0) return null;

          return (
            <Tooltip key={dir}>
              <TooltipTrigger asChild>
                <div
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-medium cursor-help ${
                    rating === 2
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}
                >
                  <span>{dir}</span>
                  <span className="text-xs">{rating === 2 ? '●●' : '●'}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{rating === 2 ? '●● = Preferred' : '● = Possible'}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
