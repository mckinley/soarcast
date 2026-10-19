'use client';

import { useEffect, useState } from 'react';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { VectorBasemap } from '@/components/vector-basemap';
import { ThermalOverlays } from '@/components/thermal-overlays';
import { Icon } from 'leaflet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LocateFixed } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Leaflet's default icon paths don't survive bundling
const markerIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// North Bend, WA: where SoarCast's pilots are so far
const DEFAULT_CENTER: [number, number] = [47.4829, -121.941];
const PIN_ZOOM = 14;

export interface MapFocus {
  latitude: number;
  longitude: number;
}

interface MapPickerProps {
  latitude: number | null;
  longitude: number | null;
  onLocationSelect: (lat: number, lng: number) => void;
  /** Set to move the map to a place (search result, typed coordinates) */
  focus?: MapFocus | null;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyTo({ focus }: { focus: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.flyTo([focus.latitude, focus.longitude], Math.max(map.getZoom(), PIN_ZOOM));
    }
  }, [focus, map]);
  return null;
}

/**
 * Pick a launch on the map: tap to drop the pin, drag it to adjust, search
 * a place name, or use the device's location when standing on the launch.
 */
export function MapPicker({ latitude, longitude, onLocationSelect, focus }: MapPickerProps) {
  const pinned = latitude !== null && longitude !== null;
  const [flyTo, setFlyTo] = useState<MapFocus | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (focus) setFlyTo(focus);
  }, [focus]);

  const moveTo = (lat: number, lng: number) => {
    onLocationSelect(lat, lng);
    setFlyTo({ latitude: lat, longitude: lng });
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setMessage('');
    setSearchResults([]);
    try {
      // OpenStreetMap's geocoder; peaks are in it by name ("Mailbox Peak")
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`,
      );
      if (!response.ok) throw new Error(`Search answered ${response.status}`);
      const results: NominatimResult[] = await response.json();
      if (results.length === 0) setMessage('Nothing found. Try another name.');
      else setSearchResults(results);
    } catch (error) {
      console.error('Place search failed:', error);
      setMessage('Search failed. Try again in a moment.');
    } finally {
      setSearching(false);
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setMessage("This browser can't share its location.");
      return;
    }
    setLocating(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        moveTo(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setLocating(false);
        setMessage("Couldn't get your location.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Search a peak or place"
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
          {searching ? 'Searching…' : 'Search'}
        </Button>
        <Button
          type="button"
          onClick={handleLocate}
          disabled={locating}
          variant="outline"
          size="icon"
          title="Use my location"
          aria-label="Use my location"
        >
          <LocateFixed className={`h-4 w-4 ${locating ? 'animate-pulse' : ''}`} />
        </Button>
      </div>

      {searchResults.length > 0 && (
        <div className="border rounded-md max-h-48 overflow-y-auto">
          {searchResults.map((result, index) => (
            <button
              key={index}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm border-b last:border-b-0"
              onClick={() => {
                moveTo(parseFloat(result.lat), parseFloat(result.lon));
                setSearchResults([]);
                setSearchQuery('');
              }}
            >
              {result.display_name}
            </button>
          ))}
        </div>
      )}

      {message && <p className="text-sm text-red-500">{message}</p>}

      <div className="h-[320px] sm:h-[400px] rounded-md overflow-hidden border">
        <MapContainer
          center={pinned ? [latitude, longitude] : DEFAULT_CENTER}
          zoom={pinned ? PIN_ZOOM : 10}
          maxZoom={18}
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <VectorBasemap />
          <ThermalOverlays />
          <ClickToPlace onPick={onLocationSelect} />
          <FlyTo focus={flyTo} />
          {pinned && (
            <Marker
              position={[latitude, longitude]}
              icon={markerIcon}
              draggable={true}
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  onLocationSelect(lat, lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        Tap the map where you launch, then drag the pin to fine-tune it.
      </p>
    </div>
  );
}
