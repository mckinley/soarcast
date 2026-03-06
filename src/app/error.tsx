'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

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

  // Determine if this is a network error
  const isNetworkError = error.message.includes('fetch') || error.message.includes('network');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
      <h1 className="text-3xl font-bold mb-2">
        {isNetworkError ? 'Connection Problem' : 'Something went wrong'}
      </h1>
      <p className="text-muted-foreground mb-2 text-center max-w-md">
        {isNetworkError
          ? 'Unable to connect to the server. Please check your internet connection and try again.'
          : 'An unexpected error occurred while loading this page. Please try again.'}
      </p>
      {error.message && !error.message.includes('digest') && (
        <p className="text-sm text-muted-foreground mb-6 text-center max-w-md font-mono bg-muted px-3 py-2 rounded">
          {error.message}
        </p>
      )}
      <div className="flex gap-3">
        <Button onClick={() => reset()} size="lg" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
        <Button
          variant="outline"
          onClick={() => (window.location.href = '/')}
          size="lg"
          className="gap-2"
        >
          <Home className="h-4 w-4" />
          Go Home
        </Button>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-muted-foreground">
          Error ID: {error.digest} •{' '}
          <a
            href="https://github.com/yourusername/soarcast/issues"
            className="underline hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            Report Issue
          </a>
        </p>
      )}
    </div>
  );
}
