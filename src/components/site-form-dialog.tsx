'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Site } from '@/types';

interface SiteFormDialogProps {
  site?: Site;
  trigger?: React.ReactNode;
  onSubmit: (data: SiteFormData) => Promise<void>;
}

export interface SiteFormData {
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  idealWindDirections: number[];
  maxWindSpeed: number;
  notes?: string;
}

export function SiteFormDialog({ site, trigger, onSubmit }: SiteFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof SiteFormData, string>>>({});

  const [formData, setFormData] = useState<SiteFormData>({
    name: site?.name || '',
    latitude: site?.latitude || 0,
    longitude: site?.longitude || 0,
    elevation: site?.elevation || 0,
    idealWindDirections: site?.idealWindDirections || [],
    maxWindSpeed: site?.maxWindSpeed || 30,
    notes: site?.notes || '',
  });

  const [windDirectionsInput, setWindDirectionsInput] = useState<string>(
    site?.idealWindDirections?.join(', ') || ''
  );

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof SiteFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (formData.latitude < -90 || formData.latitude > 90) {
      newErrors.latitude = 'Latitude must be between -90 and 90';
    }

    if (formData.longitude < -180 || formData.longitude > 180) {
      newErrors.longitude = 'Longitude must be between -180 and 180';
    }

    if (formData.elevation < 0) {
      newErrors.elevation = 'Elevation must be positive';
    }

    if (formData.maxWindSpeed <= 0) {
      newErrors.maxWindSpeed = 'Max wind speed must be positive';
    }

    // Validate wind directions input
    if (windDirectionsInput.trim()) {
      const directions = windDirectionsInput
        .split(',')
        .map((d) => parseInt(d.trim()))
        .filter((d) => !isNaN(d));

      if (directions.some((d) => d < 0 || d > 360)) {
        newErrors.idealWindDirections = 'Wind directions must be between 0 and 360';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Parse wind directions
    const directions = windDirectionsInput
      .split(',')
      .map((d) => parseInt(d.trim()))
      .filter((d) => !isNaN(d));

    const submitData: SiteFormData = {
      ...formData,
      idealWindDirections: directions,
    };

    setLoading(true);
    try {
      await onSubmit(submitData);
      setOpen(false);
      // Reset form
      setFormData({
        name: '',
        latitude: 0,
        longitude: 0,
        elevation: 0,
        idealWindDirections: [],
        maxWindSpeed: 30,
        notes: '',
      });
      setWindDirectionsInput('');
      setErrors({});
    } catch (error) {
      console.error('Failed to save site:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button>Add Site</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{site ? 'Edit Site' : 'Add Site'}</DialogTitle>
            <DialogDescription>
              {site
                ? 'Update the details of your flying site.'
                : 'Add a new flying site to track weather conditions.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Tiger Mountain"
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="latitude">Latitude *</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={formData.latitude}
                  onChange={(e) =>
                    setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="47.4829"
                />
                {errors.latitude && <p className="text-sm text-red-500">{errors.latitude}</p>}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="longitude">Longitude *</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={formData.longitude}
                  onChange={(e) =>
                    setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="-121.9410"
                />
                {errors.longitude && <p className="text-sm text-red-500">{errors.longitude}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="elevation">Elevation (m) *</Label>
                <Input
                  id="elevation"
                  type="number"
                  value={formData.elevation}
                  onChange={(e) =>
                    setFormData({ ...formData, elevation: parseInt(e.target.value) || 0 })
                  }
                  placeholder="460"
                />
                {errors.elevation && <p className="text-sm text-red-500">{errors.elevation}</p>}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maxWindSpeed">Max Wind Speed (km/h) *</Label>
                <Input
                  id="maxWindSpeed"
                  type="number"
                  value={formData.maxWindSpeed}
                  onChange={(e) =>
                    setFormData({ ...formData, maxWindSpeed: parseInt(e.target.value) || 0 })
                  }
                  placeholder="30"
                />
                {errors.maxWindSpeed && (
                  <p className="text-sm text-red-500">{errors.maxWindSpeed}</p>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="windDirections">Ideal Wind Directions (degrees)</Label>
              <Input
                id="windDirections"
                value={windDirectionsInput}
                onChange={(e) => setWindDirectionsInput(e.target.value)}
                placeholder="e.g., 180, 225, 270 (comma-separated)"
              />
              <p className="text-xs text-muted-foreground">
                Enter compass directions (0-360) separated by commas
              </p>
              {errors.idealWindDirections && (
                <p className="text-sm text-red-500">{errors.idealWindDirections}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional notes about the site"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : site ? 'Update' : 'Add Site'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
