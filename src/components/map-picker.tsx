'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { Icon } from 'leaflet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon in Next.js
// Leaflet's default icon paths don't work with webpack
const markerIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface MapPickerProps {
  latitude: number;
  longitude: number;
  onLocationSelect: (lat: number, lng: number) => void;
}

/**
 * Component that handles map clicks to select a location
 */
function LocationMarker({
  position,
  onLocationSelect,
}: {
  position: [number, number];
  onLocationSelect: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });

  return position[0] !== 0 || position[1] !== 0 ? (
    <Marker position={position} icon={markerIcon} />
  ) : null;
}

/**
 * Geocoding search result from Nominatim
 */
interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export function MapPicker({ latitude, longitude, onLocationSelect }: MapPickerProps) {
  const [position, setPosition] = useState<[number, number]>([
    latitude || 47.4829,
    longitude || -121.941,
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Update position when props change (e.g., editing existing site)
  useEffect(() => {
    if (latitude && longitude) {
      setPosition([latitude, longitude]);
    }
  }, [latitude, longitude]);

  const handleLocationSelect = (lat: number, lng: number) => {
    setPosition([lat, lng]);
    onLocationSelect(lat, lng);
  };

  // Debounced search function
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchError('Please enter a location to search');
      return;
    }

    setSearching(true);
    setSearchError('');
    setSearchResults([]);

    try {
      // Nominatim has a 1 req/sec rate limit - add user agent header
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`,
        {
          headers: {
            'User-Agent': 'SoarCast Weather App',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const results: NominatimResult[] = await response.json();

      if (results.length === 0) {
        setSearchError('No locations found. Try a different search term.');
      } else {
        setSearchResults(results);
      }
    } catch (error) {
      console.error('Geocoding search error:', error);
      setSearchError('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleResultClick = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    handleLocationSelect(lat, lng);
    setSearchResults([]);
    setSearchQuery('');
  };

  return (
    <div className="space-y-3">
      {/* Search box */}
      <div className="flex gap-2">
        <Input
          placeholder="Search for a location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSearch();
            }
          }}
        />
        <Button type="button" onClick={handleSearch} disabled={searching} variant="outline">
          {searching ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="border rounded-md max-h-48 overflow-y-auto">
          {searchResults.map((result, index) => (
            <button
              key={index}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm border-b last:border-b-0"
              onClick={() => handleResultClick(result)}
            >
              {result.display_name}
            </button>
          ))}
        </div>
      )}

      {/* Search error */}
      {searchError && <p className="text-sm text-red-500">{searchError}</p>}

      {/* Map */}
      <div className="h-[400px] rounded-md overflow-hidden border">
        <MapContainer
          center={position}
          zoom={10}
          scrollWheelZoom={true}
          className="h-full w-full"
          key={`${position[0]}-${position[1]}`} // Force re-center when position changes
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationMarker position={position} onLocationSelect={handleLocationSelect} />
        </MapContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        Click on the map to select a location, or search for a place name above.
      </p>
    </div>
  );
}
