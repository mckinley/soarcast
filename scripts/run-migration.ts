import { createClient } from '@libsql/client';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables
config();

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: npx tsx scripts/run-migration.ts <migration-file>');
  process.exit(1);
}

const migrationPath = path.join(process.cwd(), migrationFile);
if (!fs.existsSync(migrationPath)) {
  console.error(`Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function runMigration() {
  console.log(`Running migration: ${migrationFile}`);

  // Split by statement breakpoint and execute each statement
  const statements = migrationSQL
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    console.log(`\nExecuting statement ${i + 1}/${statements.length}...`);
    console.log(statement.substring(0, 100) + '...');

    try {
      await client.execute(statement);
      console.log('✓ Success');
    } catch (error) {
      console.error('✗ Error:', error);
      process.exit(1);
    }
  }

  console.log('\n✓ Migration completed successfully');
  process.exit(0);
}

runMigration();
