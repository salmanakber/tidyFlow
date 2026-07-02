import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createStripeInstance } from '@/lib/stripe';
import { getStripeWebhookSecrets, verifyStripeWebhookEvent } from '@/lib/stripe-webhook-verify';
import { getStripeSecretKey } from '@/lib/stripe-settings';
import prisma from '@/lib/prisma';
import {
  afterSubscriptionSynced,
  findBillingRecordForStripeEvent,
  notifyBillingOwners,
  resolveStripeCustomerId,
  syncStripeSubscriptionToDatabase,
} from '@/lib/stripe-webhook-sync';
import { formatBillingDate } from '@/lib/billing-notification-jobs';

/** Stripe requires the exact raw request bytes — never parse as JSON first. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readRawWebhookBody(request: NextRequest): Promise<Buffer> {
  const arrayBuffer = await request.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function getStripeClient() {
  const secretKey = await getStripeSecretKey();
  if (!secretKey) return null;
  return createStripeInstance(secretKey);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await readRawWebhookBody(request);
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    if (!rawBody.length) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const webhookSecrets = await getStripeWebhookSecrets();
    if (!webhookSecrets.length) {
      return NextResponse.json(
        {
          error:
            'Stripe webhook secret not configured. Add whsec_… in Admin Settings or STRIPE_WEBHOOK_SECRET in .env',
        },
        { status: 500 }
      );
    }

    let event: Stripe.Event;
    try {
      event = verifyStripeWebhookEvent(rawBody, signature, webhookSecrets);
    } catch (verifyError) {
      console.error('Stripe webhook signature verification failed:', verifyError);
      console.error(
        `[Stripe Webhook] secrets tried: ${webhookSecrets.length}, body bytes: ${rawBody.length}, signature present: ${!!signature}`
      );
      return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription, event.type);
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleTrialEnding(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCancellation(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSuccess(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailure(invoice);
        break;
      }

      case 'invoice.payment_action_required':
        break;

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription, eventType: string) {
  const synced = await syncStripeSubscriptionToDatabase(subscription);
  if (!synced) return;

  await afterSubscriptionSynced({
    companyId: synced.companyId,
    subscriptionId: synced.subscriptionId,
    status: synced.status,
    trialEnd: synced.trialEnd,
  });

  if (eventType === 'customer.subscription.created') {
    if (subscription.status === 'trialing' && synced.trialEnd) {
      await notifyBillingOwners(
        synced.companyId,
        'Free trial started',
        `Your TidyFlow free trial is active until ${formatBillingDate(synced.trialEnd)}. Your plan will upgrade to paid billing when the trial ends.`,
        { subscriptionId: subscription.id, trialEndsAt: synced.trialEnd.toISOString() },
        { dedupeKey: `sub-created-trial-${synced.companyId}-${subscription.id}` }
      );
    } else {
      await notifyBillingOwners(
        synced.companyId,
        'Subscription activated',
        'Your TidyFlow subscription is now active. Manage billing anytime in the app.',
        { subscriptionId: subscription.id },
        { dedupeKey: `sub-created-${synced.companyId}-${subscription.id}` }
      );
    }
    return;
  }

  if (subscription.cancel_at_period_end) {
    const accessUntil = synced.currentPeriodEnd || synced.trialEnd;
    await notifyBillingOwners(
      synced.companyId,
      'Cancellation scheduled',
      accessUntil
        ? `Your subscription is scheduled to cancel. Access continues until ${formatBillingDate(accessUntil)}.`
        : 'Your subscription is scheduled to cancel at the end of the current billing period.',
      { subscriptionId: subscription.id },
      { dedupeKey: `sub-cancel-scheduled-${synced.companyId}-${subscription.id}` }
    );
  }
}

async function handleTrialEnding(subscription: Stripe.Subscription) {
  const synced = await syncStripeSubscriptionToDatabase(subscription);
  if (!synced?.trialEnd) return;

  await afterSubscriptionSynced({
    companyId: synced.companyId,
    subscriptionId: synced.subscriptionId,
    status: synced.status,
    trialEnd: synced.trialEnd,
  });

  const daysUntilEnd = Math.max(
    0,
    Math.ceil((synced.trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );

  await notifyBillingOwners(
    synced.companyId,
    'Trial ending soon — plan will upgrade',
    `Your free trial ends ${daysUntilEnd <= 1 ? 'tomorrow' : `in ${daysUntilEnd} days`} (${formatBillingDate(synced.trialEnd)}). Your plan will upgrade to paid billing automatically unless you cancel in Billing.`,
    {
      trialEndsAt: synced.trialEnd.toISOString(),
      daysUntilEnd,
      subscriptionId: subscription.id,
      source: 'stripe_trial_will_end',
    },
    { notificationType: 'trial_ending', dedupeKey: `trial-will-end-${synced.companyId}-${synced.trialEnd.toISOString().slice(0, 10)}` }
  );
}

async function handleSubscriptionCancellation(subscription: Stripe.Subscription) {
  const customerId = resolveStripeCustomerId(subscription.customer);
  const billingRecord = await findBillingRecordForStripeEvent({
    customerId,
    subscriptionId: subscription.id,
  });

  if (!billingRecord) return;

  const companyId = billingRecord.companyId;
  const trialEnd = billingRecord.trialEndsAt;

  await prisma.billingRecord.update({
    where: { id: billingRecord.id },
    data: { status: 'canceled' },
  });

  await prisma.company.update({
    where: { id: companyId },
    data: {
      subscriptionStatus: 'canceled',
      isTrialActive: false,
      trialEndsAt: null,
      pendingPlanTier: null,
      pendingPlanEffectiveAt: null,
    },
  });

  if (trialEnd) {
    const { cancelTrialReminderJobs } = await import('@/lib/automation-queue');
    await cancelTrialReminderJobs(companyId, trialEnd);
  }

  await notifyBillingOwners(
    companyId,
    'Subscription ended',
    'Your TidyFlow subscription has ended. Renew in Billing to restore full access.',
    { subscriptionId: subscription.id },
    { dedupeKey: `sub-deleted-${companyId}-${subscription.id}` }
  );
}

async function handlePaymentSuccess(invoice: Stripe.Invoice) {
  const customerId = resolveStripeCustomerId(invoice.customer);
  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? null;

  const billingRecord = await findBillingRecordForStripeEvent({ customerId, subscriptionId });
  if (!billingRecord) {
    console.error(`No billing record found for customer ${customerId}`);
    return;
  }

  const companyId = billingRecord.companyId;
  const amountPaid = invoice.amount_paid / 100;
  const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000) : null;

  const stripe = await getStripeClient();
  let trialJustEnded = false;

  if (stripe && subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.status === 'active' && subscription.trial_end) {
        const trialEndDate = new Date(subscription.trial_end * 1000);
        trialJustEnded = trialEndDate <= new Date();
      }
      const synced = await syncStripeSubscriptionToDatabase(subscription);
      if (synced) {
        await afterSubscriptionSynced({
          companyId: synced.companyId,
          subscriptionId: synced.subscriptionId,
          status: synced.status,
          trialEnd: synced.trialEnd,
        });
      }
    } catch (error) {
      console.error('Error retrieving subscription after payment:', error);
    }
  }

  await prisma.billingRecord.update({
    where: { id: billingRecord.id },
    data: {
      amountPaid,
      status: 'active',
      billingDate: new Date(),
      isTrialPeriod: !trialJustEnded && billingRecord.isTrialPeriod,
      nextBillingDate: periodEnd ?? billingRecord.nextBillingDate,
    },
  });

  await prisma.company.update({
    where: { id: companyId },
    data: {
      subscriptionStatus: 'active',
      isTrialActive: false,
    },
  });

  await prisma.user.updateMany({
    where: { companyId, isActive: false },
    data: { isActive: true },
  });

  if (trialJustEnded && amountPaid > 0) {
    await notifyBillingOwners(
      companyId,
      'Plan upgraded — trial converted',
      `Your free trial has ended and your plan upgraded to paid billing. Payment of ${amountPaid.toFixed(2)} was successful.`,
      { invoiceId: invoice.id, amountPaid },
      { dedupeKey: `trial-converted-${companyId}-${invoice.id}` }
    );
  } else if (amountPaid > 0) {
    await notifyBillingOwners(
      companyId,
      'Payment received',
      `Your subscription payment of ${amountPaid.toFixed(2)} was successful.`,
      { invoiceId: invoice.id, amountPaid },
      { dedupeKey: `payment-success-${companyId}-${invoice.id}` }
    );
  }
}

async function handlePaymentFailure(invoice: Stripe.Invoice) {
  const customerId = resolveStripeCustomerId(invoice.customer);
  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id ?? null;

  const billingRecord = await findBillingRecordForStripeEvent({ customerId, subscriptionId });
  if (!billingRecord) {
    console.error(`No billing record found for customer ${customerId}`);
    return;
  }

  const companyId = billingRecord.companyId;
  const stripe = await getStripeClient();
  let subscriptionStatus = 'past_due';

  if (stripe && subscriptionId) {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      subscriptionStatus = subscription.status;
      await syncStripeSubscriptionToDatabase(subscription);
    } catch (error) {
      console.error('Error retrieving subscription after failed payment:', error);
    }
  }

  await prisma.billingRecord.update({
    where: { id: billingRecord.id },
    data: { status: 'failed' },
  });

  if (subscriptionStatus === 'past_due' || subscriptionStatus === 'unpaid') {
    await prisma.company.update({
      where: { id: companyId },
      data: { subscriptionStatus },
    });

    await notifyBillingOwners(
      companyId,
      'Payment failed',
      'We could not process your latest subscription payment. Update your billing details in the Billing screen to keep access.',
      { invoiceId: invoice.id, subscriptionStatus },
      { dedupeKey: `payment-failed-${companyId}-${invoice.id}` }
    );
  }
}
