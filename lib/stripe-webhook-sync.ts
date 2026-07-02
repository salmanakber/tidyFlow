import type Stripe from 'stripe';
import prisma from '@/lib/prisma';
import {
  cancelTrialReminderJobs,
  enqueueBillingNotification,
  schedulePendingPlanSwitchReminders,
  scheduleTrialEndingReminders,
} from '@/lib/automation-queue';

export function resolveStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null;
  if (typeof customer === 'string') return customer;
  if ('deleted' in customer && customer.deleted) return null;
  return customer.id;
}

export async function findBillingRecordForStripeEvent(input: {
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  if (input.subscriptionId) {
    const bySub = await prisma.billingRecord.findFirst({
      where: { subscriptionId: input.subscriptionId },
      orderBy: { createdAt: 'desc' },
    });
    if (bySub) return bySub;
  }

  if (input.customerId) {
    return prisma.billingRecord.findFirst({
      where: { stripeCustomerId: input.customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  return null;
}

function mapBillingStatus(status: Stripe.Subscription.Status, cancelAtPeriodEnd: boolean) {
  if (status === 'trialing') return 'trialing';
  if (status === 'active') return cancelAtPeriodEnd ? 'canceling' : 'active';
  if (status === 'past_due' || status === 'unpaid') return status;
  if (status === 'canceled') return 'canceled';
  return 'inactive';
}

function mapCompanySubscriptionStatus(
  status: Stripe.Subscription.Status,
  cancelAtPeriodEnd: boolean,
  trialEnd: Date | null
) {
  const now = new Date();

  if (status === 'trialing') {
    return {
      subscriptionStatus: 'trialing',
      isTrialActive: !!(trialEnd && trialEnd > now),
    };
  }

  if (status === 'active') {
    return {
      subscriptionStatus: cancelAtPeriodEnd ? 'canceling' : 'active',
      isTrialActive: false,
    };
  }

  if (status === 'past_due' || status === 'unpaid') {
    return { subscriptionStatus: status, isTrialActive: false };
  }

  if (status === 'canceled' || status === 'incomplete_expired') {
    return { subscriptionStatus: 'canceled', isTrialActive: false };
  }

  return { subscriptionStatus: 'inactive', isTrialActive: false };
}

export async function syncStripeSubscriptionToDatabase(subscription: Stripe.Subscription) {
  const customerId = resolveStripeCustomerId(subscription.customer);
  const subscriptionId = subscription.id;
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  const billingStatus = mapBillingStatus(subscription.status, subscription.cancel_at_period_end);

  const billingRecord = await findBillingRecordForStripeEvent({ customerId, subscriptionId });
  if (!billingRecord) {
    console.error(`No billing record for subscription ${subscriptionId} / customer ${customerId}`);
    return null;
  }

  const companyPatch = mapCompanySubscriptionStatus(
    subscription.status,
    subscription.cancel_at_period_end,
    trialEnd
  );

  await prisma.billingRecord.update({
    where: { id: billingRecord.id },
    data: {
      subscriptionId,
      stripeCustomerId: customerId ?? billingRecord.stripeCustomerId,
      status: billingStatus,
      trialEndsAt: trialEnd,
      isTrialPeriod: subscription.status === 'trialing',
      nextBillingDate: currentPeriodEnd,
    },
  });

  await prisma.company.update({
    where: { id: billingRecord.companyId },
    data: {
      ...companyPatch,
      trialEndsAt: trialEnd,
    },
  });

  return {
    billingRecord,
    companyId: billingRecord.companyId,
    trialEnd,
    currentPeriodEnd,
    subscriptionId,
    status: subscription.status,
  };
}

export async function notifyBillingOwners(
  companyId: number,
  title: string,
  message: string,
  metadata?: Record<string, unknown>,
  options?: { notificationType?: 'billing' | 'trial_ending' | 'plan_switch'; dedupeKey?: string }
) {
  const notificationType = options?.notificationType || 'billing';
  const dedupeKey =
    options?.dedupeKey ||
    `${notificationType}-${companyId}-${title}`.replace(/\s+/g, '-').slice(0, 80);

  const enqueued = await enqueueBillingNotification({
    companyId,
    title,
    message,
    notificationType,
    metadata: { ...metadata, dedupeKey },
    screenRoute: 'Billing',
  });

  if (!enqueued) {
    const { sendBillingNotificationToOwners } = await import('@/lib/automation-worker');
    await sendBillingNotificationToOwners({
      companyId,
      title,
      message,
      notificationType,
      metadata: { ...metadata, dedupeKey },
      screenRoute: 'Billing',
      dedupeKey,
    });
  }
}

export async function afterSubscriptionSynced(input: {
  companyId: number;
  subscriptionId: string;
  status: string;
  trialEnd: Date | null;
}) {
  if (input.status === 'trialing' && input.trialEnd && input.trialEnd.getTime() > Date.now()) {
    await scheduleTrialEndingReminders(input.companyId, input.trialEnd, input.subscriptionId);
    return;
  }

  if (input.trialEnd) {
    await cancelTrialReminderJobs(input.companyId, input.trialEnd);
  }

  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: {
      pendingPlanTier: true,
      pendingPlanEffectiveAt: true,
    },
  });

  if (company?.pendingPlanTier && company.pendingPlanEffectiveAt) {
    const { getPlanLimits } = await import('@/lib/subscription');
    const limits = await getPlanLimits(company.pendingPlanTier);
    await schedulePendingPlanSwitchReminders(
      input.companyId,
      company.pendingPlanTier,
      limits.label,
      company.pendingPlanEffectiveAt
    );
  }
}
