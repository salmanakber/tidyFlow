import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { getPlanUsageSnapshot, checkPlanLimit } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
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
