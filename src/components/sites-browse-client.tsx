import { useState, useCallback, useTransition, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Search, SlidersHorizontal, X, Loader2, Mountain, Heart, MapPinPlus } from 'lucide-react';
import { SitesBrowseMapWrapper } from '@/components/sites-browse-map-wrapper';
import { getOrientations } from '@/lib/site-utils';
import { PlacesCredit } from '@/components/data-credits';
import type { SiteOrigin } from '@/lib/pgsites-client';

/** Minimal site shape used by the browse page. */
export interface BrowseSite {
  id: string;
  name: string;
  slug: string;
  countryCode: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  windN: number;
  windNe: number;
  windE: number;
  windSe: number;
  windS: number;
  windSw: number;
  windW: number;
  windNw: number;
  isParagliding: boolean;
  isHanggliding: boolean;
  createdAt: string | null;
  /** Pilots tracked flying from here in the last year; null when none */
  flownPilots: number | null;
  /** Where a site no site guide lists came from: tracked flights or OpenStreetMap */
  origin?: SiteOrigin;
}

interface SitesBrowseClientProps {
  initialSites: BrowseSite[];
  /** 'search' = fit map to results; 'preloaded' = default area, no fitBounds; 'empty' = wait for map */
  sitesMode: 'search' | 'preloaded' | 'empty';
  searchParams: { search?: string };
  /** Places the search named ("Cali, Valle del Cauca, CO"), whose nearby sites follow the name matches */
  places?: string[];
  initialFavoriteIds?: string[];
}

const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const PHONE_PAGE = 25;

export function SitesBrowseClient({
  initialSites,
  sitesMode,
  searchParams,
  places = [],
  initialFavoriteIds = [],
}: SitesBrowseClientProps) {
  const navigate = useNavigate();
  const [urlSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();

  const isSearchMode = sitesMode === 'search';

  const [searchValue, setSearchValue] = useState(searchParams.search ?? '');
  const [selectedOrientations, setSelectedOrientations] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // A phone lists the busiest sites first, a page at a time
  const [phoneCount, setPhoneCount] = useState(PHONE_PAGE);

  // Preloaded sites arrive from the server — use them immediately, no loading state.
  // Map pans will replace them with fresh near-API results.
  const [mapSites, setMapSites] = useState<BrowseSite[]>(
    sitesMode === 'preloaded' ? initialSites : [],
  );
  const [isLoading, setIsLoading] = useState(sitesMode === 'empty');

  const favoriteSiteIds = useMemo(() => new Set(initialFavoriteIds), [initialFavoriteIds]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawSites = isSearchMode ? initialSites : mapSites;

  // Client-side filter by orientation. On the map the sites most pilots fly
  // come first; a search keeps its own order.
  const displaySites = useMemo(() => {
    const sorted = isSearchMode
      ? rawSites
      : [...rawSites].sort((a, b) => (b.flownPilots ?? 0) - (a.flownPilots ?? 0));
    if (selectedOrientations.length === 0) return sorted;
    return sorted.filter((site) => {
      const orientations = getOrientations(site);
      return selectedOrientations.some((o) => {
        const rating = orientations[o];
        return rating != null && rating >= 1;
      });
    });
  }, [rawSites, selectedOrientations, isSearchMode]);

  const hasPreloadedRef = useRef(sitesMode === 'preloaded');

  const handleBoundsChange = useCallback((lat: number, lng: number, radiusKm: number) => {
    // Skip the very first bounds-change if we already have server-preloaded sites —
    // the map is showing the same area, so a fetch would just return identical data.
    if (hasPreloadedRef.current) {
      hasPreloadedRef.current = false;
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          lat: lat.toFixed(5),
          lng: lng.toFixed(5),
          radius: Math.min(radiusKm, 3000).toString(),
          limit: '1000',
        });
        const res = await fetch(`/api/sites/near?${params}`);
        if (res.ok) {
          const data = (await res.json()) as { sites: BrowseSite[] };
          setMapSites(data.sites);
        }
      } catch {
        // silently swallow — map just won't update
      } finally {
        setIsLoading(false);
      }
    }, 250);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (!q) {
      // Clear search — go back to map browsing
      startTransition(() => navigate('/sites'));
      return;
    }
    const params = new URLSearchParams(urlSearchParams);
    params.set('q', q);
    startTransition(() => navigate(`/sites?${params}`));
  };

  const clearSearch = () => {
    setSearchValue('');
    startTransition(() => navigate('/sites'));
  };

  const toggleOrientation = (o: string) =>
    setSelectedOrientations((prev) =>
      prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o],
    );

  const hasActiveFilters = selectedOrientations.length > 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight md:text-[30px]">
            Sites
          </h1>
          <p className="text-[15px] text-muted-foreground">
            Find a launch by name or town, or move the map.
          </p>
        </div>
        <Button variant="outline" asChild className="hidden shrink-0 sm:inline-flex">
          <Link to="/sites/custom/new">
            <MapPinPlus className="size-4" />
            Add a private site
          </Link>
        </Button>
      </div>

      {/* ── Search bar ── */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search a site or a town"
            aria-label="Search a site or a town"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="h-11 bg-card pl-9 text-base md:text-sm"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => setSearchValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Button type="submit" className="h-11 shrink-0 px-4">
          Search
        </Button>

        <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              className="relative h-11 shrink-0 px-3 sm:px-4"
              aria-label="Filters"
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">Filters</span>
              {hasActiveFilters && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                  {selectedOrientations.length}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-sm overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Show only some of the sites in view</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-4">
              {/* Wind orientations */}
              <div className="space-y-3">
                <Label>Wind directions</Label>
                <div className="flex flex-wrap gap-2">
                  {ORIENTATIONS.map((o) => (
                    <Badge
                      key={o}
                      variant={selectedOrientations.includes(o) ? 'default' : 'outline'}
                      className="cursor-pointer select-none"
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedOrientations.includes(o)}
                      aria-label={`Filter by ${o} wind direction`}
                      onClick={() => toggleOrientation(o)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleOrientation(o);
                        }
                      }}
                    >
                      {o}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Show only sites that fly in these wind directions.
                </p>
              </div>

              {hasActiveFilters && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSelectedOrientations([])}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </form>

      {/* ── Search result / active filter badges ── */}
      {(isSearchMode || hasActiveFilters) && (
        <div className="flex flex-wrap items-center gap-2">
          {isSearchMode && (
            <Badge variant="secondary" className="gap-1">
              Search: {searchParams.search}
              <button
                type="button"
                aria-label="Clear search"
                onClick={clearSearch}
                className="inline-flex cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {isSearchMode &&
            places.map((place) => (
              <Badge key={place} variant="outline">
                Near {place}
              </Badge>
            ))}
          {isSearchMode && places.length > 0 && <PlacesCredit />}
          {selectedOrientations.map((o) => (
            <Badge key={o} variant="secondary" className="gap-1">
              {o}
              <button
                type="button"
                aria-label={`Remove ${o} filter`}
                onClick={() => toggleOrientation(o)}
                className="inline-flex cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* ── Main: map + site list ── */}
      <div className="flex h-[52vh] min-h-[340px] overflow-hidden rounded-2xl border bg-card md:h-[72vh] md:min-h-[420px]">
        {/* Map */}
        <div className="flex-1 relative min-w-0">
          <SitesBrowseMapWrapper
            sites={displaySites}
            onBoundsChange={isSearchMode ? undefined : handleBoundsChange}
            fitBounds={isSearchMode}
          />

          {/* Loading indicator overlay */}
          {isLoading && (
            <div className="absolute top-3 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-md border bg-card/95 px-3 py-1.5 text-sm shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading sites…
            </div>
          )}
        </div>

        {/* ── Desktop side panel ── */}
        <div className="hidden w-80 shrink-0 flex-col border-l bg-card md:flex">
          {/* Panel header */}
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">
              {displaySites.length} site{displaySites.length !== 1 ? 's' : ''}
              {isSearchMode ? '' : ' in view'}
            </span>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>

          {/* Site list */}
          <div className="flex-1 overflow-y-auto divide-y">
            {isLoading && displaySites.length === 0 ? (
              // Initial load — skeleton rows
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="px-3 py-3 space-y-1.5">
                  <div className="h-3.5 bg-muted rounded w-3/4 animate-pulse" />
                  <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                </div>
              ))
            ) : displaySites.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3">
                <Mountain className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {isSearchMode
                    ? 'No sites match your search'
                    : 'No sites found here. Try moving the map to another area.'}
                </p>
                <Link to="/sites/custom/new" className="text-sm underline hover:text-primary">
                  Not listed? Add a private site
                </Link>
              </div>
            ) : (
              displaySites.map((site) => (
                <SiteListItem
                  key={site.id}
                  site={site}
                  isFavorited={favoriteSiteIds.has(site.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Phone: the sites under the map, busiest first ── */}
      <div className="md:hidden">
        <p className="mb-2 text-sm font-semibold">
          {isLoading
            ? 'Loading sites…'
            : `${displaySites.length} site${displaySites.length !== 1 ? 's' : ''}${isSearchMode ? '' : ' in view'}`}
        </p>
        {displaySites.length === 0 && !isLoading ? (
          <div className="space-y-2 rounded-2xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            <p>
              {isSearchMode ? 'No sites match the search.' : 'Pan or zoom the map to find sites.'}
            </p>
            <Link to="/sites/custom/new" className="inline-block underline hover:text-primary">
              Not listed? Add a private site
            </Link>
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            {displaySites.slice(0, phoneCount).map((site) => (
              <SiteListItem key={site.id} site={site} isFavorited={favoriteSiteIds.has(site.id)} />
            ))}
            {displaySites.length > phoneCount && (
              <button
                type="button"
                onClick={() => setPhoneCount((n) => n + PHONE_PAGE)}
                className="w-full px-4 py-3.5 text-sm font-medium text-primary hover:bg-accent"
              >
                Show more ({displaySites.length - phoneCount} left)
              </button>
            )}
          </div>
        )}
        <Link
          to="/sites/custom/new"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-[15px] font-medium hover:bg-accent sm:hidden"
        >
          <MapPinPlus className="size-4" />
          Add a private site
        </Link>
      </div>
    </div>
  );
}

// ── One site in the list: its name, then where, how high and how busy ──
function SiteListItem({ site, isFavorited }: { site: BrowseSite; isFavorited: boolean }) {
  const orientations = getOrientations(site);
  const activeOrientations = Object.entries(orientations)
    .filter(([, r]) => r >= 1)
    .map(([dir]) => dir);

  return (
    <Link
      to={`/sites/${site.slug}`}
      className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-accent/60"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-[15px] leading-tight font-semibold">{site.name}</span>
        {isFavorited && (
          <Heart
            className="mt-0.5 size-3.5 shrink-0 fill-current text-primary"
            aria-label="In Favorites"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {site.countryCode && <span>{site.countryCode}</span>}
        {site.altitude ? <span>{site.altitude.toLocaleString('en-US')} m</span> : null}
        {site.flownPilots ? <FlownPilots count={site.flownPilots} /> : null}
        {site.origin && site.origin !== 'pge' && <UnlistedOrigin origin={site.origin} />}
      </div>
      {activeOrientations.length > 0 && (
        <div className="text-xs text-muted-foreground">Wind: {activeOrientations.join(', ')}</div>
      )}
    </Link>
  );
}

// ── Where a launch no site guide lists came from ──
const UNLISTED_ORIGIN = {
  flown: [
    'Found from flights',
    'No site guide lists this launch. It was found from tracked flights.',
  ],
  osm: [
    'From OpenStreetMap',
    'No site guide lists this launch. It is a takeoff mapped in OpenStreetMap.',
  ],
  pilot: ['Shared by a pilot', 'No site guide lists this launch. A pilot shared it.'],
} as const;

function UnlistedOrigin({ origin }: { origin: Exclude<SiteOrigin, 'pge'> }) {
  const [label, title] = UNLISTED_ORIGIN[origin];
  return <span title={title}>{label}</span>;
}

// ── Pilots tracked flying from a site in the last year ──
function FlownPilots({ count }: { count: number }) {
  return (
    <span title="Pilots tracked flying from here in the last year">
      {count} {count === 1 ? 'pilot' : 'pilots'} last year
    </span>
  );
}
