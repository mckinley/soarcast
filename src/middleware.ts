import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Check if user is authenticated
  const isAuthenticated = !!req.auth;

  // Protected routes that require authentication (user-specific pages)
  const protectedRoutes = ['/dashboard', '/settings'];

  // Public read-only routes (allow without authentication)
  const publicRoutes = ['/sites/browse', '/sites/'];

  // Protected API routes (mutation endpoints only)
  const protectedApiRoutes = ['/api/settings', '/api/notifications'];

  // Check if this is a public route
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  // Check if current path matches protected routes
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

  // Check if it's a protected API endpoint
  // Note: /api/sites and /api/weather/profile are now public for GET requests
  const isProtectedApi = protectedApiRoutes.some((route) => pathname.startsWith(route));

  // Allow public routes without authentication
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Redirect to sign-in if accessing protected route without authentication
  if ((isProtectedRoute || isProtectedApi) && !isAuthenticated) {
    if (isProtectedApi) {
      // For API routes, return 401 Unauthorized
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // For pages, redirect to sign-in
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

// Configure which routes use the middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
