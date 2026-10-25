import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
  useRouteLoaderData,
} from 'react-router';
import type { Route } from './+types/root';
import { getSession } from './lib/auth.server';
import { canonicalHref } from '~/lib/canonical-url';
import { ThemeProvider } from '~/components/theme-provider';
import { TooltipProvider } from '~/components/ui/tooltip';
import { AppShell } from '~/components/app-shell';
import { buttonVariants } from '~/components/ui/button';
import './globals.css';

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);
  const url = new URL(request.url);
  return {
    user: session?.user ?? null,
    // The page's one address for search engines (pjmgmt's canonical-urls standard)
    canonical: canonicalHref(url.origin, url.pathname),
    // The map's Airspace layer shows only once openAIP's key is set
    airspace: Boolean(env.OPENAIP_API_KEY),
    // The staging copy (docs/staging.md) says so on every page
    staging: env.APP_ENV === 'staging',
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>('root');
  // An error page names no address
  const error = useRouteError();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#3b82f6" />
        <script dangerouslySetInnerHTML={{ __html: 'var __name=(fn)=>fn' }} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.svg" />
        {data?.canonical && !error && <link rel="canonical" href={data.canonical} />}
        <Meta />
        <Links />
      </head>
      <body className="font-sans antialiased">
        {data?.staging && (
          <div className="pointer-events-none fixed bottom-2 left-2 z-50 rounded-md bg-amber-400 px-2 py-1 text-xs font-medium text-black shadow">
            Staging · fake data
          </div>
        )}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <AppShell>
          <Outlet context={{ user }} />
        </AppShell>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Something went wrong';
  let details = 'SoarCast hit an unexpected error. Try again, or head back to the dashboard.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? 'Page not found' : 'Something went wrong';
    details =
      error.status === 404
        ? "That page doesn't exist, or the site has moved."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <AppShell>
          <div className="flex flex-col items-center py-16 text-center">
            <h1 className="text-3xl font-bold">{message}</h1>
            <p className="mt-2 max-w-md text-muted-foreground">{details}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/dashboard" className={buttonVariants()}>
                Dashboard
              </Link>
              <Link to="/sites/browse" className={buttonVariants({ variant: 'outline' })}>
                Browse sites
              </Link>
            </div>
            {stack && (
              <pre className="mt-6 max-w-full overflow-auto rounded bg-muted p-4 text-left text-xs">
                {stack}
              </pre>
            )}
          </div>
        </AppShell>
      </TooltipProvider>
    </ThemeProvider>
  );
}
