import { data, Form, Link, redirect, useActionData, useLoaderData } from 'react-router';
import { and, eq } from 'drizzle-orm';
import type { Route } from './+types/_auth.sites.custom.$id.edit';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import {
  customSiteValues,
  ELEVATION_LOOKUP_ERROR,
  findOwnedCustomSite,
  measureCustomTerrain,
  resolveElevation,
  shareProblemMessage,
  syncSharing,
} from '~/app/lib/custom-sites.server';
import { getPgsitesApiKey } from '~/lib/pgsites-client';
import { customSites } from '~/db/schema';
import { terrainFromMeasure } from '~/lib/site-terrain';
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
    maxWindSpeed: row.maxWindSpeed,
    kind: row.siteKind,
    goal: row.goal,
    terrain: row.terrain,
    notes: row.notes,
    share: row.sharedSiteId !== null,
  };
  const measuredTerrain = terrainFromMeasure(row.terrainSlope, row.terrainRelief);
  // Adding a site sends here when sharing it didn't work
  const url = new URL(request.url);
  const listed = url.searchParams.get('listed');
  const shareError =
    url.searchParams.get('share') === 'failed'
      ? shareProblemMessage('failed')
      : listed
        ? shareProblemMessage({ listed })
        : undefined;
  return { id: row.id, initial, measuredTerrain, shareError };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const db = getDb(env);
  const row = await findOwnedCustomSite(db, params.id, session.user.id);
  if (!row) throw new Response('Site not found', { status: 404 });
  const owned = and(eq(customSites.id, row.id), eq(customSites.userId, session.user.id));

  const apiKey = getPgsitesApiKey(env);
  const form = await request.formData();
  if (form.get('intent') === 'delete') {
    // A shared copy goes first, so it never stays listed with no one to take it back
    if ((await syncSharing(db, apiKey, row, null)) !== null) {
      return data(
        {
          errors: {
            share:
              "Couldn't take the shared copy back just now, so the site is still here. Try again later.",
          } as CustomSiteErrors,
        },
        { status: 502 },
      );
    }
    await db.delete(customSites).where(owned);
    return redirect('/dashboard');
  }

  const { input, errors } = parseCustomSiteForm(form);
  if (Object.keys(errors).length > 0) return data({ errors }, { status: 400 });

  // The terrain is measured again when the pin moves
  const moved =
    row.terrainSlope == null ||
    parseFloat(row.latitude) !== input.latitude ||
    parseFloat(row.longitude) !== input.longitude;
  const [elevation, terrain] = await Promise.all([
    resolveElevation(input),
    moved ? measureCustomTerrain(input.latitude, input.longitude) : null,
  ]);
  if (elevation === null) {
    return data(
      { errors: { elevation: ELEVATION_LOOKUP_ERROR } as CustomSiteErrors },
      { status: 400 },
    );
  }

  const values = customSiteValues(input, elevation);
  await db
    .update(customSites)
    .set({
      ...values,
      ...(moved && {
        terrainSlope: terrain?.slope ?? null,
        terrainRelief: terrain?.relief ?? null,
      }),
      updatedAt: new Date(),
    })
    .where(owned);
  const problem = await syncSharing(db, apiKey, row, { input, elevation });
  if (problem) {
    return data({ errors: { share: shareProblemMessage(problem) } as CustomSiteErrors });
  }
  return redirect(`/sites/custom/${row.id}`);
}

export default function EditCustomSitePage() {
  const { id, initial, measuredTerrain, shareError } = useLoaderData<typeof loader>();
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
        measuredTerrain={measuredTerrain}
        errors={actionData?.errors ?? (shareError ? { share: shareError } : undefined)}
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
