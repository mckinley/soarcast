'use client';

import { Badge } from '@/components/ui/badge';
import type { DayScore } from '@/types';

interface ScoreCellProps {
  score: DayScore | null;
  onClick?: () => void;
}

/**
 * Get color class based on score value
 */
function getScoreColorClass(score: number): string {
  if (score <= 30) return 'bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-500/30';
  if (score <= 50)
    return 'bg-orange-500/20 text-orange-700 dark:text-orange-400 hover:bg-orange-500/30';
  if (score <= 70)
    return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/30';
  if (score <= 85) return 'bg-lime-500/20 text-lime-700 dark:text-lime-400 hover:bg-lime-500/30';
  return 'bg-green-500/20 text-green-700 dark:text-green-400 hover:bg-green-500/30';
}

export function ScoreCell({ score, onClick }: ScoreCellProps) {
  if (!score) {
    return (
      <div className="flex h-16 items-center justify-center border border-dashed border-muted-foreground/20 rounded text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`flex h-16 w-full flex-col items-center justify-center gap-1 rounded border-2 border-transparent transition-all hover:border-primary/50 ${getScoreColorClass(score.overallScore)}`}
    >
      <div className="text-2xl font-bold">{score.overallScore}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide opacity-80">
        {score.label}
      </div>
    </button>
  );
}
