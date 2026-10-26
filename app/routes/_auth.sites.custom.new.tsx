import { data, redirect, useActionData, useLoaderData } from 'react-router';
import type { Route } from './+types/_auth.sites.custom.new';
import { getDb } from '~/app/lib/db.server';
import { requireAuth } from '~/app/lib/auth.server';
import {
  customSiteValues,
  ELEVATION_LOOKUP_ERROR,
  measureCustomTerrain,
  resolveElevation,
  syncSharing,
} from '~/app/lib/custom-sites.server';
import { getPgsitesApiKey } from '~/lib/pgsites-client';
import { keepsMountainMargins } from '~/app/lib/mountain-margins.server';
import { customSites } from '~/db/schema';
import { parseCustomSiteForm, type CustomSiteErrors } from '~/lib/custom-sites';
import { CustomSiteForm } from '@/components/custom-site-form';
import { BackLink } from '@/components/site-page';

export function meta() {
  return [{ title: 'Add a private site | SoarCast' }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  return { margins: await keepsMountainMargins(getDb(env), session.user.id) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await requireAuth(request, env);
  const { input, errors } = parseCustomSiteForm(await request.formData());
  if (Object.keys(errors).length > 0) return data({ errors }, { status: 400 });

  const [elevation, terrain] = await Promise.all([
    resolveElevation(input),
    measureCustomTerrain(input.latitude, input.longitude),
  ]);
  if (elevation === null) {
    return data(
      { errors: { elevation: ELEVATION_LOOKUP_ERROR } as CustomSiteErrors },
      { status: 400 },
    );
  }

  const db = getDb(env);
  const [site] = await db
    .insert(customSites)
    .values({
      userId: session.user.id,
      ...customSiteValues(input, elevation),
      terrainSlope: terrain?.slope ?? null,
      terrainRelief: terrain?.relief ?? null,
    })
    .returning({ id: customSites.id });
  if (input.share) {
    const problem = await syncSharing(
      db,
      getPgsitesApiKey(env),
      { id: site.id, sharedSiteId: null },
      { input, elevation },
    );
    // The site is saved: say what went wrong on its edit page, so a retry doesn't add it twice
    if (problem === 'failed') return redirect(`/sites/custom/${site.id}/edit?share=failed`);
    if (problem) {
      return redirect(`/sites/custom/${site.id}/edit?listed=${encodeURIComponent(problem.listed)}`);
    }
  }
  return redirect(`/sites/custom/${site.id}`);
}

export default function NewCustomSitePage() {
  const { margins } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <BackLink to="/dashboard">Dashboard</BackLink>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight md:text-4xl">
          Add a private site
        </h1>
        <p className="text-muted-foreground">
          Pin a launch that isn&apos;t listed, like a hike-and-fly peak. Only you can see it unless
          you share it. SoarCast rates it and sends alerts for it like any site you follow.
        </p>
      </div>
      <CustomSiteForm
        margins={margins}
        errors={actionData?.errors}
        submitLabel="Add site"
        cancelHref="/dashboard"
      />
    </div>
  );
}
