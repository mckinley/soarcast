'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SiteFormDialog } from '@/components/site-form-dialog';
import type { Site } from '@/types';

interface SiteCardProps {
  site: Site;
  onUpdate: (id: string, data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function SiteCard({ site, onUpdate, onDelete }: SiteCardProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${site.name}?`)) return;

    setDeleting(true);
    try {
      await onDelete(site.id);
    } catch (error) {
      console.error('Failed to delete site:', error);
    } finally {
      setDeleting(false);
    }
  };

  const windDirText = site.idealWindDirections.length
    ? site.idealWindDirections.map((d) => `${d}°`).join(', ')
    : 'Not specified';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{site.name}</CardTitle>
        <CardDescription>
          {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="font-medium">Elevation:</span> {site.elevation}m
          </div>
          <div>
            <span className="font-medium">Max Wind:</span> {site.maxWindSpeed} km/h
          </div>
        </div>
        <div className="text-sm">
          <span className="font-medium">Ideal Wind:</span> {windDirText}
        </div>
        {site.notes && (
          <div className="text-sm text-muted-foreground pt-2 border-t">{site.notes}</div>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        <SiteFormDialog
          site={site}
          trigger={<Button variant="outline" size="sm">Edit</Button>}
          onSubmit={(data) => onUpdate(site.id, data)}
        />
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
      </CardFooter>
    </Card>
  );
}
