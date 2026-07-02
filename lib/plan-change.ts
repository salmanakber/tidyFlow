import prisma from '@/lib/prisma';
import Stripe from 'stripe';
import { createStripeInstance } from '@/lib/stripe';
import { getPlanLimits, type PlanTier } from '@/lib/subscription';

export type PlanChangeTiming = 'immediate' | 'period_end';

export interface PlanChangeResult {
  timing: PlanChangeTiming;
  effectiveAt: Date | null;
  stripeUpdated: boolean;
  trialEnded: boolean;
}

function tierPrice(limits: { monthlyPrice: number }) {
  return limits.monthlyPrice;
}

export async function applyPendingPlanChanges(companyId: number): Promise<boolean> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      pendingPlanTier: true,
      pendingPlanEffectiveAt: true,
    },
  });

  if (!company?.pendingPlanTier || !company.pendingPlanEffectiveAt) return false;
  if (new Date() < company.pendingPlanEffectiveAt) return false;

  const limits = await getPlanLimits(company.pendingPlanTier);
  await prisma.company.update({
    where: { id: companyId },
    data: {
      planTier: company.pendingPlanTier,
      basePrice: limits.monthlyPrice,
      pendingPlanTier: null,
      pendingPlanEffectiveAt: null,
    },
  });

  return true;
}

async function releaseSubscriptionSchedule(stripe: Stripe, subscription: Stripe.Subscription) {
  if (!subscription.schedule) return;
  const scheduleId =
    typeof subscription.schedule === 'string' ? subscription.schedule : subscription.schedule.id;
  try {
    await stripe.subscriptionSchedules.release(scheduleId);
  } catch (err) {
    console.warn('Could not release subscription schedule:', err);
  }
}

/** Upgrade or trial plan change: new price now; optionally end trial immediately. */
export async function applyImmediateStripePlanChange(
  stripe: Stripe,
  subscriptionId: string,
  newPriceId: string,
  metadata: Record<string, string>,
  options?: { endTrial?: boolean }
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await releaseSubscriptionSchedule(stripe, subscription);

  const primaryItem = subscription.items.data[0];
  if (!primaryItem?.id) {
    throw new Error('Stripe subscription has no billable item');
  }

  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: primaryItem.id, price: newPriceId }],
    proration_behavior: options?.endTrial ? 'none' : 'always_invoice',
    ...(options?.endTrial ? { trial_end: 'now' } : {}),
    metadata,
  });
}

/** Downgrade at period end: customer keeps current Stripe price until renewal. */
export async function scheduleStripePlanDowngrade(
  stripe: Stripe,
  subscriptionId: string,
  newPriceId: string,
  metadata: Record<string, string>
): Promise<Date> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await releaseSubscriptionSchedule(stripe, subscription);

  const primaryItem = subscription.items.data[0];
  if (!primaryItem?.id) {
    throw new Error('Stripe subscription has no billable item');
  }

  const currentPriceId =
    typeof primaryItem.price === 'string' ? primaryItem.price : primaryItem.price.id;
  const periodStart = subscription.current_period_start;
  const periodEnd = subscription.current_period_end;

  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: subscriptionId,
  });

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    metadata,
    phases: [
      {
        items: [{ price: currentPriceId, quantity: 1 }],
        start_date: periodStart,
        end_date: periodEnd,
      },
      {
        items: [{ price: newPriceId, quantity: 1 }],
        start_date: periodEnd,
      },
    ],
  });

  return new Date(periodEnd * 1000);
}

export async function changeCompanyPlanTier(
  companyId: number,
  newTier: PlanTier,
  options?: { isTrialActive?: boolean }
): Promise<PlanChangeResult> {
  await applyPendingPlanChanges(companyId);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      planTier: true,
      isTrialActive: true,
      pendingPlanTier: true,
    },
  });
  if (!company) throw new Error('Company not found');

  const currentTier = (company.planTier || 'STANDARD').toUpperCase() as PlanTier;
  if (currentTier === newTier && !company.pendingPlanTier) {
    return { timing: 'immediate', effectiveAt: null, stripeUpdated: false, trialEnded: false };
  }

  const [currentLimits, newLimits] = await Promise.all([
    getPlanLimits(currentTier),
    getPlanLimits(newTier),
  ]);

  const isUpgrade = tierPrice(newLimits) > tierPrice(currentLimits);
  const isTrial = options?.isTrialActive ?? company.isTrialActive;

  const billing = await prisma.billingRecord.findFirst({
    where: {
      companyId,
      status: { in: ['active', 'trialing'] },
      subscriptionId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  let stripeUpdated = false;
  let effectiveAt: Date | null = null;
  let timing: PlanChangeTiming = 'immediate';
  let trialEnded = false;

  const endTrialInDb = async () => {
    trialEnded = true;
    await prisma.company.update({
      where: { id: companyId },
      data: { isTrialActive: false, trialEndsAt: null },
    });
    if (billing?.id) {
      await prisma.billingRecord.update({
        where: { id: billing.id },
        data: { isTrialPeriod: false, trialEndsAt: null },
      });
    }
  };

  if (billing?.subscriptionId) {
    const { getStripeSecretKey, getStripePriceIdForTier } = await import('@/lib/stripe-settings');
    const { getCompanyCurrency } = await import('@/lib/company-config');
    const secretKey = await getStripeSecretKey();
    const billingCurrency = await getCompanyCurrency(companyId);
    const newPriceId = await getStripePriceIdForTier(newTier, billingCurrency);

    if (!secretKey) throw new Error('Stripe is not configured. Contact support.');
    if (!newPriceId) {
      throw new Error(
        `Stripe price ID not configured for ${newLimits.label} (${billingCurrency}). Add it in Admin → Stripe Billing.`
      );
    }

    const stripe = createStripeInstance(secretKey);
    const metadata = { planTier: newTier, companyId: String(companyId) };

    if (isTrial || isUpgrade) {
      await applyImmediateStripePlanChange(stripe, billing.subscriptionId, newPriceId, metadata, {
        endTrial: isTrial,
      });
      timing = 'immediate';
      stripeUpdated = true;

      if (isTrial) {
        await endTrialInDb();
      }

      await prisma.company.update({
        where: { id: companyId },
        data: {
          planTier: newTier,
          basePrice: newLimits.monthlyPrice,
          pendingPlanTier: null,
          pendingPlanEffectiveAt: null,
          ...(isTrial ? { isTrialActive: false, trialEndsAt: null } : {}),
        },
      });

      await prisma.billingRecord.update({
        where: { id: billing.id },
        data: {
          amountDue: newLimits.monthlyPrice,
          ...(isTrial ? { isTrialPeriod: false, trialEndsAt: null } : {}),
        },
      });
    } else {
      effectiveAt = await scheduleStripePlanDowngrade(
        stripe,
        billing.subscriptionId,
        newPriceId,
        metadata
      );
      timing = 'period_end';
      stripeUpdated = true;

      await prisma.company.update({
        where: { id: companyId },
        data: {
          pendingPlanTier: newTier,
          pendingPlanEffectiveAt: effectiveAt,
        },
      });

      const { schedulePendingPlanSwitchReminders } = await import('@/lib/automation-queue');
      await schedulePendingPlanSwitchReminders(
        companyId,
        newTier,
        newLimits.label,
        effectiveAt
      );
    }
  } else {
    if (isTrial) {
      trialEnded = true;
    }
    await prisma.company.update({
      where: { id: companyId },
      data: {
        planTier: newTier,
        basePrice: newLimits.monthlyPrice,
        pendingPlanTier: null,
        pendingPlanEffectiveAt: null,
        ...(isTrial ? { isTrialActive: false, trialEndsAt: null } : {}),
      },
    });
  }

  return { timing, effectiveAt, stripeUpdated, trialEnded };
}
