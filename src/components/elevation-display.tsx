'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ElevationDisplayProps {
  elevationMeters: number;
  label?: string;
  className?: string;
}

const STORAGE_KEY = 'soarcast-elevation-unit-preference';

/**
 * Gets the saved elevation unit preference from localStorage
 * Returns 'm' as default if not found or invalid
 */
function getSavedUnit(): 'm' | 'ft' {
  if (typeof window === 'undefined') return 'm';
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'ft' ? 'ft' : 'm';
}

/**
 * Displays elevation with a toggle between meters and feet
 * Remembers user preference in localStorage
 */
export function ElevationDisplay({
  elevationMeters,
  label = 'Elevation',
  className = '',
}: ElevationDisplayProps) {
  const [unit, setUnit] = useState<'m' | 'ft'>(getSavedUnit);

  const toggleUnit = () => {
    const newUnit = unit === 'm' ? 'ft' : 'm';
    setUnit(newUnit);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newUnit);
    }
  };

  const elevationFeet = Math.round(elevationMeters * 3.28084);
  const displayValue = unit === 'm' ? elevationMeters : elevationFeet;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span>
        {label}: {displayValue.toLocaleString()}
        {unit}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleUnit}
        className="h-5 px-1.5 text-xs font-normal"
        aria-label={`Toggle to ${unit === 'm' ? 'feet' : 'meters'}`}
      >
        ({unit === 'm' ? 'ft' : 'm'})
      </Button>
    </span>
  );
}
