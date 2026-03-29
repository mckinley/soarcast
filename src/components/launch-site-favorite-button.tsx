import { useState } from 'react';
import { useFetcher, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';

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
  const fetcher = useFetcher();
  const isPending = fetcher.state !== 'idle';
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleToggleFavorite = () => {
    // If not authenticated, redirect to sign-in
    if (!isAuthenticated) {
      const currentPath = window.location.pathname;
      navigate(`/auth/signin?callbackUrl=${encodeURIComponent(currentPath)}`);
      return;
    }

    setError(null);
    try {
      if (isFavorited) {
        setIsFavorited(false);
        fetcher.submit(
          { intent: 'unfavorite', siteId },
          { method: 'POST', action: '/sites/browse' },
        );
      } else {
        setIsFavorited(true);
        fetcher.submit({ intent: 'favorite', siteId }, { method: 'POST', action: '/sites/browse' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update favorite');
    }
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
