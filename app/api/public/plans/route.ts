import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  getAllSubscriptionPlansForAdmin,
  serializePublicPricingPlan,
  upsertSubscriptionPlanTier,
} from '@/lib/subscription';
import { getTrialDays } from '@/lib/trial-settings';
import { requirePricingWebsiteApiKey } from '@/lib/public-pricing-auth';

export const dynamic = 'force-dynamic';

/** Public pricing list for marketing website — no login required. */
export async function GET() {
  const [plans, trialDays] = await Promise.all([
    getAllSubscriptionPlansForAdmin(),
    getTrialDays(),
  ]);

  return NextResponse.json(
    {
      success: true,
      currency: 'USD',
      trialDays,
      data: plans.map((plan) => serializePublicPricingPlan(plan, trialDays)),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

/** Create or replace a plan tier (website CMS sync). Optional API key when PRICING_WEBSITE_API_KEY is set. */
export async function POST(request: NextRequest) {
  const keyCheck = requirePricingWebsiteApiKey(request);
  if (!keyCheck.allowed) {
    return NextResponse.json({ success: false, message: keyCheck.message }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { tier, ...fields } = body;
    if (!tier) {
      return NextResponse.json({ success: false, message: 'tier is required' }, { status: 400 });
    }

    const updated = await upsertSubscriptionPlanTier(String(tier), fields);
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
