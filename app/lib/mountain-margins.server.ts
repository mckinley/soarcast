import { eq } from 'drizzle-orm';
import type { Db } from '~/app/lib/db.server';
import { settings } from '~/db/schema';

/**
 * Whether the signed-in pilot keeps wider margins in big mountains
 * (Settings): then sites there are rated with the lower wind limit, the wind
 * higher up and the storm rule. False when signed out.
 */
export async function keepsMountainMargins(db: Db, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const [row] = await db
      .select({ on: settings.mountainMargins })
      .from(settings)
      .where(eq(settings.userId, userId))
      .limit(1);
    return row?.on ?? false;
  } catch (error) {
    console.error('Mountain margins setting failed:', error);
    return false;
  }
}
