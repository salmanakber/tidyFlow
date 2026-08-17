import { NextRequest, NextResponse } from 'next/server';
import {
  googleAuthUrl,
  isGoogleOAuthConfigured,
  type GoogleOAuthPortal,
} from '@/lib/google-oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(
      new URL('/account/login?error=google_not_configured', request.url)
    );
  }

  const portal = (request.nextUrl.searchParams.get('portal') === 'admin'
    ? 'admin'
    : 'customer') as GoogleOAuthPortal;

  return NextResponse.redirect(
    googleAuthUrl({
      portal,
      next: request.nextUrl.searchParams.get('next') || undefined,
      plan: request.nextUrl.searchParams.get('plan') || undefined,
      useTrial: request.nextUrl.searchParams.get('trial') === '1',
      companyName: request.nextUrl.searchParams.get('companyName') || undefined,
    })
  );
}
