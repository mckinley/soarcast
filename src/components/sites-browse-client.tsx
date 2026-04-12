import { useState, useTransition, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, SlidersHorizontal, Clock, Heart } from 'lucide-react';
import { getOrientations } from '@/lib/site-utils';

/** Minimal site shape used by the browse page — works with both pgsites API and local DB sites. */
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
import {
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
  type RecentSearch,
} from '@/lib/recent-searches';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { SitesBrowseMapWrapper } from '@/components/sites-browse-map-wrapper';
// Favorites are passed as initialFavoriteIds prop from route loader
import { Link } from 'react-router';

interface SitesBrowseClientProps {
  initialSites: BrowseSite[];
  filterOptions: {
    countries: string[];
  };
  searchParams: {
    search?: string;
    country?: string;
    orientations?: string;
    sort?: string;
    minScore?: string;
  };
  siteScores: Record<string, number | null>;
  initialFavoriteIds?: string[];
}

const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'distance', label: 'Distance (Nearest)' },
  { value: 'elevation', label: 'Elevation (High-Low)' },
  { value: 'recent', label: 'Recently Added' },
];
const MIN_SCORE_OPTIONS = [
  { value: 'all', label: 'All Sites' },
  { value: 'good', label: 'Good+ (51+)' },
  { value: 'great', label: 'Great+ (71+)' },
  { value: 'epic', label: 'Epic (86+)' },
];

const SCORE_THRESHOLDS: Record<string, number> = {
  good: 51,
  great: 71,
  epic: 86,
};

export function SitesBrowseClient({
  initialSites,
  filterOptions,
  searchParams,
  siteScores,
  initialFavoriteIds = [],
}: SitesBrowseClientProps) {
  const navigate = useNavigate();
  const [urlSearchParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [searchValue, setSearchValue] = useState(searchParams.search || '');
  const [selectedCountry, setSelectedCountry] = useState(searchParams.country || '');
  const [selectedOrientations, setSelectedOrientations] = useState<string[]>(
    searchParams.orientations ? searchParams.orientations.split(',') : [],
  );
  const [sortBy, setSortBy] = useState(searchParams.sort || 'name');
  const [minScore, setMinScore] = useState(searchParams.minScore || 'all');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(() => getRecentSearches());
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const [favoriteSiteIds] = useState<Set<string>>(new Set(initialFavoriteIds));

  // Request user location for distance sorting
  useEffect(() => {
    if (sortBy === 'distance' && !userLocation) {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          (error) => {
            console.warn('Geolocation denied or unavailable:', error);
          },
        );
      }
    }
  }, [sortBy, userLocation]);

  // Client-side filtering and sorting
  const filteredAndSortedSites = useMemo(() => {
    let sites = [...initialSites];

    // Filter by orientations (computed from wind columns)
    if (selectedOrientations.length > 0) {
      sites = sites.filter((site) => {
        const orientations = getOrientations(site);
        return selectedOrientations.some((orientation) => {
          const rating = orientations[orientation];
          return rating && rating >= 1;
        });
      });
    }

    // Filter by minimum flyability score
    if (minScore !== 'all') {
      const threshold = SCORE_THRESHOLDS[minScore] ?? 0;
      sites = sites.filter((site) => {
        const score = siteScores[site.id];
        return score != null && score >= threshold;
      });
    }

    // Sort
    switch (sortBy) {
      case 'distance':
        if (userLocation) {
          sites.sort((a, b) => {
            const distA = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              a.latitude,
              a.longitude,
            );
            const distB = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              b.latitude,
              b.longitude,
            );
            return distA - distB;
          });
        }
        break;
      case 'elevation':
        sites.sort((a, b) => (b.altitude || 0) - (a.altitude || 0));
        break;
      case 'recent':
        sites.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        break;
      case 'name':
      default:
        sites.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return sites;
  }, [initialSites, selectedOrientations, sortBy, userLocation, minScore, siteScores]);

  const updateURL = () => {
    const params = new URLSearchParams(urlSearchParams);

    if (searchValue.trim()) {
      params.set('search', searchValue.trim());
    } else {
      params.delete('search');
    }

    if (selectedCountry) {
      params.set('country', selectedCountry);
    } else {
      params.delete('country');
    }

    if (selectedOrientations.length > 0) {
      params.set('orientations', selectedOrientations.join(','));
    } else {
      params.delete('orientations');
    }

    if (sortBy !== 'name') {
      params.set('sort', sortBy);
    } else {
      params.delete('sort');
    }

    if (minScore !== 'all') {
      params.set('minScore', minScore);
    } else {
      params.delete('minScore');
    }

    startTransition(() => {
      navigate(`/sites/browse?${params.toString()}`);
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      addRecentSearch(searchValue.trim());
      setRecentSearches(getRecentSearches());
    }
    setShowRecentSearches(false);
    updateURL();
  };

  const handleRecentSearchClick = (query: string) => {
    setSearchValue(query);
    setShowRecentSearches(false);
    // Don't immediately search, let user modify if needed
  };

  const handleClear = () => {
    setSearchValue('');
    setSelectedCountry('');
    setSelectedOrientations([]);
    setSortBy('name');
    setMinScore('all');

    startTransition(() => {
      navigate('/sites/browse');
    });
  };

  const toggleOrientation = (orientation: string) => {
    setSelectedOrientations((prev) =>
      prev.includes(orientation) ? prev.filter((o) => o !== orientation) : [...prev, orientation],
    );
  };

  const hasActiveFilters =
    searchValue ||
    selectedCountry ||
    selectedOrientations.length > 0 ||
    sortBy !== 'name' ||
    minScore !== 'all';

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 relative">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search sites by name, region, or country..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setShowRecentSearches(true)}
            onBlur={() => setTimeout(() => setShowRecentSearches(false), 200)}
            className="pl-9 pr-9"
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

          {/* Recent searches dropdown */}
          {showRecentSearches && recentSearches.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md z-10">
              <div className="p-2 border-b flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Recent Searches
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearRecentSearches();
                    setRecentSearches([]);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              <div className="py-1">
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleRecentSearchClick(search.query)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                  >
                    {search.query}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Searching...' : 'Search'}
        </Button>
        <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="relative">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full">
                  !
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filter & Sort</SheetTitle>
              <SheetDescription>Refine your search for the perfect launch site</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 mt-6">
              {/* Sort */}
              <div className="space-y-2">
                <Label>Sort By</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sortBy === 'distance' && !userLocation && (
                  <p className="text-xs text-muted-foreground">
                    Enable location access to sort by distance
                  </p>
                )}
              </div>

              {/* Minimum Score (placeholder for future) */}
              <div className="space-y-2">
                <Label>Flyability Today</Label>
                <Select value={minScore} onValueChange={setMinScore}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MIN_SCORE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {minScore !== 'all' &&
                  (() => {
                    const unavailableCount = initialSites.filter(
                      (s) => siteScores[s.id] == null,
                    ).length;
                    return unavailableCount > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Score unavailable for {unavailableCount} site
                        {unavailableCount !== 1 ? 's' : ''} — visit a site page to load its
                        forecast.
                      </p>
                    ) : null;
                  })()}
              </div>

              {/* Country */}
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                  <SelectTrigger>
                    <SelectValue placeholder="All countries" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All countries</SelectItem>
                    {filterOptions.countries.map((country) => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Orientations */}
              <div className="space-y-2">
                <Label>Orientations</Label>
                <div className="flex flex-wrap gap-2">
                  {ORIENTATIONS.map((orientation) => (
                    <Badge
                      key={orientation}
                      variant={selectedOrientations.includes(orientation) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleOrientation(orientation)}
                    >
                      {orientation}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select wind directions (sites that work in these conditions)
                </p>
              </div>

              {/* Apply & Clear */}
              <div className="flex gap-2 pt-4">
                <Button onClick={updateURL} className="flex-1">
                  Apply Filters
                </Button>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={handleClear}>
                    Clear All
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </form>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {searchValue && (
            <Badge variant="secondary">
              Search: {searchValue}
              <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setSearchValue('')} />
            </Badge>
          )}
          {selectedCountry && (
            <Badge variant="secondary">
              Country: {selectedCountry}
              <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setSelectedCountry('')} />
            </Badge>
          )}
          {selectedOrientations.map((orientation) => (
            <Badge key={orientation} variant="secondary">
              {orientation}
              <X
                className="h-3 w-3 ml-1 cursor-pointer"
                onClick={() => toggleOrientation(orientation)}
              />
            </Badge>
          ))}
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredAndSortedSites.length} site
        {filteredAndSortedSites.length !== 1 ? 's' : ''}
        {sortBy === 'distance' && userLocation && ' sorted by distance'}
        {sortBy === 'elevation' && ' sorted by elevation'}
        {sortBy === 'recent' && ' (recently added)'}
      </div>

      {/* Map */}
      <div className="mt-6">
        <SitesBrowseMapWrapper sites={filteredAndSortedSites} />
      </div>

      {/* Site list */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredAndSortedSites.length === 0 ? (
          <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">No sites found matching your criteria</p>
          </div>
        ) : (
          filteredAndSortedSites.map((site) => {
            const isFavorited = favoriteSiteIds.has(site.id);

            return (
              <div
                key={site.id}
                className="border rounded-lg p-4 hover:border-primary/50 transition-colors relative"
              >
                {isFavorited && (
                  <Heart className="absolute top-3 right-3 h-4 w-4 fill-red-500 text-red-500" />
                )}
                <h3 className="font-semibold text-lg mb-2 pr-6">{site.name}</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  {site.region && <p>Region: {site.region}</p>}
                  {!site.region && site.countryCode && <p>Country: {site.countryCode}</p>}
                  {site.altitude && <p>Elevation: {site.altitude}m</p>}
                  {(site.isParagliding || site.isHanggliding) && (
                    <p>
                      Flying:{' '}
                      {[site.isParagliding && 'paragliding', site.isHanggliding && 'hanggliding']
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                  {(() => {
                    const orientations = getOrientations(site);
                    const activeOrientations = Object.entries(orientations)
                      .filter(([, rating]) => rating >= 1)
                      .map(([dir]) => dir);
                    return activeOrientations.length > 0 ? (
                      <p>Orientations: {activeOrientations.join(', ')}</p>
                    ) : null;
                  })()}
                </div>
                <div className="mt-4 flex gap-2">
                  <Link
                    to={`/sites/${site.slug}`}
                    className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View Details →
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * Calculate distance between two lat/lng points using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
