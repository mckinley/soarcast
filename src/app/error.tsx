'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
      <h1 className="text-3xl font-bold mb-2">Something went wrong</h1>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        An unexpected error occurred while loading this page. Please try again or contact support if
        the problem persists.
      </p>
      <div className="flex gap-3">
        <Button onClick={() => reset()} size="lg">
          Try Again
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = '/')} size="lg">
          Go to Dashboard
        </Button>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-muted-foreground">Error ID: {error.digest}</p>
      )}
    </div>
  );
}
