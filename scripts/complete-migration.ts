import { createClient } from '@libsql/client';
import { config } from 'dotenv';

// Load environment variables
config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function completeMigration() {
  console.log('Completing migration: creating custom_sites and migrating data');

  // Create custom_sites table
  console.log('\n1. Creating custom_sites table...');
  await client.execute(`
    CREATE TABLE IF NOT EXISTS custom_sites (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      name text NOT NULL,
      latitude text NOT NULL,
      longitude text NOT NULL,
      elevation integer NOT NULL,
      max_wind_speed integer NOT NULL,
      ideal_wind_directions text NOT NULL,
      created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
    )
  `);
  console.log('✓ custom_sites table created');

  // Migrate data from sites to custom_sites
  console.log('\n2. Migrating data from sites to custom_sites...');
  const result = await client.execute(`
    INSERT INTO custom_sites (id, user_id, name, latitude, longitude, elevation, max_wind_speed, ideal_wind_directions, created_at, updated_at)
    SELECT id, userId, name, latitude, longitude, elevation, maxWindSpeed, idealWindDirections, createdAt, updatedAt
    FROM sites
  `);
  console.log(`✓ Migrated ${result.rowsAffected} sites to custom_sites`);

  // Verify the migration
  console.log('\n3. Verifying migration...');
  const countResult = await client.execute('SELECT COUNT(*) as count FROM custom_sites');
  console.log(`✓ custom_sites table has ${countResult.rows[0].count} rows`);

  console.log('\n✓ Migration completed successfully');
  process.exit(0);
}

completeMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
