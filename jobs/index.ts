// SoarCast's background jobs, in their own Worker so the site's pages never
// load what the jobs need (the ERA5 reader is 2 MB of WebAssembly). Each
// cron starts its job as a Workflow unless the last one is still going.

import type { JobsEnv } from './env';

export { SeasonBuild } from './season-build';
export { NogaSync } from './noga-sync';

const RUNNING = new Set(['queued', 'running', 'waiting', 'paused', 'waitingForPause']);

/** The crons in wrangler.toml, by the job each starts. */
const JOBS: Record<string, { name: string; key: string; workflow: (env: JobsEnv) => Workflow }> = {
  '23 5,17 * * *': {
    name: 'Season build',
    key: 'season_build_instance',
    workflow: (env) => env.SEASON_BUILD,
  },
  '41 4 * * 1': { name: 'NOGA copy', key: 'noga_sync_instance', workflow: (env) => env.NOGA_SYNC },
};

async function startJob(env: JobsEnv, job: (typeof JOBS)[string]) {
  const workflow = job.workflow(env);
  const last = await env.DB.prepare('SELECT value FROM app_state WHERE key = ?')
    .bind(job.key)
    .first<{ value: string }>();
  if (last) {
    try {
      const { status } = await (await workflow.get(last.value)).status();
      if (RUNNING.has(status)) {
        console.log(`${job.name} ${last.value} is still ${status}`);
        return;
      }
    } catch {
      // Instances are kept 30 days; a gone one isn't running
    }
  }
  const instance = await workflow.create();
  await env.DB.prepare(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(job.key, instance.id)
    .run();
  console.log(`${job.name} ${instance.id} started`);
}

export default {
  async scheduled(controller, env, ctx) {
    const job = JOBS[controller.cron];
    if (!job) {
      console.log(`No job for cron ${controller.cron}`);
      return;
    }
    ctx.waitUntil(startJob(env, job));
  },
} satisfies ExportedHandler<JobsEnv>;
