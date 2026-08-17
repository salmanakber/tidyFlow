import prisma from '@/lib/prisma';
import Stripe from 'stripe';
import {
  cancelSubscription,
  cancelSubscriptionAtPeriodEnd,
  createStripeInstance,
} from '@/lib/stripe';
import { getStripeSecretKey } from '@/lib/stripe-settings';
import { cancelTrialReminderJobs } from '@/lib/automation-queue';
import { notifyBillingOwners } from '@/lib/stripe-webhook-sync';

export interface CancelSubscriptionResult {
  alreadyCanceled: boolean;
  subscriptionId: string;
  accessUntil: string | null;
  cancelEffectiveAt: string | null;
  immediateCancel?: boolean;
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
      status: { in: ['active', 'trialing', 'canceling'] },
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

  if (subscription.status === 'trialing') {
    await cancelSubscription(billing.subscriptionId, stripe);

    if (billing.trialEndsAt) {
      await cancelTrialReminderJobs(companyId, billing.trialEndsAt);
    }

    await prisma.billingRecord.update({
      where: { id: billing.id },
      data: {
        status: 'canceled',
        isTrialPeriod: false,
        trialEndsAt: null,
        nextBillingDate: null,
      },
    });

    await prisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: 'canceled',
        isTrialActive: false,
        trialEndsAt: null,
      },
    });

    await notifyBillingOwners(
      companyId,
      'Trial canceled',
      'Your free trial was canceled. You will not be charged. Subscribe again anytime from Billing.',
      { subscriptionId: billing.subscriptionId },
      { dedupeKey: `trial-canceled-${companyId}-${billing.subscriptionId}` }
    );

    return {
      alreadyCanceled: false,
      subscriptionId: billing.subscriptionId,
      accessUntil: new Date().toISOString(),
      cancelEffectiveAt: new Date().toISOString(),
      immediateCancel: true,
    };
  }

  const updated = await cancelSubscriptionAtPeriodEnd(billing.subscriptionId, stripe);

  const periodEnd = updated.current_period_end
    ? new Date(updated.current_period_end * 1000)
    : accessUntil;

  await prisma.billingRecord.update({
    where: { id: billing.id },
    data: {
      status: 'canceling',
      nextBillingDate: periodEnd ?? billing.nextBillingDate,
    },
  });

  await prisma.company.update({
    where: { id: companyId },
    data: {
      subscriptionStatus: 'canceling',
      isTrialActive: false,
    },
  });

  await notifyBillingOwners(
    companyId,
    'Cancellation scheduled',
    periodEnd
      ? `Your subscription will cancel on ${periodEnd.toLocaleDateString('en-GB')}. Stripe billing stops after that date.`
      : 'Your subscription is scheduled to cancel at the end of the current billing period.',
    { subscriptionId: billing.subscriptionId },
    { dedupeKey: `cancel-scheduled-${companyId}-${billing.subscriptionId}` }
  );

  return {
    alreadyCanceled: false,
    subscriptionId: billing.subscriptionId,
    accessUntil: periodEnd?.toISOString() ?? null,
    cancelEffectiveAt: periodEnd?.toISOString() ?? null,
    immediateCancel: false,
  };
}
