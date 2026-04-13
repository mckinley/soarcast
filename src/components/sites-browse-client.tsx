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
import { Search, SlidersHorizontal, X, Loader2, Mountain } from 'lucide-react';
import { SitesBrowseMapWrapper } from '@/components/sites-browse-map-wrapper';
import { getOrientations } from '@/lib/site-utils';

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
}

interface SitesBrowseClientProps {
  /** Sites from server-side search. Empty when browsing by map. */
  initialSites: BrowseSite[];
  searchParams: { search?: string };
  siteScores: Record<string, number | null>;
  initialFavoriteIds?: string[];
}

const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function SitesBrowseClient({
  initialSites,
  searchParams,
  initialFavoriteIds = [],
}: SitesBrowseClientProps) {
  const navigate = useNavigate();
  const [urlSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();

  // When the user has searched, show those results; otherwise show map-fetched sites.
  const isSearchMode = initialSites.length > 0;

  const [searchValue, setSearchValue] = useState(searchParams.search ?? '');
  const [selectedOrientations, setSelectedOrientations] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Map-driven state — start loading=true so the panel doesn't flash "no sites"
  // before the first bounds-change fetch fires.
  const [mapSites, setMapSites] = useState<BrowseSite[]>([]);
  const [isLoading, setIsLoading] = useState(!isSearchMode);

  const favoriteSiteIds = useMemo(() => new Set(initialFavoriteIds), [initialFavoriteIds]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rawSites = isSearchMode ? initialSites : mapSites;

  // Client-side filter by orientation
  const displaySites = useMemo(() => {
    if (selectedOrientations.length === 0) return rawSites;
    return rawSites.filter((site) => {
      const orientations = getOrientations(site);
      return selectedOrientations.some((o) => {
        const rating = orientations[o];
        return rating != null && rating >= 1;
      });
    });
  }, [rawSites, selectedOrientations]);

  const handleBoundsChange = useCallback(
    (lat: number, lng: number, radiusKm: number) => {
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
      }, 600);
    },
    [],
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    if (!q) {
      // Clear search — go back to map browsing
      startTransition(() => navigate('/sites/browse'));
      return;
    }
    const params = new URLSearchParams(urlSearchParams);
    params.set('search', q);
    startTransition(() => navigate(`/sites/browse?${params}`));
  };

  const clearSearch = () => {
    setSearchValue('');
    startTransition(() => navigate('/sites/browse'));
  };

  const toggleOrientation = (o: string) =>
    setSelectedOrientations((prev) =>
      prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o],
    );

  const hasActiveFilters = selectedOrientations.length > 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* ── Search bar ── */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search by site name, country, or region…"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9 h-10"
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

        <Button type="submit" className="h-10 px-4 shrink-0">
          Search
        </Button>

        <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-10 px-4 shrink-0 relative">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filters
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
              <SheetDescription>Narrow down sites in the current map view</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 mt-6">
              {/* Wind orientations */}
              <div className="space-y-3">
                <Label>Wind Orientations</Label>
                <div className="flex flex-wrap gap-2">
                  {ORIENTATIONS.map((o) => (
                    <Badge
                      key={o}
                      variant={selectedOrientations.includes(o) ? 'default' : 'outline'}
                      className="cursor-pointer select-none"
                      onClick={() => toggleOrientation(o)}
                    >
                      {o}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Show only sites that fly in these wind directions
                </p>
              </div>

              {hasActiveFilters && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSelectedOrientations([])}
                >
                  Clear Filters
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
              <X className="h-3 w-3 cursor-pointer" onClick={clearSearch} />
            </Badge>
          )}
          {selectedOrientations.map((o) => (
            <Badge key={o} variant="secondary" className="gap-1">
              {o}
              <X className="h-3 w-3 cursor-pointer" onClick={() => toggleOrientation(o)} />
            </Badge>
          ))}
        </div>
      )}

      {/* ── Main: map + site list ── */}
      <div className="flex gap-0 border rounded-lg overflow-hidden" style={{ height: '72vh', minHeight: '400px' }}>

        {/* Map */}
        <div className="flex-1 relative min-w-0">
          <SitesBrowseMapWrapper
            sites={displaySites}
            onBoundsChange={isSearchMode ? undefined : handleBoundsChange}
            fitBounds={isSearchMode}
          />

          {/* Loading indicator overlay */}
          {isLoading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-background/90 border rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading sites…
            </div>
          )}

        </div>

        {/* ── Desktop side panel ── */}
        <div className="hidden md:flex flex-col w-72 border-l bg-background shrink-0">
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
            <span className="text-sm font-medium">
              {displaySites.length} site{displaySites.length !== 1 ? 's' : ''}
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
                    : 'No sites found here — try panning to a different area'}
                </p>
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

      {/* ── Mobile site list below map ── */}
      <div className="md:hidden">
        <p className="text-sm text-muted-foreground mb-3">
          {isLoading ? 'Loading sites…' : `${displaySites.length} site${displaySites.length !== 1 ? 's' : ''} in view`}
        </p>
        {displaySites.length === 0 && !isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {isSearchMode ? 'No sites match your search' : 'Pan or zoom the map to explore sites'}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {displaySites.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                isFavorited={favoriteSiteIds.has(site.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Compact list item for desktop sidebar ──
function SiteListItem({ site, isFavorited }: { site: BrowseSite; isFavorited: boolean }) {
  const orientations = getOrientations(site);
  const activeOrientations = Object.entries(orientations)
    .filter(([, r]) => r >= 1)
    .map(([dir]) => dir);

  return (
    <Link
      to={`/sites/${site.slug}`}
      className="flex flex-col gap-1 px-3 py-3 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight line-clamp-2">{site.name}</span>
        {isFavorited && (
          <span className="text-red-500 shrink-0 text-xs">♥</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        {site.countryCode && <span>{site.countryCode}</span>}
        {site.altitude && <span>{site.altitude}m</span>}
        {activeOrientations.length > 0 && (
          <span className="text-muted-foreground/80">{activeOrientations.join(' ')}</span>
        )}
      </div>
    </Link>
  );
}

// ── Card for mobile grid ──
function SiteCard({ site, isFavorited }: { site: BrowseSite; isFavorited: boolean }) {
  const orientations = getOrientations(site);
  const activeOrientations = Object.entries(orientations)
    .filter(([, r]) => r >= 1)
    .map(([dir]) => dir);

  return (
    <Link
      to={`/sites/${site.slug}`}
      className="border rounded-lg p-4 hover:border-primary/50 transition-colors block"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm leading-tight">{site.name}</h3>
        {isFavorited && <span className="text-red-500 text-xs shrink-0">♥</span>}
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        {site.countryCode && <p>{site.countryCode}</p>}
        {site.altitude && <p>{site.altitude}m elevation</p>}
        {activeOrientations.length > 0 && <p>Wind: {activeOrientations.join(', ')}</p>}
      </div>
    </Link>
  );
}
