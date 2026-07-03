import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  getPlanLimits,
  serializePublicPricingPlan,
  upsertSubscriptionPlanTier,
} from '@/lib/subscription';
import { getTrialDays } from '@/lib/trial-settings';
import { requirePricingWebsiteApiKey } from '@/lib/public-pricing-auth';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { tier: string } };

/** Public single plan by tier (STARTUP | STANDARD | PREMIUM). */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const tier = String(params.tier || '').toUpperCase();
  if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tier)) {
    return NextResponse.json({ success: false, message: 'Invalid plan tier' }, { status: 400 });
  }

  const [plan, trialDays] = await Promise.all([getPlanLimits(tier), getTrialDays()]);

  return NextResponse.json(
    {
      success: true,
      currency: 'USD',
      data: serializePublicPricingPlan(plan, trialDays),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const keyCheck = requirePricingWebsiteApiKey(request);
  if (!keyCheck.allowed) {
    return NextResponse.json({ success: false, message: keyCheck.message }, { status: 403 });
  }

  try {
    const tier = String(params.tier || '').toUpperCase();
    const body = await request.json();
    const updated = await upsertSubscriptionPlanTier(tier, body);
    const trialDays = await getTrialDays();

    return NextResponse.json({
      success: true,
      data: serializePublicPricingPlan(
        {
          tier: updated.tier as 'STARTUP' | 'STANDARD' | 'PREMIUM',
          label: updated.label,
          monthlyPrice: Number(updated.monthlyPrice),
          maxCleaners: updated.maxCleaners,
          maxProperties: updated.maxProperties,
          maxManagers: updated.maxManagers,
          aiRequestsPerMonth: updated.aiRequestsPerMonth,
          aiPhotoAnalysis: updated.aiPhotoAnalysis,
          aiInsights: updated.aiInsights,
          aiAssignment: updated.aiAssignment,
          aiTaskSuggestions: updated.aiTaskSuggestions,
          invoicesEnabled: updated.invoicesEnabled,
          maxInvoicesPerMonth: updated.maxInvoicesPerMonth,
          aiInvoiceAssist: updated.aiInvoiceAssist,
          maxPhotoVerificationsPerMonth: updated.maxPhotoVerificationsPerMonth,
          maxPdfGenerationsPerMonth: updated.maxPdfGenerationsPerMonth,
        },
        trialDays
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const keyCheck = requirePricingWebsiteApiKey(request);
  if (!keyCheck.allowed) {
    return NextResponse.json({ success: false, message: keyCheck.message }, { status: 403 });
  }

  const tier = String(params.tier || '').toUpperCase();
  if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tier)) {
    return NextResponse.json({ success: false, message: 'Invalid plan tier' }, { status: 400 });
  }

  const existing = await prisma.subscriptionPlanLimit.findUnique({ where: { tier } });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Plan not found' }, { status: 404 });
  }

  await prisma.subscriptionPlanLimit.delete({ where: { tier } });

  return NextResponse.json({ success: true, message: `${tier} plan removed` });
}
