import { data, Form, Link, redirect, useActionData, useLoaderData } from 'react-router';
import { and, eq } from 'drizzle-orm';
import type { Route } from './+types/_auth.sites.custom.$id.edit';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import {
  customSiteValues,
  deleteCachedForecasts,
  ELEVATION_LOOKUP_ERROR,
  findOwnedCustomSite,
  resolveElevation,
} from '~/app/lib/custom-sites.server';
import { customSites } from '~/db/schema';
import {
  customSiteToSite,
  parseCustomSiteForm,
  type CustomSiteErrors,
  type CustomSiteInput,
} from '~/lib/custom-sites';
import { CustomSiteForm } from '@/components/custom-site-form';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `Edit ${data.initial.name} | SoarCast` : 'Site Not Found | SoarCast' }];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const row = await findOwnedCustomSite(getDb(env), params.id, session.user.id);
  if (!row) throw new Response('Site not found', { status: 404 });

  const site = customSiteToSite(row);
  const initial: CustomSiteInput = {
    name: site.name,
    latitude: site.latitude,
    longitude: site.longitude,
    elevation: site.elevation,
    goodDirections: site.idealWindDirections,
    okDirections: site.okWindDirections ?? [],
    maxWindSpeed: site.maxWindSpeed,
    notes: row.notes,
  };
  return { id: row.id, initial };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const row = await findOwnedCustomSite(db, params.id, session.user.id);
  if (!row) throw new Response('Site not found', { status: 404 });
  const owned = and(eq(customSites.id, row.id), eq(customSites.userId, session.user.id));

  const form = await request.formData();
  if (form.get('intent') === 'delete') {
    await db.batch([db.delete(customSites).where(owned), deleteCachedForecasts(db, row.id)]);
    return redirect('/dashboard');
  }

  const { input, errors } = parseCustomSiteForm(form);
  if (Object.keys(errors).length > 0) return data({ errors }, { status: 400 });

  const elevation = await resolveElevation(input);
  if (elevation === null) {
    return data(
      { errors: { elevation: ELEVATION_LOOKUP_ERROR } as CustomSiteErrors },
      { status: 400 },
    );
  }

  const values = customSiteValues(input, elevation);
  const moved = values.latitude !== row.latitude || values.longitude !== row.longitude;
  await db
    .update(customSites)
    .set({ ...values, updatedAt: new Date() })
    .where(owned);
  if (moved) await deleteCachedForecasts(db, row.id);
  return redirect(`/sites/custom/${row.id}`);
}

export default function EditCustomSitePage() {
  const { id, initial } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const siteHref = `/sites/custom/${id}`;

  return (
    <div className="max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to={siteHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {initial.name}
        </Link>
      </Button>
      <h1 className="text-3xl font-bold">Edit {initial.name}</h1>
      <CustomSiteForm
        initial={initial}
        errors={actionData?.errors}
        submitLabel="Save changes"
        cancelHref={siteHref}
      />
      <Form
        method="post"
        className="border-t pt-6"
        onSubmit={(e) => {
          if (!confirm(`Delete ${initial.name}? Its alerts stop too.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="intent" value="delete" />
        <Button type="submit" variant="destructive">
          Delete site
        </Button>
      </Form>
    </div>
  );
}
