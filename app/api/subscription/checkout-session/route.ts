import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { type PlanTier } from '@/lib/subscription';
import { createCustomer, createStripeInstance } from '@/lib/stripe';
import { getStripeSecretKey, getStripePriceIdForTier } from '@/lib/stripe-settings';
import { getCompanyCurrency } from '@/lib/company-config';
import { getTrialDays } from '@/lib/trial-settings';
import { getAppOrigin } from '@/lib/domains';

/**
 * Creates a Stripe Checkout Session (hosted in Safari / default browser).
 * Used by the iOS app so subscriptions are not purchased via in-app Stripe CardField (Guideline 3.1.1).
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (auth.tokenUser.role !== UserRole.OWNER && auth.tokenUser.role !== UserRole.COMPANY_ADMIN) {
    return NextResponse.json(
      { success: false, message: 'Only the company owner or admin can subscribe.' },
      { status: 403 }
    );
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    companyName,
    email,
    planTier,
    useTrial,
  } = body as {
    companyName?: string;
    email?: string;
    planTier?: string;
    useTrial?: boolean;
  };

  if (!planTier) {
    return NextResponse.json({ success: false, message: 'Plan tier is required.' }, { status: 400 });
  }

  const tier = planTier.toUpperCase() as PlanTier;
  if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tier)) {
    return NextResponse.json({ success: false, message: 'Invalid plan tier.' }, { status: 400 });
  }

  const secretKey = await getStripeSecretKey();
  if (!secretKey) {
    return NextResponse.json(
      { success: false, message: 'Stripe is not configured. Contact support.' },
      { status: 500 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, subscriptionStatus: true },
  });
  if (!company) {
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.tokenUser.userId },
    select: { email: true },
  });

  const checkoutEmail = (email || user?.email || '').trim();
  if (!checkoutEmail || !checkoutEmail.includes('@')) {
    return NextResponse.json({ success: false, message: 'A valid email is required.' }, { status: 400 });
  }

  const currency = await getCompanyCurrency(companyId);
  const priceId = await getStripePriceIdForTier(tier, currency);
  if (!priceId) {
    return NextResponse.json(
      { success: false, message: `Stripe price not configured for ${tier} (${currency}).` },
      { status: 500 }
    );
  }

  const trialDaysSetting = await getTrialDays();
  const trialDays = useTrial ? trialDaysSetting : 0;
  const stripe = createStripeInstance(secretKey);
  const displayName = (companyName || company.name || `Company ${companyId}`).trim();

  let billing = await prisma.billingRecord.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  let customerId = billing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await createCustomer(checkoutEmail, displayName, companyId, stripe);
    customerId = customer.id;
  } else {
    await stripe.customers.update(customerId, {
      email: checkoutEmail,
      name: displayName || undefined,
    });
  }

  if (billing) {
    billing = await prisma.billingRecord.update({
      where: { id: billing.id },
      data: {
        stripeCustomerId: customerId,
        status: billing.subscriptionId ? billing.status : 'pending_checkout',
      },
    });
  } else {
    billing = await prisma.billingRecord.create({
      data: {
        companyId,
        stripeCustomerId: customerId,
        status: 'pending_checkout',
        amountDue: 0,
        billingDate: new Date(),
        propertyCount: (
          await prisma.company.findUnique({
            where: { id: companyId },
            select: { propertyCount: true },
          })
        )?.propertyCount ?? 0,
      },
    });
  }

  if (companyName && companyName.trim()) {
    await prisma.company.update({
      where: { id: companyId },
      data: { name: companyName.trim() },
    });
  }

  const appOrigin = getAppOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: String(companyId),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appOrigin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appOrigin}/subscribe/cancel`,
    allow_promotion_codes: true,
    metadata: {
      companyId: String(companyId),
      planTier: tier,
      source: 'ios_external_checkout',
    },
    subscription_data: {
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      metadata: {
        companyId: String(companyId),
        planTier: tier,
        source: 'ios_external_checkout',
      },
    },
  });

  if (!session.url) {
    return NextResponse.json(
      { success: false, message: 'Could not create checkout session URL.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      url: session.url,
      sessionId: session.id,
      planTier: tier,
      trialDays,
    },
  });
}
