import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyId, isManagerPlusRole } from '@/lib/rbac';
import { buildQuickBooksAuthUrl, isQuickBooksConfigured } from '@/lib/quickbooks';
import { requireQuickBooksFeature } from '@/lib/subscription';
import prisma from '@/lib/prisma';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (!isManagerPlusRole(auth.tokenUser.role as UserRole)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  if (!isQuickBooksConfigured()) {
    return NextResponse.json(
      { success: false, message: 'QuickBooks is not configured on the server' },
      { status: 503 }
    );
  }

  let companyId = resolveCompanyId(request, auth.tokenUser);
  if (!companyId && auth.tokenUser.companyId) companyId = auth.tokenUser.companyId;
  if (!companyId) {
    const user = await prisma.user.findUnique({
      where: { id: auth.tokenUser.userId },
      select: { companyId: true },
    });
    companyId = user?.companyId ?? null;
  }
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const planFeature = await requireQuickBooksFeature(companyId);
  if (!planFeature.allowed) {
    return NextResponse.json({ success: false, message: planFeature.message }, { status: 403 });
  }

  const mobileRedirect =
    request.nextUrl.searchParams.get('redirect') || 'tidyflow://integrations/quickbooks';

  const authUrl = buildQuickBooksAuthUrl(mobileRedirect, companyId, auth.tokenUser.userId);
  return NextResponse.json({ success: true, data: { authUrl } });
}
