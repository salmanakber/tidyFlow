import { NextResponse } from 'next/server';
import { getAllSubscriptionPlansForAdmin } from '@/lib/subscription';

export async function GET() {
  const plans = await getAllSubscriptionPlansForAdmin();

  return NextResponse.json({
    success: true,
    data: plans.map((plan) => ({
      tier: plan.tier,
      label: plan.label,
      monthlyPrice: plan.monthlyPrice,
      maxProperties: plan.maxProperties,
      maxCleaners: plan.maxCleaners,
      maxManagers: plan.maxManagers,
      aiRequestsPerMonth: plan.aiRequestsPerMonth,
      invoicesEnabled: plan.invoicesEnabled,
      aiPhotoAnalysis: plan.aiPhotoAnalysis,
      aiInsights: plan.aiInsights,
    })),
  });
}
