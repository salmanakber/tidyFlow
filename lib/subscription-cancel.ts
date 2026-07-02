import prisma from '@/lib/prisma';
import Stripe from 'stripe';
import { createStripeInstance, cancelSubscriptionAtPeriodEnd } from '@/lib/stripe';
import { getStripeSecretKey } from '@/lib/stripe-settings';

export interface CancelSubscriptionResult {
  alreadyCanceled: boolean;
  subscriptionId: string;
  accessUntil: string | null;
  cancelEffectiveAt: string | null;
}

async function releaseSubscriptionSchedule(stripe: Stripe, subscription: Stripe.Subscription) {
  if (!subscription.schedule) return;
  const scheduleId =
    typeof subscription.schedule === 'string' ? subscription.schedule : subscription.schedule.id;
  try {
    await stripe.subscriptionSchedules.release(scheduleId);
  } catch (err) {
    console.warn('Could not release subscription schedule before cancel:', err);
  }
}

export async function cancelCompanyStripeSubscription(
  companyId: number
): Promise<CancelSubscriptionResult> {
  const billing = await prisma.billingRecord.findFirst({
    where: {
      companyId,
      subscriptionId: { not: null },
      status: { in: ['active', 'trialing'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!billing?.subscriptionId) {
    throw new Error('No active Stripe subscription found for this company.');
  }

  const secretKey = await getStripeSecretKey();
  if (!secretKey) {
    throw new Error('Stripe is not configured. Contact support.');
  }

  const stripe = createStripeInstance(secretKey);
  const subscription = await stripe.subscriptions.retrieve(billing.subscriptionId);

  const accessUntil = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : billing.nextBillingDate;

  if (subscription.cancel_at_period_end) {
    return {
      alreadyCanceled: true,
      subscriptionId: billing.subscriptionId,
      accessUntil: accessUntil?.toISOString() ?? null,
      cancelEffectiveAt: accessUntil?.toISOString() ?? null,
    };
  }

  if (subscription.status === 'canceled') {
    throw new Error('This subscription has already ended.');
  }

  await releaseSubscriptionSchedule(stripe, subscription);

  await prisma.company.update({
    where: { id: companyId },
    data: {
      pendingPlanTier: null,
      pendingPlanEffectiveAt: null,
    },
  });

  const updated = await cancelSubscriptionAtPeriodEnd(billing.subscriptionId, stripe);

  const periodEnd = updated.current_period_end
    ? new Date(updated.current_period_end * 1000)
    : accessUntil;

  await prisma.billingRecord.update({
    where: { id: billing.id },
    data: {
      nextBillingDate: periodEnd ?? billing.nextBillingDate,
    },
  });

  return {
    alreadyCanceled: false,
    subscriptionId: billing.subscriptionId,
    accessUntil: periodEnd?.toISOString() ?? null,
    cancelEffectiveAt: periodEnd?.toISOString() ?? null,
  };
}
