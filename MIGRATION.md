# SoarCast: Next.js → React Router v7 + Cloudflare Migration

## Status

**Infrastructure (DONE):**

- [x] RR7 + Vite + CF config files
- [x] Database layer (Turso via `app/lib/db.server.ts`)
- [x] Better Auth setup with Google + GitHub OAuth (`app/lib/auth.server.ts`)
- [x] Auth catch-all route (`app/routes/auth.$.tsx`)
- [x] Sign-in page (`app/routes/auth.signin.tsx`)
- [x] Protected layout (`app/routes/_auth.tsx`)
- [x] Landing page skeleton (`app/routes/_index.tsx`)
- [x] Dashboard skeleton with loader (`app/routes/_auth.dashboard.tsx`)
- [x] Sites browse with loader (`app/routes/sites.browse.tsx`)
- [x] API resource route patterns (`app/routes/api.sites.tsx`, `api.notifications.check.tsx`)
- [x] GitHub Actions deploy workflow
- [x] wrangler.toml + worker-configuration.d.ts

**Routes (DONE — all loaders/actions ported):**

- [x] Landing page with auth redirect (`_index.tsx`)
- [x] Sign-in page with OAuth (`auth.signin.tsx`)
- [x] Auth catch-all (`auth.$.tsx`)
- [x] Protected layout (`_auth.tsx`)
- [x] Dashboard with full forecast/scoring logic (`_auth.dashboard.tsx`)
- [x] Settings with all actions ported (`_auth.settings.tsx`)
- [x] Sites browse with filtering/scoring/favorites (`sites.browse.tsx`)
- [x] Site detail with favorite actions (`sites.$slug.tsx`)
- [x] API: sites list (`api.sites.tsx`)
- [x] API: sites by slug (`api.sites.$slug.tsx`)
- [x] API: site atmospheric profile (`api.sites.$slug.profile.tsx`)
- [x] API: weather profile (`api.weather.profile.tsx`)
- [x] API: notifications subscribe/unsubscribe (`api.notifications.subscribe.tsx`)
- [x] API: notifications check — FULL cron logic ported (`api.notifications.check.tsx`)

**Remaining (TODO):**

- [ ] Adapt client components for RR7 (replace `next/link`, `useRouter`, `next/dynamic`, server action calls)
- [ ] Better Auth database migration (add BA tables, migrate users)
- [ ] Update `package.json` dependencies (swap next → react-router, add CF adapter)
- [ ] Remove Next.js files (`src/app/`, `next.config.ts`, etc.)
- [ ] Set CF secrets via wrangler
- [ ] Test end-to-end
- [ ] DNS cutover

---

## Key Patterns (Reference for Porting)

### 1. Data Loading: Server Components → Loaders

**Before (Next.js):**

```tsx
// src/app/dashboard/page.tsx
import { auth } from '@/auth'
import { db } from '@/db'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/')
  const data = await db.select()...
  return <DashboardClient data={data} />
}
```

**After (RR7):**

```tsx
// app/routes/_auth.dashboard.tsx
import { useLoaderData } from 'react-router'
import { requireAuth } from '~/app/lib/auth.server'
import { getDb } from '~/app/lib/db.server'

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env
  const session = await requireAuth(request, env)
  const db = getDb(env)
  const data = await db.select()...
  return { data }
}

export default function DashboardPage() {
  const { data } = useLoaderData<typeof loader>()
  return <DashboardClient data={data} />
}
```

### 2. Server Actions → RR7 Actions

**Before (Next.js):**

```tsx
// src/app/dashboard/actions.ts
'use server';
import { auth } from '@/auth';
import { db } from '@/db';

export async function refreshAllForecasts() {
  const session = await auth();
  // ...do stuff
}
```

**After (RR7):**

```tsx
// In the route file itself:
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const formData = await request.formData();
  const intent = formData.get('intent');
  // ...do stuff based on intent
}
```

Client-side, replace `useTransition` + server action calls with `useFetcher`:

```tsx
const fetcher = useFetcher();
fetcher.submit({ intent: 'refreshForecasts' }, { method: 'POST' });
```

### 3. API Routes → Resource Routes

**Before (Next.js):**

```tsx
// src/app/api/sites/route.ts
import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ sites: [...] })
}
```

**After (RR7):**

```tsx
// app/routes/api.sites.tsx (no default export = resource route)
export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env
  const db = getDb(env)
  return Response.json({ sites: [...] })
}
```

### 4. Middleware → Protected Layout

Next.js middleware is replaced by the `_auth.tsx` layout route.
Any route prefixed with `_auth.` is a child of this layout and requires authentication.

### 5. Dynamic Imports (Leaflet)

**Before:**

```tsx
import dynamic from 'next/dynamic';
const Map = dynamic(() => import('./map-display'), { ssr: false });
```

**After:**

```tsx
import { lazy, Suspense } from 'react'
const Map = lazy(() => import('./map-display'))
// In render:
<Suspense fallback={<div>Loading map...</div>}>
  <Map {...props} />
</Suspense>
```

Note: For Leaflet, you may also need to guard with `typeof window !== 'undefined'` checks.

### 6. Links

Replace `import Link from 'next/link'` with `import { Link } from 'react-router'`.
Replace `href` prop with `to` prop.

### 7. Navigation

Replace `useRouter()` from `next/navigation` with `useNavigate()` from `react-router`.
Replace `router.push('/path')` with `navigate('/path')`.
Replace `redirect('/path')` (next/navigation) with `throw redirect('/path')` in loaders/actions.

### 8. Environment Variables

On CF Workers, there's no `process.env`. All env vars come through `context.cloudflare.env`.
Any file that needs env vars should accept them as a parameter (like `getDb(env)` and `createAuth(env)`).

---

## Route Mapping

| Next.js Route                  | RR7 Route File                               | Status      |
| ------------------------------ | -------------------------------------------- | ----------- |
| `/` (landing)                  | `app/routes/_index.tsx`                      | Skeleton ✅ |
| `/auth/signin`                 | `app/routes/auth.signin.tsx`                 | Done ✅     |
| `/auth/[...nextauth]`          | `app/routes/auth.$.tsx`                      | Done ✅     |
| `/dashboard`                   | `app/routes/_auth.dashboard.tsx`             | Skeleton ✅ |
| `/settings`                    | `app/routes/_auth.settings.tsx`              | TODO        |
| `/sites/browse`                | `app/routes/sites.browse.tsx`                | Skeleton ✅ |
| `/sites/[slug]`                | `app/routes/sites.$slug.tsx`                 | TODO        |
| `/sites/custom/[id]`           | `app/routes/_auth.sites.custom.$id.tsx`      | TODO        |
| `/api/sites`                   | `app/routes/api.sites.tsx`                   | Done ✅     |
| `/api/sites/[slug]`            | `app/routes/api.sites.$slug.tsx`             | TODO        |
| `/api/sites/[slug]/profile`    | `app/routes/api.sites.$slug.profile.tsx`     | TODO        |
| `/api/weather/profile`         | `app/routes/api.weather.profile.tsx`         | TODO        |
| `/api/notifications/subscribe` | `app/routes/api.notifications.subscribe.tsx` | TODO        |
| `/api/notifications/check`     | `app/routes/api.notifications.check.tsx`     | Skeleton ✅ |

---

## Component Migration Notes

Most components in `src/components/` are React client components and can be reused with minimal changes:

1. **Replace imports:** `next/link` → `react-router`, `next/image` → `<img>`, `next/dynamic` → `React.lazy`
2. **Session access:** Replace `useSession()` from next-auth with `authClient.useSession()` from Better Auth
3. **Leaflet:** Replace `next/dynamic` with `React.lazy` + `Suspense`
4. **Theme:** `next-themes` works with RR7 unchanged
5. **shadcn/ui:** Works unchanged
6. **D3 windgram:** Pure D3/React, works unchanged

---

## Database Migration (Better Auth)

Better Auth expects its own table schema. Two approaches:

**Option A (recommended):** Run Better Auth's auto-migration to create `user`, `session`, `account`, `verification` tables. Then migrate existing NextAuth user data with a script.

**Option B:** Map Better Auth to existing NextAuth tables using `tableName` config (complex, column names differ significantly).

After migration, drop the old NextAuth tables (`users`, `sessions`, `accounts`, `verificationTokens`).
