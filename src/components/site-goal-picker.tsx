import { useFetcher } from 'react-router';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GOAL_HINT, GOAL_LABEL, SITE_GOALS, SITE_KIND_LABEL, SITE_KINDS } from '@/lib/site-goals';
import type { SiteGoal, SiteKind } from '@/types';

/** A site the pilot follows or pinned, whose goal and kind they can change. */
export interface GoalTarget {
  siteId: string;
  source: 'launch' | 'custom';
}

/**
 * Saves a site goal or kind on the settings route, which every page's
 * loader then reflects: a day turns green when it meets the new goal.
 */
function useSiteSetting(target: GoalTarget, intent: 'updateSiteGoal' | 'updateSiteKind') {
  const fetcher = useFetcher({ key: `${intent}:${target.siteId}` });
  const pending = fetcher.formData?.get('value');
  const save = (value: string) =>
    fetcher.submit(
      { intent, siteId: target.siteId, source: target.source, value },
      { method: 'post', action: '/settings' },
    );
  return { pending: typeof pending === 'string' ? pending : undefined, save };
}

export function SiteGoalSelect({
  target,
  goal,
  id,
}: {
  target: GoalTarget;
  goal: SiteGoal;
  id?: string;
}) {
  const { pending, save } = useSiteSetting(target, 'updateSiteGoal');
  const value = (pending as SiteGoal | undefined) || goal;
  return (
    <Select value={value} onValueChange={save}>
      <SelectTrigger id={id} size="sm" className="w-[264px] max-w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SITE_GOALS.map((g) => (
          <SelectItem key={g} value={g}>
            {GOAL_LABEL[g]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** What the site gives; "listed" uses Paragliding Earth's tags. */
export function SiteKindSelect({
  target,
  kind,
  listedKind,
  id,
}: {
  target: GoalTarget;
  /** The pilot's own choice, null when they haven't made one */
  kind: SiteKind | null;
  /** What the site's listing says, for listed sites */
  listedKind?: SiteKind | null;
  id?: string;
}) {
  const { pending, save } = useSiteSetting(target, 'updateSiteKind');
  const value = pending !== undefined ? pending || 'listed' : (kind ?? 'listed');
  const listedText =
    target.source === 'launch'
      ? `As listed: ${listedKind ? SITE_KIND_LABEL[listedKind] : 'not tagged'}`
      : 'Not sure: go by the weather';
  return (
    <Select value={value} onValueChange={(v) => save(v === 'listed' ? '' : v)}>
      <SelectTrigger id={id} size="sm" className="w-[264px] max-w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="listed">{listedText}</SelectItem>
        {SITE_KINDS.map((k) => (
          <SelectItem key={k} value={k}>
            {SITE_KIND_LABEL[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The goal line on a site page: what makes a day a go here, and a way to change it. */
export function SiteGoalLine({ target, goal }: { target?: GoalTarget; goal: SiteGoal }) {
  return (
    <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
      <span className="font-medium">Worth going when</span>
      {target ? <SiteGoalSelect target={target} goal={goal} /> : <span>{GOAL_LABEL[goal]}</span>}
      <span className="text-muted-foreground">
        {GOAL_HINT[goal]}
        {!target && ' Add the site to Favorites to change it.'}
      </span>
    </div>
  );
}
