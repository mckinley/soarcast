import type { ActionFunctionArgs } from 'react-router';
import { getDb } from '~/app/lib/db.server';
import { getSession } from '~/app/lib/auth.server';
import { pushSubscriptions } from '~/db/schema';
import { eq } from 'drizzle-orm';

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb(env);

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const { endpoint, keys } = body;

      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return Response.json({ error: 'Invalid subscription data' }, { status: 400 });
      }

      const existing = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .limit(1);

      if (existing.length > 0) {
        return Response.json({ success: true, message: 'Subscription already exists' });
      }

      await db.insert(pushSubscriptions).values({
        userId: session.user.id,
        endpoint,
        keys,
      });

      return Response.json({ success: true });
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      return Response.json({ error: 'Failed to subscribe' }, { status: 500 });
    }
  }

  if (request.method === 'DELETE') {
    try {
      const body = await request.json();
      const { endpoint } = body;

      if (!endpoint) {
        return Response.json({ error: 'Endpoint required' }, { status: 400 });
      }

      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));

      return Response.json({ success: true });
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      return Response.json({ error: 'Failed to unsubscribe' }, { status: 500 });
    }
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
