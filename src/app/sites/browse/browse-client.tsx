'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, SlidersHorizontal, Clock } from 'lucide-react';
import type { LaunchSite } from '@/db/schema';
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

interface SitesBrowseClientProps {
  initialSites: LaunchSite[];
  filterOptions: {
    regions: string[];
    countries: string[];
    siteTypes: string[];
  };
  searchParams: {
    search?: string;
    region?: string;
    country?: string;
    siteType?: string;
    orientations?: string;
    sort?: string;
    minScore?: string;
  };
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

export function SitesBrowseClient({
  initialSites,
  filterOptions,
  searchParams,
}: SitesBrowseClientProps) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [searchValue, setSearchValue] = useState(searchParams.search || '');
  const [selectedRegion, setSelectedRegion] = useState(searchParams.region || '');
  const [selectedCountry, setSelectedCountry] = useState(searchParams.country || '');
  const [selectedSiteType, setSelectedSiteType] = useState(searchParams.siteType || '');
  const [selectedOrientations, setSelectedOrientations] = useState<string[]>(
    searchParams.orientations ? searchParams.orientations.split(',') : [],
  );
  const [sortBy, setSortBy] = useState(searchParams.sort || 'name');
  const [minScore, setMinScore] = useState(searchParams.minScore || 'all');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(() => getRecentSearches());
  const [showRecentSearches, setShowRecentSearches] = useState(false);

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

    // Filter by orientations (client-side, JSON field)
    if (selectedOrientations.length > 0) {
      sites = sites.filter((site) => {
        if (!site.orientations) return false;
        return selectedOrientations.some((orientation) => {
          const rating = site.orientations?.[orientation];
          return rating && rating >= 1;
        });
      });
    }

    // Filter by minimum flyability score (would need today's forecast data)
    // For now, skip this filter as it requires fetching forecast data
    // This is a placeholder for future enhancement

    // Sort
    switch (sortBy) {
      case 'distance':
        if (userLocation) {
          sites.sort((a, b) => {
            const distA = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              parseFloat(a.latitude),
              parseFloat(a.longitude),
            );
            const distB = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              parseFloat(b.latitude),
              parseFloat(b.longitude),
            );
            return distA - distB;
          });
        }
        break;
      case 'elevation':
        sites.sort((a, b) => (b.elevation || 0) - (a.elevation || 0));
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
  }, [initialSites, selectedOrientations, sortBy, userLocation]);

  const updateURL = () => {
    const params = new URLSearchParams(urlSearchParams);

    // Set or delete each parameter
    if (searchValue.trim()) {
      params.set('search', searchValue.trim());
    } else {
      params.delete('search');
    }

    if (selectedRegion) {
      params.set('region', selectedRegion);
    } else {
      params.delete('region');
    }

    if (selectedCountry) {
      params.set('country', selectedCountry);
    } else {
      params.delete('country');
    }

    if (selectedSiteType) {
      params.set('siteType', selectedSiteType);
    } else {
      params.delete('siteType');
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
      router.push(`/sites/browse?${params.toString()}`);
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
    setSelectedRegion('');
    setSelectedCountry('');
    setSelectedSiteType('');
    setSelectedOrientations([]);
    setSortBy('name');
    setMinScore('all');

    startTransition(() => {
      router.push('/sites/browse');
    });
  };

  const toggleOrientation = (orientation: string) => {
    setSelectedOrientations((prev) =>
      prev.includes(orientation) ? prev.filter((o) => o !== orientation) : [...prev, orientation],
    );
  };

  const hasActiveFilters =
    searchValue ||
    selectedRegion ||
    selectedCountry ||
    selectedSiteType ||
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
                {minScore !== 'all' && (
                  <p className="text-xs text-muted-foreground">
                    Note: Flyability filtering requires forecasts (coming soon)
                  </p>
                )}
              </div>

              {/* Region */}
              <div className="space-y-2">
                <Label>Region</Label>
                <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                  <SelectTrigger>
                    <SelectValue placeholder="All regions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All regions</SelectItem>
                    {filterOptions.regions.map((region) => (
                      <SelectItem key={region} value={region}>
                        {region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

              {/* Site Type */}
              <div className="space-y-2">
                <Label>Site Type</Label>
                <Select value={selectedSiteType} onValueChange={setSelectedSiteType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All types</SelectItem>
                    {filterOptions.siteTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
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
          {selectedRegion && (
            <Badge variant="secondary">
              Region: {selectedRegion}
              <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setSelectedRegion('')} />
            </Badge>
          )}
          {selectedCountry && (
            <Badge variant="secondary">
              Country: {selectedCountry}
              <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setSelectedCountry('')} />
            </Badge>
          )}
          {selectedSiteType && (
            <Badge variant="secondary">
              Type: {selectedSiteType}
              <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setSelectedSiteType('')} />
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
