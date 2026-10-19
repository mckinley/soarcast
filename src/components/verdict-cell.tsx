import { Link } from 'react-router';
import type { DayScore } from '@/types';
import { Bell } from 'lucide-react';
import { verdictSummary } from '@/lib/forecast-engine';
import { VERDICT_CELL, VERDICT_WORD, compactWindow, shortReason } from '@/lib/verdict-display';

interface VerdictCellProps {
  score: DayScore | null;
  showNotification?: boolean;
  /** When provided, the cell links to this site's detail page. */
  href?: string;
}

/** One site on one day: the verdict, its window or what stops it. */
export function VerdictCell({ score, showNotification = false, href }: VerdictCellProps) {
  if (!score) {
    return (
      <div className="flex h-16 items-center justify-center border border-dashed border-muted-foreground/20 rounded text-xs text-muted-foreground">
        No data
      </div>
    );
  }

  const detail = score.verdict === 'no' ? shortReason(score) : compactWindow(score.flyableWindow);
  const className = `relative flex h-16 w-full flex-col items-center justify-center gap-0.5 rounded border-2 border-transparent px-1 text-center transition-all hover:border-primary/50 ${VERDICT_CELL[score.verdict]}`;

  const content = (
    <>
      {showNotification && (
        <div className="absolute top-1 right-1">
          <Bell className="h-3.5 w-3.5 text-primary fill-primary" />
        </div>
      )}
      <div className="text-xs font-semibold leading-tight">{VERDICT_WORD[score.verdict]}</div>
      {detail && <div className="text-[11px] leading-tight opacity-80">{detail}</div>}
    </>
  );

  if (href) {
    return (
      <Link to={href} className={className} title={verdictSummary(score)}>
        {content}
      </Link>
    );
  }

  return (
    <div className={className} title={verdictSummary(score)}>
      {content}
    </div>
  );
}
