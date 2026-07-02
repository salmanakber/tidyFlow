import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { getPlanLimits, type PlanTier } from '@/lib/subscription';
import { createCustomer, createStripeInstance } from '@/lib/stripe';
import { getStripeSecretKey, getStripePriceIdForTier } from '@/lib/stripe-settings';
import { getCompanyCurrency } from '@/lib/company-config';
import { getTrialDays } from '@/lib/trial-settings';
import { scheduleTrialEndingReminders } from '@/lib/automation-queue';
import { notifyBillingOwners } from '@/lib/stripe-webhook-sync';
import { formatBillingDate } from '@/lib/billing-notification-jobs';

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

  const body = await request.json();
  const {
    companyName,
    email,
    paymentMethodId,
    planTier,
    useTrial,
  } = body as {
    companyName?: string;
    email?: string;
    paymentMethodId?: string;
    planTier?: string;
    useTrial?: boolean;
  };

  if (!paymentMethodId || !email || !planTier) {
    return NextResponse.json(
      { success: false, message: 'Payment method, email, and plan tier are required.' },
      { status: 400 }
    );
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

  const currency = await getCompanyCurrency(companyId);
  const priceId = await getStripePriceIdForTier(tier, currency);
  if (!priceId) {
    return NextResponse.json(
      { success: false, message: `Stripe price not configured for ${tier} (${currency}).` },
      { status: 500 }
    );
  }

  const [limits, trialDaysSetting] = await Promise.all([
    getPlanLimits(tier),
    getTrialDays(),
  ]);
  const trialDays = useTrial ? trialDaysSetting : 0;

  const stripe = createStripeInstance(secretKey);

  let billing = await prisma.billingRecord.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  let customerId = billing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await createCustomer(
      email,
      companyName || `Company ${companyId}`,
      companyId,
      stripe
    );
    customerId = customer.id;
  } else {
    await stripe.customers.update(customerId, {
      email,
      name: companyName || undefined,
    });
  }

  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId, quantity: 1 }],
    ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
    metadata: {
      companyId: String(companyId),
      planTier: tier,
    },
  });

  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  const isTrialing = subscription.status === 'trialing';

  if (billing) {
    billing = await prisma.billingRecord.update({
      where: { id: billing.id },
      data: {
        stripeCustomerId: customerId,
        subscriptionId: subscription.id,
        status: isTrialing ? 'trialing' : 'active',
        amountDue: limits.monthlyPrice,
        billingDate: new Date(),
        nextBillingDate: periodEnd,
        trialEndsAt: trialEnd,
        isTrialPeriod: isTrialing,
        propertyCount: (
          await prisma.company.findUnique({
            where: { id: companyId },
            select: { propertyCount: true },
          })
        )?.propertyCount ?? 0,
      },
    });
  } else {
    billing = await prisma.billingRecord.create({
      data: {
        companyId,
        stripeCustomerId: customerId,
        subscriptionId: subscription.id,
        status: isTrialing ? 'trialing' : 'active',
        amountDue: limits.monthlyPrice,
        billingDate: new Date(),
        nextBillingDate: periodEnd,
        trialEndsAt: trialEnd,
        isTrialPeriod: isTrialing,
        propertyCount: (
          await prisma.company.findUnique({
            where: { id: companyId },
            select: { propertyCount: true },
          })
        )?.propertyCount ?? 0,
      },
    });
  }

  if (companyName) {
    await prisma.company.update({
      where: { id: companyId },
      data: { name: companyName },
    });
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      planTier: tier,
      basePrice: limits.monthlyPrice,
      subscriptionStatus: isTrialing ? 'trialing' : 'active',
      isTrialActive: isTrialing,
      trialEndsAt: trialEnd,
      pendingPlanTier: null,
      pendingPlanEffectiveAt: null,
    },
  });

  if (isTrialing && trialEnd) {
    await scheduleTrialEndingReminders(companyId, trialEnd, subscription.id);
    await notifyBillingOwners(
      companyId,
      'Free trial started',
      `Your ${trialDays}-day free trial runs until ${formatBillingDate(trialEnd)}. Your plan will upgrade to paid billing when the trial ends.`,
      { subscriptionId: subscription.id, trialDays, trialEndsAt: trialEnd.toISOString() },
      { notificationType: 'trial_ending', dedupeKey: `trial-started-${companyId}-${subscription.id}` }
    );
  } else {
    await notifyBillingOwners(
      companyId,
      'Subscription activated',
      'Your TidyFlow subscription is now active.',
      { subscriptionId: subscription.id },
      { dedupeKey: `sub-create-${companyId}-${subscription.id}` }
    );
  }

  return NextResponse.json({
    success: true,
    message: isTrialing
      ? `Your ${trialDays}-day free trial has started.`
      : 'Subscription activated successfully.',
    data: {
      subscriptionId: subscription.id,
      status: subscription.status,
      trialDays: isTrialing ? trialDays : 0,
      trialEndsAt: trialEnd?.toISOString() ?? null,
    },
  });
}
