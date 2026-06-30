import { NextRequest, NextResponse } from 'next/server';
import { getAllSubscriptionPlansForAdmin } from '@/lib/subscription';

/** Public list of subscription tiers with limits and monthly price (for billing / signup). */
export async function GET(_request: NextRequest) {
  try {
    const plans = await getAllSubscriptionPlansForAdmin();
    return NextResponse.json({
      success: true,
      data: plans.map((p) => ({
        tier: p.tier,
        label: p.label,
        monthlyPrice: p.monthlyPrice,
        maxProperties: p.maxProperties,
        maxCleaners: p.maxCleaners,
        maxManagers: p.maxManagers,
        aiRequestsPerMonth: p.aiRequestsPerMonth,
        invoicesEnabled: p.invoicesEnabled,
        aiPhotoAnalysis: p.aiPhotoAnalysis,
        aiInsights: p.aiInsights,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load plans' },
      { status: 500 }
    );
  }
}
