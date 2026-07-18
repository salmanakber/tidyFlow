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
    select: { id: true, stripeCustomerId: true },
  });

  let customerId = billing?.stripeCustomerId?.trim() || null;
  const looksLikeStripeCustomer = !!customerId && /^cus_[A-Za-z0-9]+$/.test(customerId);

  if (!looksLikeStripeCustomer) {
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

  try {
    const existing = await stripe.customers.retrieve(customerId!);
    if ((existing as { deleted?: boolean }).deleted) {
      return NextResponse.json(
        {
          success: false,
          message: 'No billing account found. Start a subscription first.',
          code: 'NO_CUSTOMER',
        },
        { status: 400 }
      );
    }
  } catch (err: any) {
    if (err?.code === 'resource_missing' || err?.statusCode === 404) {
      // Clear bad ID so the next checkout creates a fresh Stripe customer
      if (billing?.id) {
        await prisma.billingRecord.update({
          where: { id: billing.id },
          data: { stripeCustomerId: null },
        });
      }
      return NextResponse.json(
        {
          success: false,
          message: 'No billing account found. Start a subscription first.',
          code: 'NO_CUSTOMER',
        },
        { status: 400 }
      );
    }
    throw err;
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId!,
    return_url: `${getAppOrigin()}/subscribe/success`,
  });

  return NextResponse.json({
    success: true,
    data: { url: session.url },
  });
}
