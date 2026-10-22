// SoarCast's background jobs, in their own Worker so the site's pages never
// load what the jobs need (the ERA5 reader is 2 MB of WebAssembly). The cron
// starts a season build unless the last one is still going.

import type { JobsEnv } from './env';

export { SeasonBuild } from './season-build';

const RUNNING = new Set(['queued', 'running', 'waiting', 'paused', 'waitingForPause']);
const INSTANCE_KEY = 'season_build_instance';

async function startSeasonBuild(env: JobsEnv) {
  const last = await env.DB.prepare('SELECT value FROM app_state WHERE key = ?')
    .bind(INSTANCE_KEY)
    .first<{ value: string }>();
  if (last) {
    try {
      const { status } = await (await env.SEASON_BUILD.get(last.value)).status();
      if (RUNNING.has(status)) {
        console.log(`Season build ${last.value} is still ${status}`);
        return;
      }
    } catch {
      // Instances are kept 30 days; a gone one isn't running
    }
  }
  const instance = await env.SEASON_BUILD.create();
  await env.DB.prepare(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(INSTANCE_KEY, instance.id)
    .run();
  console.log(`Season build ${instance.id} started`);
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(startSeasonBuild(env));
  },
} satisfies ExportedHandler<JobsEnv>;
