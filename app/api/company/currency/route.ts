import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope, resolveCompanyIdAsync } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { isStripeCurrency, normalizeCurrencyCode, DEFAULT_CURRENCY } from '@/lib/stripe-currencies';
import { createStripeInstance } from '@/lib/stripe';
import { getStripeSecretKey, getStripePriceIdForTier } from '@/lib/stripe-settings';

async function syncStripeBillingCurrency(companyId: number, currency: string) {
  const secretKey = await getStripeSecretKey();
  if (!secretKey) return { stripeUpdated: false };

  const billing = await prisma.billingRecord.findFirst({
    where: {
      companyId,
      status: { in: ['active', 'trialing'] },
      subscriptionId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!billing?.subscriptionId || !billing.stripeCustomerId) {
    return { stripeUpdated: false };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { planTier: true },
  });
  const tier = company?.planTier || 'STANDARD';
  const newPriceId = await getStripePriceIdForTier(tier, currency);

  const stripe = createStripeInstance(secretKey);

  await stripe.customers.update(billing.stripeCustomerId, {
    metadata: { preferredCurrency: currency, companyId: String(companyId) },
  });

  if (!newPriceId) {
    return { stripeUpdated: false, message: 'Customer currency metadata updated; add Stripe price IDs for this currency to switch subscription billing.' };
  }

  const subscription = await stripe.subscriptions.retrieve(billing.subscriptionId);
  const primaryItem = subscription.items.data[0];

  if (primaryItem?.id) {
    await stripe.subscriptions.update(billing.subscriptionId, {
      items: [{ id: primaryItem.id, price: newPriceId }],
      proration_behavior: 'create_prorations',
      metadata: { currency, planTier: tier, companyId: String(companyId) },
    });
    return { stripeUpdated: true };
  }

  return { stripeUpdated: false };
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const config = await prisma.adminConfiguration.findUnique({
    where: { companyId },
    select: { currency: true },
  });

  return NextResponse.json({
    success: true,
    data: { currency: normalizeCurrencyCode(config?.currency), companyId },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const role = auth.tokenUser.role;
  if (role !== UserRole.OWNER) {
    return NextResponse.json(
      { success: false, message: 'Only the company owner can change currency settings' },
      { status: 403 }
    );
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const body = await request.json();
  const raw = String(body.currency || '').toUpperCase();
  if (!isStripeCurrency(raw)) {
    return NextResponse.json({ success: false, message: 'Unsupported currency' }, { status: 400 });
  }
  const currency = normalizeCurrencyCode(raw);

  const updated = await prisma.adminConfiguration.upsert({
    where: { companyId },
    create: { companyId, currency },
    update: { currency },
    select: { currency: true },
  });

  let stripeSync: { stripeUpdated: boolean; message?: string } = { stripeUpdated: false };
  try {
    stripeSync = await syncStripeBillingCurrency(companyId, currency);
  } catch (err) {
    console.warn('Stripe currency sync failed:', err);
  }

  return NextResponse.json({
    success: true,
    data: {
      currency: updated.currency || DEFAULT_CURRENCY,
      companyId,
      stripeUpdated: stripeSync.stripeUpdated,
    },
    message: stripeSync.stripeUpdated
      ? 'Company currency updated. Stripe subscription billing currency updated.'
      : stripeSync.message || 'Company currency updated for all team members',
  });
}
