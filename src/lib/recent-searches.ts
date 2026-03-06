/**
 * Client-side recent searches/viewed sites tracking using localStorage
 */

const RECENT_SEARCHES_KEY = 'soarcast-recent-searches';
const RECENT_SITES_KEY = 'soarcast-recent-sites';
const MAX_RECENT_ITEMS = 5;

export interface RecentSearch {
  query: string;
  timestamp: number;
}

export interface RecentSite {
  id: string;
  name: string;
  slug: string;
  timestamp: number;
}

/**
 * Get recent searches from localStorage
 */
export function getRecentSearches(): RecentSearch[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!stored) return [];

    const searches = JSON.parse(stored) as RecentSearch[];
    return searches.slice(0, MAX_RECENT_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Add a search to recent searches
 */
export function addRecentSearch(query: string): void {
  if (typeof window === 'undefined' || !query.trim()) return;

  try {
    const searches = getRecentSearches();

    // Remove if already exists
    const filtered = searches.filter((s) => s.query.toLowerCase() !== query.toLowerCase());

    // Add to front
    filtered.unshift({
      query: query.trim(),
      timestamp: Date.now(),
    });

    // Keep only MAX_RECENT_ITEMS
    const updated = filtered.slice(0, MAX_RECENT_ITEMS);

    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {
    // Fail silently if localStorage is unavailable
  }
}

/**
 * Clear all recent searches
 */
export function clearRecentSearches(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Fail silently
  }
}

/**
 * Get recently viewed sites from localStorage
 */
export function getRecentSites(): RecentSite[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(RECENT_SITES_KEY);
    if (!stored) return [];

    const sites = JSON.parse(stored) as RecentSite[];
    return sites.slice(0, MAX_RECENT_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Add a site to recently viewed
 */
export function addRecentSite(site: { id: string; name: string; slug: string }): void {
  if (typeof window === 'undefined') return;

  try {
    const sites = getRecentSites();

    // Remove if already exists
    const filtered = sites.filter((s) => s.id !== site.id);

    // Add to front
    filtered.unshift({
      ...site,
      timestamp: Date.now(),
    });

    // Keep only MAX_RECENT_ITEMS
    const updated = filtered.slice(0, MAX_RECENT_ITEMS);

    localStorage.setItem(RECENT_SITES_KEY, JSON.stringify(updated));
  } catch {
    // Fail silently if localStorage is unavailable
  }
}

/**
 * Clear all recently viewed sites
 */
export function clearRecentSites(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(RECENT_SITES_KEY);
  } catch {
    // Fail silently
  }
}
