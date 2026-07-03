import { NextRequest, NextResponse } from 'next/server';
import {
  getApiOrigin,
  getAppOrigin,
  hostMatchesApi,
  hostMatchesApp,
  isLocalhostHost,
  resolveRequestHost,
} from '@/lib/domains';

const API_PUBLIC_PAGE_PREFIXES = ['/share', '/review', '/support', '/account-deletion'];

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/assets') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png' ||
    pathname === '/robots.txt' ||
    pathname === '/manifest.json' ||
    /\.(png|jpe?g|webp|svg|ico|css|js|woff2?|ttf|map)$/i.test(pathname)
  );
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isAdminUiPath(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/admin') || pathname === '/';
}

function isApiPublicPage(pathname: string): boolean {
  return API_PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function middleware(request: NextRequest) {
  const host = resolveRequestHost(request);
  const { pathname } = request.nextUrl;

  // Dev / LAN — no domain split
  if (isLocalhostHost(host)) {
    return NextResponse.next();
  }

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // --- api.tidyflowapp.com: API + public token pages only ---
  if (hostMatchesApi(host)) {
    if (isApiPath(pathname) || isApiPublicPage(pathname)) {
      return NextResponse.next();
    }

    if (pathname === '/') {
      return NextResponse.json(
        {
          success: true,
          service: 'TidyFlow API',
          health: `${getApiOrigin()}/api/health`,
          publicPricing: `${getApiOrigin()}/api/public/plans`,
        },
        { status: 200 }
      );
    }

    // Admin UI lives on app.* — send users there
    if (isAdminUiPath(pathname)) {
      return NextResponse.redirect(new URL('/login', getAppOrigin()));
    }

    return NextResponse.json(
      { success: false, message: 'Not found. Use app.tidyflowapp.com for admin access.' },
      { status: 404 }
    );
  }

  // --- app.tidyflowapp.com: admin UI (allow /api on same server — no redirect) ---
  if (hostMatchesApp(host)) {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Allow login, admin, API, and public pages on the app host
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|assets/).*)'],
};
