import { Link } from 'react-router';
import type { DayScore } from '@/types';
import { Bell, Trophy } from 'lucide-react';
import { verdictSummary } from '@/lib/forecast-engine';
import type { Comp } from '@/lib/comps';
import {
  STATUS_CELL,
  STATUS_WORD,
  cellDetail,
  cellLabel,
  dayStatus,
  shortReason,
} from '@/lib/verdict-display';

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

const base =
  'relative flex h-[52px] w-full min-w-0 flex-col items-center justify-center gap-px rounded-lg text-center leading-tight transition md:h-[58px] md:px-1';

/** One site on one day: the flight it gives and when, or what stops it. Solid green is a go for the pilot's goal. */
export function VerdictCell({
  score,
  showNotification = false,
  href,
  comp,
  where,
}: VerdictCellProps) {
  if (!score) {
    return (
      <div
        className={`${base} border border-dashed border-border text-[11px] text-muted-foreground`}
      >
        No data
      </div>
    );
  }

  // A day that isn't flyable says what stops it: the grey already says Not flyable
  const status = dayStatus(score);
  const label = status === 'no' ? (shortReason(score) ?? STATUS_WORD.no) : cellLabel(score);
  const detail = where ?? (status === 'no' ? null : cellDetail(score));
  const summary = where ? `${where}: ${verdictSummary(score)}` : verdictSummary(score);
  const title = comp ? `${summary} Comp on: ${comp.name}.` : summary;
  const className = `${base} ${STATUS_CELL[status]}`;

  const content = (
    <>
      {showNotification && (
        <Bell
          className="absolute top-1 right-1 size-3 fill-current opacity-80"
          aria-label="Alert day"
        />
      )}
      {comp && (
        <span className="absolute top-1 left-1">
          <Trophy className="size-3" aria-hidden />
          <span className="sr-only">Comp on: {comp.name}</span>
        </span>
      )}
      <span className="w-full text-[10.5px] font-semibold tracking-[-0.01em] md:text-[13px] md:tracking-normal">
        {status === 'no' && label !== STATUS_WORD.no && (
          <span className="sr-only">{STATUS_WORD.no}: </span>
        )}
        {label}
      </span>
      {detail && (
        <span className="w-full truncate text-[10px] opacity-90 md:text-xs">{detail}</span>
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
