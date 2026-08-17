import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { getPlanLimits } from '@/lib/subscription';
import { changeCompanyPlanTier } from '@/lib/plan-change';

/** Owner changes subscription tier — upgrades immediately; downgrades at period end. */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!['OWNER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  try {
    const { planTier } = await request.json();
    const tier = String(planTier || '').toUpperCase();
    if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tier)) {
      return NextResponse.json({ success: false, message: 'Invalid plan tier' }, { status: 400 });
    }

    const limits = await getPlanLimits(tier);
    const propertyCount = await prisma.property.count({ where: { companyId, isActive: true } });

    if (propertyCount > limits.maxProperties) {
      return NextResponse.json(
        {
          success: false,
          message: `You have ${propertyCount} active properties but ${limits.label} allows ${limits.maxProperties}. Remove or deactivate properties before downgrading.`,
        },
        { status: 400 }
      );
    }

    const cleanerCount = await prisma.user.count({
      where: { companyId, role: 'CLEANER', isActive: true },
    });
    if (cleanerCount > limits.maxCleaners) {
      return NextResponse.json(
        {
          success: false,
          message: `You have ${cleanerCount} cleaners but ${limits.label} allows ${limits.maxCleaners}.`,
        },
        { status: 400 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { planTier: true, isTrialActive: true },
    });
    if (!company) {
      return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    const currentTier = (company.planTier || 'STANDARD').toUpperCase();
    const [currentLimits, newLimits] = await Promise.all([
      getPlanLimits(currentTier),
      getPlanLimits(tier),
    ]);
    const isUpgrade = newLimits.monthlyPrice > currentLimits.monthlyPrice;

    const result = await changeCompanyPlanTier(companyId, tier as 'STARTUP' | 'STANDARD' | 'PREMIUM', {
      isTrialActive: company.isTrialActive,
    });

    const formatDate = (d: Date) =>
      d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    let message: string;
    if (result.trialEnded) {
      message = `You're now on ${limits.label}. Your free trial has ended and billing has started for your new plan.`;
    } else if (result.timing === 'period_end' && result.effectiveAt) {
      message = `Switch to ${limits.label} scheduled for ${formatDate(result.effectiveAt)}. You keep ${currentLimits.label} until then. The new price applies on your next renewal.`;
    } else if (isUpgrade) {
      message = `Upgraded to ${limits.label}. Your new features are active and any price difference has been added to your account.`;
    } else {
      message = `Plan changed to ${limits.label}.`;
    }

    return NextResponse.json({
      success: true,
      message,
      data: {
        planTier: result.timing === 'period_end' ? currentTier : tier,
        pendingPlanTier: result.timing === 'period_end' ? tier : null,
        pendingPlanEffectiveAt: result.effectiveAt?.toISOString() ?? null,
        label: limits.label,
        monthlyPrice: limits.monthlyPrice,
        limits,
        stripeUpdated: result.stripeUpdated,
        timing: result.timing,
        isUpgrade,
        trialEnded: result.trialEnded,
      },
    });
  } catch (error: any) {
    console.error('Change plan error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to change plan' },
      { status: 500 }
    );
  }
}
