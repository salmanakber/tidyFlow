import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { getPlanLimits } from '@/lib/subscription';
import { getCompanyCurrency } from '@/lib/company-config';
import { getTrialDays } from '@/lib/trial-settings';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      planTier: true,
      propertyCount: true,
      subscriptionStatus: true,
      isTrialActive: true,
      trialEndsAt: true,
    },
  });

  if (!company) {
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
  }

  const [limits, currency, trialDays] = await Promise.all([
    getPlanLimits(company.planTier),
    getCompanyCurrency(companyId),
    getTrialDays(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      company: {
        id: company.id,
        name: company.name,
        planTier: company.planTier,
        propertyCount: company.propertyCount,
        subscriptionStatus: company.subscriptionStatus,
        isTrialActive: company.isTrialActive,
        trialEndsAt: company.trialEndsAt?.toISOString() ?? null,
      },
      pricing: {
        currency,
        monthlyPrice: limits.monthlyPrice,
        trialDays,
      },
    },
  });
}
