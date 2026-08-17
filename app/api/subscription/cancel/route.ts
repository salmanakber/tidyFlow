import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyBillingAccess } from '@/lib/rbac';
import { cancelCompanyStripeSubscription } from '@/lib/subscription-cancel';

export async function POST(request: NextRequest) {
  const access = await requireCompanyBillingAccess(request);
  if (access.response) return access.response;

  try {
    const result = await cancelCompanyStripeSubscription(access.companyId);

    const message = result.alreadyCanceled
      ? 'Your subscription is already scheduled to cancel at the end of the billing period.'
      : result.immediateCancel
        ? 'Your trial was canceled. You will not be charged.'
        : 'Your subscription will cancel at the end of the current billing period. You keep access until then.';

    return NextResponse.json({
      success: true,
      message,
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel subscription';
    console.error('Subscription cancel error:', error);
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
