import type { SeasonBuildParams } from './season-build';
import type { EnsembleParams } from './ensembles';

/** The jobs Worker's bindings (jobs/wrangler.toml). */
export interface JobsEnv {
  /** SoarCast's database */
  DB: D1Database;
  /** pgsites' database, read only: the listed launch each destination stands for */
  PGSITES: D1Database;
  SEASON_BUILD: Workflow<SeasonBuildParams>;
  NOGA_SYNC: Workflow;
  ENSEMBLES: Workflow<EnsembleParams>;
}
