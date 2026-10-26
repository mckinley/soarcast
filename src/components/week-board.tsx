import { Link } from 'react-router';
import type { DayScore } from '@/types';
import type { Comp } from '@/lib/comps';
import { VerdictCell } from '@/components/verdict-cell';
import { STATUS_DOT, dayName, shortDate, weekdayShort } from '@/lib/verdict-display';

export interface BoardCell {
  date: string;
  score: DayScore | null;
  href?: string;
  comp?: Comp | null;
  /** An alert goes out for this day */
  bell?: boolean;
  /** The site that gives the day, when the row is an area */
  where?: string;
}

export interface BoardRow {
  key: string;
  name: string;
  href: string;
  /** A short line under the name: height, goal, or how many sites */
  meta?: string;
  cells: BoardCell[];
}

// One grid for every screen: on a phone the name sits above its seven days,
// on a computer it takes the first column.
const grid =
  'grid grid-cols-7 gap-0.5 md:grid-cols-[minmax(150px,210px)_repeat(7,minmax(0,1fr))] md:gap-2';

/** The week at each site (or area): one row each, one cell a day. */
export function WeekBoard({
  dates,
  today,
  rows,
  label,
  firstColumn = 'Site',
}: {
  dates: string[];
  today: string;
  rows: BoardRow[];
  label: string;
  firstColumn?: string;
}) {
  return (
    <section
      aria-label={label}
      className="-mx-3 rounded-2xl border bg-card px-1 pb-1 md:mx-0 md:px-5 md:pb-3"
    >
      <div className={`${grid} sticky top-14 z-10 border-b bg-card pt-3 pb-2`}>
        <span className="hidden self-end text-sm text-muted-foreground md:block">
          {firstColumn}
        </span>
        {dates.map((date, i) => (
          <div key={date} className="text-center leading-tight">
            <div className="text-xs font-semibold md:text-sm">
              <span className="md:hidden">{i === 0 ? 'Today' : weekdayShort(date)}</span>
              <span className="hidden md:inline">{dayName(date, today)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground md:text-xs">
              <span className="md:hidden">{Number(date.slice(8, 10))}</span>
              <span className="hidden md:inline">{shortDate(date)}</span>
            </div>
          </div>
        ))}
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className={`${grid} items-center border-b py-2.5 last:border-b-0 md:py-2`}
        >
          <Link
            to={row.href}
            className="col-span-7 flex min-w-0 items-baseline justify-between gap-x-3 px-2 pb-1.5 hover:text-primary md:col-span-1 md:flex-col md:items-start md:gap-0.5 md:px-0 md:pr-3 md:pb-0"
          >
            <span className="truncate text-[15px] font-semibold">{row.name}</span>
            {row.meta && (
              <span className="shrink-0 truncate text-xs text-muted-foreground md:max-w-full">
                {row.meta}
              </span>
            )}
          </Link>
          {row.cells.map((cell) => (
            <VerdictCell
              key={cell.date}
              score={cell.score}
              href={cell.href}
              comp={cell.comp}
              showNotification={cell.bell}
              where={cell.where}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

/** What the cells' colors mean: a go is set by each site's goal. */
export function StatusLegend() {
  const items: Array<[keyof typeof STATUS_DOT, string]> = [
    ['go', 'Go: the flight you want there'],
    ['flyable', 'Flyable: safe, but less than that'],
    ['marginal', 'Marginal: fly with care'],
    ['no', 'Not flyable: says what stops it'],
  ];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      {items.map(([status, text]) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className={`size-2.5 shrink-0 rounded-[3px] ${STATUS_DOT[status]}`} />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
