import { NavLink, Outlet } from 'react-router';
import type { Route } from './+types/admin';
import { requireAdmin } from '~/app/lib/auth.server';

// The admin section: signed-out visitors go to /login, other pilots get a 403.
// This layout's gate covers the pages, but React Router can run one route's
// loader or action alone, so every loader and action under /admin calls
// requireAdmin too (one session lookup per request either way). Admins are
// made with `npm run make-admin` (or the "Make admin" workflow), then on
// /admin/users.

export function meta() {
  return [{ title: 'Admin | SoarCast' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdmin(request, context.cloudflare.env as Env);
  return { userId: session.user.id };
}

const sections = [
  { title: 'Overview', href: '/admin', end: true },
  { title: 'Users', href: '/admin/users', end: false },
];

export default function AdminLayout() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <nav className="mt-4 flex gap-1 border-b">
          {sections.map((s) => (
            <NavLink
              key={s.href}
              to={s.href}
              end={s.end}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-3 py-2 text-sm ${
                  isActive
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`
              }
            >
              {s.title}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
