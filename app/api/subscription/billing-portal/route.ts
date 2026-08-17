import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyBillingAccess } from '@/lib/rbac';
import { createStripeInstance, stripeRequestOptions } from '@/lib/stripe';
import { getStripeSecretKey } from '@/lib/stripe-settings';
import { getAppOrigin } from '@/lib/domains';

/**
 * Stripe Customer Portal — manage payment method and subscription.
 */
export async function POST(request: NextRequest) {
  const access = await requireCompanyBillingAccess(request);
  if (access.response) return access.response;
  const companyId = access.companyId;

  const secretKey = await getStripeSecretKey();
  if (!secretKey) {
    return NextResponse.json(
        { success: false, message: 'Payments are temporarily unavailable. Please try again shortly.' },
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
        message: 'Add a plan first to open payment settings.',
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
          message: 'Add a plan first to open payment settings.',
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
          message: 'Add a plan first to open payment settings.',
          code: 'NO_CUSTOMER',
        },
        { status: 400 }
      );
    }
    throw err;
  }

  const session = await stripe.billingPortal.sessions.create(
    {
      customer: customerId!,
      return_url: `${getAppOrigin()}/account/billing`,
    },
    stripeRequestOptions
  );

  return NextResponse.json({
    success: true,
    data: { url: session.url },
  });
}
