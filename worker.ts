import { createRequestHandler, type ServerBuild } from 'react-router';

declare module 'react-router' {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

// Import the built server bundle directly
import * as serverBuild from './build/server/index.js';

const requestHandler = createRequestHandler(serverBuild as unknown as ServerBuild, 'production');

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },

  // Hourly cron (wrangler.toml): the alerts check decides whose morning or
  // evening run is due in their local time.
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const request = new Request(new URL('/api/notifications/check', env.BETTER_AUTH_URL), {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    const response = await requestHandler(request, { cloudflare: { env, ctx } });
    const body = await response.text();
    if (!response.ok) throw new Error(`Alerts check failed: ${response.status} ${body}`);
    console.log(`Alerts check: ${body}`);
  },
} satisfies ExportedHandler<Env>;
