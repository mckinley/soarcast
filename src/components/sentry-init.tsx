'use client';

import { useEffect } from 'react';
import { initSentry } from '@/lib/sentry';

/**
 * Client component to initialize Sentry
 * Must be a client component since Sentry runs in browser
 */
export function SentryInit() {
  useEffect(() => {
    initSentry();
  }, []);

  return null;
}
