import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Check if user is authenticated
  const isAuthenticated = !!req.auth;

  // Protected routes that require authentication
  const protectedRoutes = ['/sites', '/settings'];

  // Protected API routes (mutation endpoints)
  const protectedApiRoutes = [
    '/api/sites',
    '/api/settings',
    '/api/notifications',
  ];

  // Check if current path matches protected routes
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  const isProtectedApi = protectedApiRoutes.some((route) =>
    pathname.startsWith(route)
  );

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
