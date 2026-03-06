'use client';

import { Clock } from 'lucide-react';

interface StaleDataBadgeProps {
  cacheAgeHours: number;
  className?: string;
}

/**
 * Badge showing when data was last updated
 * Displayed when using stale cache due to API failure
 */
export function StaleDataBadge({ cacheAgeHours, className = '' }: StaleDataBadgeProps) {
  const formatAge = (hours: number): string => {
    if (hours < 1) return 'less than an hour ago';
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day ago' : `${days} days ago`;
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1 text-sm ${className}`}
      role="status"
      aria-label={`Data last updated ${formatAge(cacheAgeHours)}`}
    >
      <Clock className="h-3.5 w-3.5 text-yellow-700 dark:text-yellow-500" />
      <span className="text-yellow-800 dark:text-yellow-400 font-medium">
        Last updated {formatAge(cacheAgeHours)}
      </span>
    </div>
  );
}
