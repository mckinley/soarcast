import { Link } from 'react-router';
import type { SiteTerrain } from '@/types';

/**
 * Said after a site's terrain: what big mountains change in its rating, or
 * where to switch the wider margins on. Nothing at a ridge site, which keeps
 * the usual rules.
 */
export function MountainMarginsNote({
  ground,
  rated,
  ridge,
  signedIn,
}: {
  ground: SiteTerrain;
  /** The rating keeps wider margins here */
  rated: boolean;
  ridge: boolean;
  signedIn: boolean;
}) {
  if (ground !== 'mountains' || ridge) return null;
  if (rated) {
    return (
      <span className="text-xs">
        {' '}
        · less wind, wind higher up and storms count more.{' '}
        <Link to="/guide/how-a-day-is-rated#big-mountains" className="underline">
          Why
        </Link>
      </span>
    );
  }
  if (!signedIn) return null;
  return (
    <span className="text-xs">
      {' '}
      ·{' '}
      <Link to="/settings#mountain-margins" className="underline">
        Wider margins
      </Link>{' '}
      are off
    </span>
  );
}
