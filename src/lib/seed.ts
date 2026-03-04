/**
 * Seed data for SoarCast
 * Provides default flying sites for demonstration purposes
 */

import type { Site } from '@/types';
import { updateJSON } from './storage';
import type { SitesData } from '@/types';

/**
 * Default PNW flying sites
 */
const DEFAULT_SITES: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Tiger Mountain',
    latitude: 47.4829,
    longitude: -121.941,
    elevation: 460,
    idealWindDirections: [180, 225, 270],
    maxWindSpeed: 30,
    notes: 'Popular Seattle-area XC site with west-facing launch',
  },
  {
    name: 'Dog Mountain',
    latitude: 45.6996,
    longitude: -121.7073,
    elevation: 701,
    idealWindDirections: [225, 270, 315],
    maxWindSpeed: 35,
    notes: 'Columbia River Gorge site with strong thermal potential',
  },
  {
    name: 'Chelan Butte',
    latitude: 47.8282,
    longitude: -120.0164,
    elevation: 390,
    idealWindDirections: [270, 315, 0],
    maxWindSpeed: 32,
    notes: 'Eastern Washington XC paradise with consistent thermals',
  },
];

/**
 * Initialize seed data if sites.json is empty
 */
export async function initializeSeedData(): Promise<void> {
  await updateJSON<SitesData>('sites.json', { sites: [] }, (data) => {
    // Only seed if no sites exist
    if (data.sites.length > 0) {
      return data;
    }

    const now = new Date().toISOString();
    const sites: Site[] = DEFAULT_SITES.map((site) => ({
      ...site,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    }));

    return { sites };
  });
}
