import { NextResponse } from 'next/server';
import { getAllSubscriptionPlansForAdmin, serializePublicPricingPlan } from '@/lib/subscription';
import { getTrialDays } from '@/lib/trial-settings';

/** Authenticated/mobile plan list — prefer GET /api/public/plans for marketing website. */
export async function GET() {
  const [plans, trialDays] = await Promise.all([
    getAllSubscriptionPlansForAdmin(),
    getTrialDays(),
  ]);

  return NextResponse.json({
    success: true,
    currency: 'USD',
    trialDays,
    data: plans.map((plan) => serializePublicPricingPlan(plan, trialDays)),
  });
}
