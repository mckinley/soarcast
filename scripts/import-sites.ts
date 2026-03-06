#!/usr/bin/env tsx

/**
 * CLI script to import paragliding launch sites from ParaglidingEarth
 *
 * Usage:
 *   npx tsx scripts/import-sites.ts --region washington
 *   npx tsx scripts/import-sites.ts --bbox 49.0,45.5,-116.9,-124.8
 */

import 'dotenv/config';
import { scrapeAndImport } from '../src/lib/scraper/paraglidingearth';

// Pre-defined regional bounding boxes
const REGIONS = {
  washington: {
    north: 49.0,
    south: 45.5,
    east: -116.9,
    west: -124.8,
  },
  // Add more regions as needed
} as const;

type RegionName = keyof typeof REGIONS;

async function main() {
  const args = process.argv.slice(2);

  let bbox: { north: number; south: number; east: number; west: number } | null = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--region') {
      const regionName = args[i + 1] as RegionName;
      if (!regionName || !(regionName in REGIONS)) {
        console.error(
          `Error: Invalid region "${regionName}". Available: ${Object.keys(REGIONS).join(', ')}`,
        );
        process.exit(1);
      }
      bbox = REGIONS[regionName];
      i++;
    } else if (arg === '--bbox') {
      const bboxStr = args[i + 1];
      if (!bboxStr) {
        console.error('Error: --bbox requires north,south,east,west values');
        process.exit(1);
      }
      const parts = bboxStr.split(',').map((s) => parseFloat(s.trim()));
      if (parts.length !== 4 || parts.some(isNaN)) {
        console.error('Error: --bbox must be 4 comma-separated numbers: north,south,east,west');
        process.exit(1);
      }
      bbox = {
        north: parts[0],
        south: parts[1],
        east: parts[2],
        west: parts[3],
      };
      i++;
    }
  }

  if (!bbox) {
    console.error('Usage:');
    console.error('  npx tsx scripts/import-sites.ts --region washington');
    console.error('  npx tsx scripts/import-sites.ts --bbox north,south,east,west');
    console.error('');
    console.error('Available regions:', Object.keys(REGIONS).join(', '));
    process.exit(1);
  }

  console.log('Importing sites from ParaglidingEarth...');
  console.log('Bounding box:', bbox);

  try {
    const result = await scrapeAndImport(bbox, 1000);
    console.log(`✅ Success! Fetched ${result.fetched} sites, imported ${result.imported}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
