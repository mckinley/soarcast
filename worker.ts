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
} satisfies ExportedHandler<Env>;
