import { Link } from 'react-router';
import type { DayScore } from '@/types';
import { Bell, Trophy } from 'lucide-react';
import { verdictSummary } from '@/lib/forecast-engine';
import type { Comp } from '@/lib/comps';
import { STATUS_CELL, cellDetail, cellLabel, dayStatus } from '@/lib/verdict-display';

interface VerdictCellProps {
  score: DayScore | null;
  showNotification?: boolean;
  /** When provided, the cell links to this site's detail page. */
  href?: string;
  /** A comp on at the site that day: launch will be busy */
  comp?: Comp | null;
  /** The site's name, when the cell stands for an area's best site */
  where?: string;
}

/** One site on one day: the flight it gives and when, or what stops it. Green is a go for the pilot's goal. */
export function VerdictCell({
  score,
  showNotification = false,
  href,
  comp,
  where,
}: VerdictCellProps) {
  if (!score) {
    return (
      <div className="flex h-16 items-center justify-center border border-dashed border-muted-foreground/20 rounded text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  const detail = where ?? cellDetail(score);
  const summary = where ? `${where}: ${verdictSummary(score)}` : verdictSummary(score);
  const title = comp ? `${summary} Comp on: ${comp.name}.` : summary;
  const className = `relative flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded border-2 border-transparent px-1 text-center transition-all hover:border-primary/50 ${STATUS_CELL[dayStatus(score)]}`;

  const content = (
    <>
      {showNotification && (
        <div className="absolute top-1 right-1">
          <Bell className="h-3.5 w-3.5 text-primary fill-primary" />
        </div>
      )}
      {comp && (
        <div className="absolute top-1 left-1">
          <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span className="sr-only">Comp on: {comp.name}</span>
        </div>
      )}
      <div className="text-xs font-semibold leading-tight">{cellLabel(score)}</div>
      {detail && (
        <div className="w-full truncate text-[11px] leading-tight opacity-80">{detail}</div>
      )}
    </>
  );

  if (href) {
    return (
      <Link to={href} className={className} title={title}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} title={title}>
      {content}
    </div>
  );
}
