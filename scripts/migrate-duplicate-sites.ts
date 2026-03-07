#!/usr/bin/env tsx
/**
 * Detect and migrate duplicate custom_sites that match launch_sites
 *
 * This script:
 * 1. Finds custom_sites within 1km of a launch_site with similar name
 * 2. Converts matched custom_sites into user_favorite_sites entries
 * 3. Preserves custom max_wind and ideal_directions
 * 4. Deletes the orphaned custom_site after migration
 */

import 'dotenv/config';
import { db } from '@/db';
import { customSites, launchSites, userFavoriteSites } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { calculateDistance, namesAreSimilar } from '@/lib/site-utils';

const DISTANCE_THRESHOLD_KM = 5; // 5km radius (generous for mountain sites with multiple launch points)

interface DuplicateMatch {
  customSite: typeof customSites.$inferSelect;
  launchSite: typeof launchSites.$inferSelect;
  distance: number;
}

/**
 * Find all duplicate custom_sites that match launch_sites
 */
async function findDuplicates(): Promise<DuplicateMatch[]> {
  console.log('🔍 Scanning for duplicate sites...\n');

  // Fetch all custom sites
  const allCustomSites = await db.select().from(customSites);
  console.log(`Found ${allCustomSites.length} custom sites`);

  // Fetch all launch sites
  const allLaunchSites = await db.select().from(launchSites);
  console.log(`Found ${allLaunchSites.length} launch sites\n`);

  const duplicates: DuplicateMatch[] = [];

  // Check each custom site against all launch sites
  for (const custom of allCustomSites) {
    const customLat = parseFloat(custom.latitude);
    const customLng = parseFloat(custom.longitude);

    for (const launch of allLaunchSites) {
      const launchLat = parseFloat(launch.latitude);
      const launchLng = parseFloat(launch.longitude);

      // Calculate distance
      const distance = calculateDistance(customLat, customLng, launchLat, launchLng);

      // Check if within threshold AND names are similar
      if (distance <= DISTANCE_THRESHOLD_KM && namesAreSimilar(custom.name, launch.name)) {
        duplicates.push({ customSite: custom, launchSite: launch, distance });
        console.log(
          `✓ Match found: "${custom.name}" → "${launch.name}" (${distance.toFixed(2)}km apart)`,
        );
      }
    }
  }

  console.log(`\n📊 Found ${duplicates.length} duplicate sites to migrate\n`);
  return duplicates;
}

/**
 * Migrate a single duplicate custom_site to a user_favorite_sites entry
 */
async function migrateSite(match: DuplicateMatch): Promise<void> {
  const { customSite, launchSite } = match;

  console.log(`🔄 Migrating: ${customSite.name} (custom) → ${launchSite.name} (launch)`);

  // Check if the user already has this launch site favorited
  const existingFavorite = await db
    .select()
    .from(userFavoriteSites)
    .where(
      and(
        eq(userFavoriteSites.userId, customSite.userId),
        eq(userFavoriteSites.siteId, launchSite.id),
      ),
    )
    .limit(1);

  if (existingFavorite.length > 0) {
    console.log(`  ⚠️  User already has ${launchSite.name} favorited. Merging preferences...`);

    // Update existing favorite with custom preferences if they differ from defaults
    await db
      .update(userFavoriteSites)
      .set({
        customMaxWind: customSite.maxWindSpeed,
        customIdealDirections: customSite.idealWindDirections,
      })
      .where(eq(userFavoriteSites.id, existingFavorite[0].id));
  } else {
    // Create new favorite entry
    await db.insert(userFavoriteSites).values({
      userId: customSite.userId,
      siteId: launchSite.id,
      customMaxWind: customSite.maxWindSpeed,
      customIdealDirections: customSite.idealWindDirections,
      notify: false,
    });
    console.log(`  ✓ Created favorite for ${launchSite.name}`);
  }

  // Delete the custom site
  await db.delete(customSites).where(eq(customSites.id, customSite.id));
  console.log(`  ✓ Deleted custom site: ${customSite.name}\n`);
}

/**
 * Main migration function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SoarCast: Duplicate Sites Migration Script');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Find all duplicates
    const duplicates = await findDuplicates();

    if (duplicates.length === 0) {
      console.log('✨ No duplicates found. Database is clean!\n');
      return;
    }

    // Migrate each duplicate
    console.log('🚀 Starting migration...\n');
    for (const match of duplicates) {
      await migrateSite(match);
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Migration complete! Migrated ${duplicates.length} sites.`);
    console.log('═══════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
main();
