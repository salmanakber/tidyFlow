import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { getCompanyPlan, getMonthlyUsagePeriodStart } from '@/lib/subscription';
import prisma from '@/lib/prisma';

/** Current company subscription plan + limits (mobile sidebar, billing) */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const plan = await getCompanyPlan(companyId);
  if (!plan) return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });

  const periodStart = await getMonthlyUsagePeriodStart(companyId);

  const aiUsedThisMonth = await prisma.aIUsageLog.count({
    where: { companyId, createdAt: { gte: periodStart } },
  });

  return NextResponse.json({
    success: true,
    data: {
      planTier: plan.company.planTier,
      label: plan.limits.label,
      subscriptionStatus: plan.company.subscriptionStatus,
      limits: plan.limits,
      aiUsedThisMonth,
      aiRemaining: Math.max(0, plan.limits.aiRequestsPerMonth - aiUsedThisMonth),
    },
  });
}
