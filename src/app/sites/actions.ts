'use server';

import { revalidatePath } from 'next/cache';
import { readJSON, updateJSON } from '@/lib/storage';
import { initializeSeedData } from '@/lib/seed';
import type { Site, SitesData } from '@/types';

const SITES_FILE = 'sites.json';

/**
 * Get all sites (initializes seed data on first run)
 */
export async function getSites(): Promise<Site[]> {
  // Initialize seed data if no sites exist
  await initializeSeedData();

  const data = await readJSON<SitesData>(SITES_FILE, { sites: [] });
  return data.sites;
}

/**
 * Add a new site
 */
export async function addSite(
  site: Omit<Site, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Site> {
  const newSite: Site = {
    ...site,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await updateJSON<SitesData>(SITES_FILE, { sites: [] }, (data) => ({
    sites: [...data.sites, newSite],
  }));

  revalidatePath('/sites');
  return newSite;
}

/**
 * Update an existing site
 */
export async function updateSite(
  id: string,
  updates: Partial<Omit<Site, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Site | null> {
  let updatedSite: Site | null = null;

  await updateJSON<SitesData>(SITES_FILE, { sites: [] }, (data) => {
    const siteIndex = data.sites.findIndex((s) => s.id === id);
    if (siteIndex === -1) return data;

    updatedSite = {
      ...data.sites[siteIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const sites = [...data.sites];
    sites[siteIndex] = updatedSite;

    return { sites };
  });

  revalidatePath('/sites');
  return updatedSite;
}

/**
 * Delete a site
 */
export async function deleteSite(id: string): Promise<void> {
  await updateJSON<SitesData>(SITES_FILE, { sites: [] }, (data) => ({
    sites: data.sites.filter((s) => s.id !== id),
  }));

  revalidatePath('/sites');
}
