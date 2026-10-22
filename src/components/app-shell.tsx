'use client';

import * as React from 'react';
import { Link, useLocation, useNavigate, useRouteLoaderData } from 'react-router';
import {
  Cloud,
  LayoutDashboard,
  Menu,
  Sun,
  Moon,
  LogOut,
  Compass,
  CalendarRange,
  BookOpen,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type { loader as rootLoader } from '~/app/root';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';

type NavItem = { title: string; href: string; icon: typeof Cloud };

/** The places pilots go to plan flying, at the top of the menu. */
const mainNav: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Planning', href: '/planning', icon: CalendarRange },
  { title: 'Browse Sites', href: '/sites/browse', icon: Compass },
];

/** Help and settings, quieter at the bottom of the menu. */
const footerNav: NavItem[] = [
  { title: 'Guide', href: '/guide', icon: BookOpen },
  { title: 'Settings', href: '/settings', icon: SettingsIcon },
];

/** Whether a nav item is the current section: its page or a page under it. */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="h-9 w-9">
        <Sun className="h-4 w-4" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="h-9 w-9"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

function UserMenu() {
  // The root loader already looked up who is signed in
  const user = useRouteLoaderData<typeof rootLoader>('root')?.user ?? null;
  const navigate = useNavigate();

  if (!user) {
    return (
      <Button onClick={() => navigate('/auth/signin')} variant="default" size="sm">
        Sign In
      </Button>
    );
  }

  const userInitials =
    user.name
      ?.split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ||
    user.email?.[0]?.toUpperCase() ||
    '?';

  const handleSignOut = async () => {
    // Loaded on demand: only signing out needs the auth client in the browser
    const { authClient } = await import('~/app/lib/auth-client');
    await authClient.signOut();
    // A full load, so every loader sees the signed-out state
    window.location.assign('/');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.image || undefined} alt={user.name || 'User'} />
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="cursor-pointer">
            <SettingsIcon className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The logo, which goes home: the dashboard when signed in, else the welcome page. */
function HomeLink({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="flex w-fit items-center gap-2 rounded-md">
      <Cloud className="h-6 w-6" />
      <span className="text-lg font-semibold">SoarCast</span>
    </Link>
  );
}

function SidebarNav({
  items,
  pathname,
  quiet,
}: {
  items: NavItem[];
  pathname: string;
  quiet?: boolean;
}) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            asChild
            size={quiet ? 'sm' : 'default'}
            isActive={isCurrent(pathname, item.href)}
            className={
              quiet ? 'text-muted-foreground data-[active=true]:text-foreground' : undefined
            }
          >
            <Link to={item.href}>
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

function AppSidebar() {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <HomeLink />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarNav items={mainNav} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarNav items={footerNav} pathname={pathname} quiet />
      </SidebarFooter>
    </Sidebar>
  );
}

function MobileNavLink({
  item,
  current,
  onClick,
  quiet,
}: {
  item: NavItem;
  current: boolean;
  onClick: () => void;
  quiet?: boolean;
}) {
  // Footer items stay full height for tapping, but in a quieter color
  const tone = current ? 'bg-accent text-foreground' : quiet ? 'text-muted-foreground' : '';
  return (
    <Link
      to={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${tone}`}
    >
      <item.icon className="h-4 w-4" />
      <span>{item.title}</span>
    </Link>
  );
}

function MobileNav() {
  const [open, setOpen] = React.useState(false);
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-64 flex-col gap-0 p-0">
        <div className="border-b px-6 py-4">
          <HomeLink onClick={() => setOpen(false)} />
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-4">
          {mainNav.map((item) => (
            <MobileNavLink
              key={item.href}
              item={item}
              current={isCurrent(pathname, item.href)}
              onClick={() => setOpen(false)}
            />
          ))}
        </nav>
        <nav className="flex flex-col gap-1 border-t p-4">
          {footerNav.map((item) => (
            <MobileNavLink
              key={item.href}
              item={item}
              current={isCurrent(pathname, item.href)}
              onClick={() => setOpen(false)}
              quiet
            />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>

        {/* Main Content. min-w-0 lets it shrink below its widest child (the
            windgram, wide tables), which otherwise pushes the page past the
            phone's edge where the sidebar wrapper clips it. */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 md:px-6">
            <MobileNav />
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
