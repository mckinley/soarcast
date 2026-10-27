'use client';

import * as React from 'react';
import { Link, useLocation, useNavigate, useRouteLoaderData } from 'react-router';
import {
  CloudSun,
  Sun,
  Moon,
  LogOut,
  MapPin,
  CalendarRange,
  BookOpen,
  Settings as SettingsIcon,
  ShieldCheck,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type { loader as rootLoader } from '~/app/root';
import { isAdmin } from '~/lib/admin';
import { Logo } from '@/components/logo';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type NavItem = { title: string; href: string; icon: typeof CloudSun };

/**
 * The three jobs: the week ahead at saved sites, trips months ahead, and
 * finding a site. The top bar on a computer, the tab bar on a phone.
 * Settings, Admin and signing out live in the account menu only.
 */
const mainNav: NavItem[] = [
  { title: 'Forecast', href: '/dashboard', icon: CloudSun },
  { title: 'Planning', href: '/planning', icon: CalendarRange },
  { title: 'Sites', href: '/sites', icon: MapPin },
];

/** Help, quieter: on the right of the top bar, the last tab on a phone. */
const guideNav: NavItem = { title: 'Guide', href: '/guide', icon: BookOpen };

function useUser() {
  // The root loader already looked up who is signed in
  return useRouteLoaderData<typeof rootLoader>('root')?.user ?? null;
}

/** Whether a nav item is the current section: its page or a page under it. */
function isCurrent(pathname: string, href: string): boolean {
  // A private site belongs with Forecast; every other site page with Sites
  const ownSite = pathname.startsWith('/sites/custom');
  if (href === '/sites') return pathname.startsWith('/sites') && !ownSite;
  if (href === '/dashboard' && ownSite) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useMounted() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const dark = mounted && resolvedTheme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="size-9 text-muted-foreground hover:text-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="sr-only">{dark ? 'Light colors' : 'Dark colors'}</span>
    </Button>
  );
}

async function signOut() {
  // Loaded on demand: only signing out needs the auth client in the browser
  const { authClient } = await import('~/app/lib/auth-client');
  await authClient.signOut();
  // A full load, so every loader sees the signed-out state
  window.location.assign('/');
}

function initials(user: { name?: string | null; email?: string | null }): string {
  return (
    user.name
      ?.split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    user.email?.[0]?.toUpperCase() ||
    '?'
  );
}

function UserMenu() {
  const user = useUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!user) {
    // The sign-in page is where the button would go
    if (pathname === '/login') return null;
    return (
      <Button onClick={() => navigate('/login')} size="sm">
        Sign in
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative size-9 rounded-full p-0" aria-label="Account">
          <Avatar className="size-9">
            <AvatarImage src={user.image || undefined} alt={user.name || 'Account'} />
            <AvatarFallback className="bg-accent font-semibold text-primary">
              {initials(user)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm leading-none font-medium">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            <SettingsIcon className="mr-2 size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        {isAdmin(user) && (
          <DropdownMenuItem asChild>
            <Link to="/admin" className="cursor-pointer">
              <ShieldCheck className="mr-2 size-4" />
              Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={signOut}
        >
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The top bar: the logo (home: Forecast when signed in), the main places, then help and the account. */
function TopBar() {
  const { pathname } = useLocation();
  const guideCurrent = isCurrent(pathname, guideNav.href);
  return (
    <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:gap-6 md:px-6">
        <Link to="/" className="rounded-md" aria-label="SoarCast home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {mainNav.map((item) => {
            const current = isCurrent(pathname, item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={current ? 'page' : undefined}
                className={`rounded-md px-3 py-2 text-[15px] font-medium transition-colors ${
                  current ? 'bg-accent text-primary' : 'text-foreground hover:bg-accent/70'
                }`}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <Link
          to={guideNav.href}
          aria-current={guideCurrent ? 'page' : undefined}
          className={`hidden rounded-md px-2.5 py-2 text-sm transition-colors hover:text-foreground md:block ${
            guideCurrent ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {guideNav.title}
        </Link>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

function tabClass(current: boolean) {
  return `flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
    current ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
  }`;
}

/** The tab bar at the bottom of a phone's screen. */
function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card/95 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
    >
      {[...mainNav, guideNav].map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <Link
            key={item.href}
            to={item.href}
            aria-current={current ? 'page' : undefined}
            className={tabClass(current)}
          >
            <item.icon className="size-[22px]" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <TopBar />
      {/* min-w-0 lets the page shrink below its widest child (the windgram,
          wide tables), which otherwise pushes it past the phone's edge. The
          bottom padding keeps the end of the page clear of the tab bar. */}
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 pt-5 pb-28 md:px-6 md:pt-8 md:pb-16">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
