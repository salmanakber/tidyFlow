import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { getPlanUsageSnapshot, checkPlanLimit } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Please sign in to continue.' }, { status: 401 });

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const snapshot = await getPlanUsageSnapshot(companyId);
  if (!snapshot) return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      ...snapshot,
      canAddCleaner: (await checkPlanLimit(companyId, 'cleaners')).allowed,
      canAddProperty: (await checkPlanLimit(companyId, 'properties')).allowed,
      canAddManager: (await checkPlanLimit(companyId, 'managers')).allowed,
      canCreateInvoice: (await checkPlanLimit(companyId, 'invoice')).allowed,
    },
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
