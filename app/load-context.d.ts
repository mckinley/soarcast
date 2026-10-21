export {};

declare module 'react-router' {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
      /** Where the request comes from, roughly (missing for the cron's own requests) */
      cf?: IncomingRequestCfProperties;
    };
  }
}
