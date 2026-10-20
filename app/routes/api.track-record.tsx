import type { LoaderFunctionArgs } from 'react-router';
import { getDb } from '~/app/lib/db.server';
import { getTrackRecord, type TrackRecordResult } from '~/app/lib/track-record.server';

// Resource route for a site page: how the forecast has done at the airport
// nearest the site. The first request for an airport builds its record,
// which takes a few seconds; after that it comes from D1.

export type TrackRecordResponse = TrackRecordResult;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (
    !url.searchParams.get('lat') ||
    !url.searchParams.get('lng') ||
    !(Math.abs(lat) <= 90) ||
    !(Math.abs(lng) <= 180)
  ) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  try {
    const body: TrackRecordResponse = await getTrackRecord(getDb(env), lat, lng);
    return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=86400' } });
  } catch (error) {
    console.error('Track record failed:', error);
    return Response.json({ error: 'Track record unavailable' }, { status: 502 });
  }
}
