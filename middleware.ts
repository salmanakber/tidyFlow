import { NextRequest, NextResponse } from 'next/server';
import {
  getApiOrigin,
  getAppOrigin,
  hostMatchesApi,
  hostMatchesApp,
  isLocalhostHost,
} from '@/lib/domains';

const API_PUBLIC_PAGE_PREFIXES = ['/share', '/review', '/support', '/account-deletion'];

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/assets') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png' ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico')
  );
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isAdminUiPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/admin') ||
    pathname === '/'
  );
}

function isApiPublicPage(pathname: string): boolean {
  return API_PUBLIC_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host');
  const { pathname } = request.nextUrl;

  if (isLocalhostHost(host)) {
    return NextResponse.next();
  }

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // --- api.tidyflowapp.com: API + token-based public pages only ---
  if (hostMatchesApi(host)) {
    if (isApiPath(pathname) || isApiPublicPage(pathname)) {
      return NextResponse.next();
    }

    if (pathname === '/') {
      return NextResponse.json(
        {
          success: true,
          service: 'TidyFlow API',
          docs: `${getApiOrigin()}/api/health`,
          publicPricing: `${getApiOrigin()}/api/public/plans`,
        },
        { status: 200 }
      );
    }

    if (isAdminUiPath(pathname)) {
      const appLogin = new URL('/login', getAppOrigin());
      return NextResponse.redirect(appLogin);
    }

    return NextResponse.json(
      { success: false, message: 'Not found. Use the app subdomain for admin access.' },
      { status: 404 }
    );
  }

  // --- app.tidyflowapp.com: admin UI only ---
  if (hostMatchesApp(host)) {
    if (isAdminUiPath(pathname)) {
      if (pathname === '/') {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      return NextResponse.next();
    }

    if (isApiPath(pathname)) {
      const target = new URL(`${pathname}${request.nextUrl.search}`, getApiOrigin());
      return NextResponse.redirect(target, 307);
    }

    if (isApiPublicPage(pathname)) {
      const target = new URL(`${pathname}${request.nextUrl.search}`, getApiOrigin());
      return NextResponse.redirect(target, 307);
    }

    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
