import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { createStripeInstance } from '@/lib/stripe';
import { getStripeSecretKey } from '@/lib/stripe-settings';
import { getAppOrigin } from '@/lib/domains';

/**
 * Stripe Customer Portal — manage/upgrade/cancel subscription in the browser (iOS Guideline 3.1.1).
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (
    auth.tokenUser.role !== UserRole.OWNER &&
    auth.tokenUser.role !== UserRole.COMPANY_ADMIN &&
    auth.tokenUser.role !== UserRole.DEVELOPER &&
    auth.tokenUser.role !== UserRole.SUPER_ADMIN
  ) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const secretKey = await getStripeSecretKey();
  if (!secretKey) {
    return NextResponse.json(
      { success: false, message: 'Stripe is not configured. Contact support.' },
      { status: 500 }
    );
  }

  const billing = await prisma.billingRecord.findFirst({
    where: { companyId, stripeCustomerId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { stripeCustomerId: true },
  });

  if (!billing?.stripeCustomerId) {
    return NextResponse.json(
      {
        success: false,
        message: 'No billing account found. Start a subscription first.',
        code: 'NO_CUSTOMER',
      },
      { status: 400 }
    );
  }

  const stripe = createStripeInstance(secretKey);
  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: `${getAppOrigin()}/subscribe/success`,
  });

  return NextResponse.json({
    success: true,
    data: { url: session.url },
  });
}
