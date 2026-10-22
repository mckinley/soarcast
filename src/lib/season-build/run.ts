// The season build's record of its last run, kept apart from the build's
// code so the site's health check can read it without loading the build.

/** Where the season build records its last run (app_state), for the health check. */
export const SEASON_BUILD_STATE_KEY = 'season_build_last_run';

/** The season build's last run, as it records it in app_state. */
export interface SeasonBuildRun {
  /** The Workflow instance */
  instance: string;
  startedAt: string;
  finishedAt: string;
  /** Sites known, and those whose season was missing, old or rated by an older engine */
  sites: number;
  due: number;
  built: number;
  /** Rated, but with too many days missing to show */
  skipped: number;
  /** Sites (by jobTag) whose ERA5 read or rating failed every try */
  failed: string[];
  dryRun: boolean;
}
