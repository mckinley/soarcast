import { useFetcher, useLoaderData } from 'react-router';
import type { Route } from './+types/admin.users';
import { requireAdmin } from '~/app/lib/auth.server';
import { adminUsers, setUserRole } from '~/app/lib/admin.server';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';

// /admin/users: every pilot, and who is an admin.

export function meta() {
  return [{ title: 'Users | Admin | SoarCast' }, { name: 'robots', content: 'noindex' }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAdmin(request, env);
  return { users: await adminUsers(env), myId: session.user.id };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAdmin(request, env);
  const form = await request.formData();
  if (form.get('intent') !== 'set-role') return { ok: false as const, error: 'Unknown action.' };
  return setUserRole(env, session.user.id, String(form.get('userId')), form.get('role'));
}

/** A date as UTC, the same on the server and in the browser. */
function day(ms: number | null): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : 'never';
}

type User = Awaited<ReturnType<typeof loader>>['users'][number];

function RoleButton({ user, isMe }: { user: User; isMe: boolean }) {
  const fetcher = useFetcher<typeof action>();
  const admin = user.role === 'admin';
  // Nobody removes their own admin role (src/lib/admin.ts)
  if (admin && isMe) return null;
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;
  return (
    <fetcher.Form method="post" className="flex flex-col items-end gap-1">
      <input type="hidden" name="intent" value="set-role" />
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="role" value={admin ? 'user' : 'admin'} />
      <Button type="submit" variant="outline" size="sm" disabled={fetcher.state !== 'idle'}>
        {admin ? 'Remove admin' : 'Make admin'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </fetcher.Form>
  );
}

export default function AdminUsers() {
  const { users, myId } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {users.length.toLocaleString('en-US')} {users.length === 1 ? 'pilot' : 'pilots'}, newest
        first. Last seen is the last time their session refreshed.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pilot</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead className="text-right">Saved</TableHead>
              <TableHead className="text-right">Custom</TableHead>
              <TableHead>Alerts</TableHead>
              <TableHead className="text-right">Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={u.image || undefined} alt="" />
                      <AvatarFallback>{(u.name || u.email)[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        {u.name}
                        {u.role === 'admin' && <Badge variant="secondary">Admin</Badge>}
                        {u.id === myId && (
                          <span className="text-xs text-muted-foreground">you</span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">{day(u.createdAt)}</TableCell>
                <TableCell className="tabular-nums">{day(u.lastSeen)}</TableCell>
                <TableCell className="text-right tabular-nums">{u.favorites}</TableCell>
                <TableCell className="text-right tabular-nums">{u.customSites}</TableCell>
                <TableCell>{u.push ? 'On a device' : ''}</TableCell>
                <TableCell className="text-right">
                  <RoleButton user={u} isMe={u.id === myId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
