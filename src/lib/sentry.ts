// Optional Sentry error tracking
// Only loads and initializes if NEXT_PUBLIC_SENTRY_DSN is configured
// Note: Sentry is disabled for now to avoid build errors with optional dependencies

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Initializes Sentry if DSN is configured
 * Call this in app layout or _app
 */
export function initSentry() {
  // Disabled: Sentry integration is optional and requires @sentry/nextjs to be installed
  // To enable: npm install @sentry/nextjs and set NEXT_PUBLIC_SENTRY_DSN
  console.log('Sentry integration is disabled (optional dependency not configured)');
}

/**
 * Captures an exception to Sentry if configured
 * Safe to call even if Sentry is not configured
 */
export function captureException(error: Error, context?: Record<string, any>) {
  // Sentry disabled - log to console instead
  console.error('Error:', error, context);
}

/**
 * Captures a message to Sentry if configured
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  // Sentry disabled - log to console instead
  console.log(`[${level}] ${message}`);
}

/**
 * Sets user context for Sentry
 */
export function setUser(user: { id: string; email?: string; name?: string } | null) {
  // Sentry disabled - no-op
  if (user) {
    console.log('User context set (Sentry disabled):', user.id);
  }
}
