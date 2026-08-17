import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from '@/lib/rbac';
import { requireSupplyForecast, logAIUsage } from '@/lib/subscription';
import { getCompanySupplyForecast } from '@/lib/supply-forecast';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const gate = await requireSupplyForecast(companyId);
  if (!gate.allowed) {
    return NextResponse.json({ success: false, message: gate.message, upgradeRequired: true }, { status: 403 });
  }

  const forecast = await getCompanySupplyForecast(companyId);
  await logAIUsage(companyId, 'supply_forecast');

  return NextResponse.json({ success: true, data: forecast });
}
