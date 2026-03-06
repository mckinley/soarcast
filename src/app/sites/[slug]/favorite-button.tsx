'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { favoriteSite, unfavoriteSite } from '../browse/actions';
import { useRouter } from 'next/navigation';

interface LaunchSiteFavoriteButtonProps {
  siteId: string;
  initialIsFavorited: boolean;
  isAuthenticated: boolean;
}

export function LaunchSiteFavoriteButton({
  siteId,
  initialIsFavorited,
  isAuthenticated,
}: LaunchSiteFavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleToggleFavorite = () => {
    // If not authenticated, redirect to sign-in
    if (!isAuthenticated) {
      const currentPath = window.location.pathname;
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(currentPath)}`);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        if (isFavorited) {
          await unfavoriteSite(siteId);
          setIsFavorited(false);
        } else {
          await favoriteSite(siteId);
          setIsFavorited(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update favorite');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant={isFavorited ? 'default' : 'outline'}
        size="sm"
        onClick={handleToggleFavorite}
        disabled={isPending}
        className="gap-2"
      >
        <Heart className={`h-4 w-4 ${isFavorited ? 'fill-current' : ''}`} />
        {isAuthenticated ? (isFavorited ? 'Favorited' : 'Add to Favorites') : 'Sign in to Favorite'}
      </Button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
