import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/api/login',
  '/api/prices/rate-limit',
  '/api/prices/refresh',
  '/api/prices/health',
  '/api/tradestation/sync',
  '/api/cron/ccxt/sync',
  '/api/cron/ccxt/sync-jobs',
  // OAuth callbacks must be public so the broker can redirect back to us.
  '/api/tradestation/auth/callback'
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // TradeStation may require redirect_uri to be exactly http://localhost:3000 (no path).
  // In that case the OAuth callback hits '/', so we rewrite it to our API callback.
  if (pathname === '/' && request.nextUrl.searchParams.has('code') && request.nextUrl.searchParams.has('state')) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = '/api/tradestation/auth/callback';
    return NextResponse.rewrite(rewriteUrl);
  }

  const isPublic =
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/api/health');

  if (isPublic) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('app_session');

  if (sessionCookie?.value) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('redirect', pathname || '/');

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)).*)',
  ],
};