import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { cancelCompanyStripeSubscription } from '@/lib/subscription-cancel';

const BILLING_ROLES: UserRole[] = [UserRole.OWNER, UserRole.COMPANY_ADMIN];

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (!BILLING_ROLES.includes(auth.tokenUser.role as UserRole)) {
    return NextResponse.json(
      { success: false, message: 'Only the company owner or admin can cancel billing.' },
      { status: 403 }
    );
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  try {
    const result = await cancelCompanyStripeSubscription(companyId);

    return NextResponse.json({
      success: true,
      message: result.alreadyCanceled
        ? 'Your subscription is already scheduled to cancel at the end of the billing period.'
        : 'Subscription canceled in Stripe. You will keep access until the end of your current billing period.',
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel subscription';
    console.error('Subscription cancel error:', error);
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
