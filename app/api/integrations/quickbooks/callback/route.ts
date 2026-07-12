import { NextRequest, NextResponse } from 'next/server';
import { connectQuickBooksFromCode, parseQuickBooksOAuthState } from '@/lib/quickbooks';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const realmId = searchParams.get('realmId');
  const error = searchParams.get('error');

  let mobileRedirect = 'tidyflow://integrations/quickbooks';

  if (error) {
    const url = `${mobileRedirect}?error=${encodeURIComponent(error)}`;
    return NextResponse.redirect(url);
  }

  if (!code || !state || !realmId) {
    return NextResponse.redirect(`${mobileRedirect}?error=missing_params`);
  }

  try {
    const parsed = parseQuickBooksOAuthState(state);
    mobileRedirect = parsed.mobileRedirect || mobileRedirect;

    await connectQuickBooksFromCode({
      code,
      realmId,
      companyId: parsed.companyId,
      userId: parsed.userId,
    });

    return NextResponse.redirect(`${mobileRedirect}?connected=1`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'connection_failed';
    return NextResponse.redirect(`${mobileRedirect}?error=${encodeURIComponent(msg)}`);
  }
}
