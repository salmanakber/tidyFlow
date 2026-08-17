import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { type PlanTier } from '@/lib/subscription';
import { createCustomer } from '@/lib/stripe';
import { getCompanyCurrency } from '@/lib/company-config';
import { getAppOrigin } from '@/lib/domains';
import {
  createPlanCheckoutSession,
  getStripeClientOrThrow,
  mapStripeError,
  resolveCheckoutPrice,
} from '@/lib/stripe-checkout';

/**
 * Creates a Stripe Checkout Session (hosted in the system browser).
 * Used by the mobile apps so subscriptions are not purchased via in-app card entry (Guideline 3.1.1).
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
    source,
  } = body as {
    companyName?: string;
    email?: string;
    planTier?: string;
    useTrial?: boolean;
    source?: string;
  };

  if (!planTier) {
    return NextResponse.json({ success: false, message: 'Plan tier is required.' }, { status: 400 });
  }

  const tier = planTier.toUpperCase() as PlanTier;
  if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tier)) {
    return NextResponse.json({ success: false, message: 'Invalid plan tier.' }, { status: 400 });
  }

  let stripe;
  try {
    ({ stripe } = await getStripeClientOrThrow());
  } catch (err) {
    const mapped = mapStripeError(err);
    return NextResponse.json({ success: false, message: mapped.message }, { status: mapped.status });
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
  const displayName = (companyName || company.name || `Company ${companyId}`).trim();

  try {
    const resolved = await resolveCheckoutPrice({
      stripe,
      tier,
      currency,
      useTrial: !!useTrial,
    });

    let billing = await prisma.billingRecord.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    let customerId = billing?.stripeCustomerId?.trim() || null;

    const looksLikeStripeCustomer = !!customerId && /^cus_[A-Za-z0-9]+$/.test(customerId);
    if (customerId && looksLikeStripeCustomer) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if ((existing as { deleted?: boolean }).deleted) {
          customerId = null;
        } else {
          await stripe.customers.update(customerId, {
            email: checkoutEmail,
            name: displayName || undefined,
          });
        }
      } catch (err: any) {
        if (err?.code === 'resource_missing' || err?.statusCode === 404) {
          customerId = null;
        } else {
          const mapped = mapStripeError(err);
          if (mapped.code === 'STRIPE_MODE_MISMATCH') customerId = null;
          else throw err;
        }
      }
    } else {
      customerId = null;
    }

    if (!customerId) {
      const customer = await createCustomer(checkoutEmail, displayName, companyId, stripe);
      customerId = customer.id;
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

    const checkoutSource =
      typeof source === 'string' && source.trim()
        ? source.trim().slice(0, 64)
        : 'mobile_external_checkout';

    const appOrigin = getAppOrigin();
    const loggedInWeb = checkoutSource === 'web_account_billing' || checkoutSource === 'web_logged_in_upgrade';
    const session = await createPlanCheckoutSession({
      stripe,
      customerId,
      companyId,
      tier,
      priceId: resolved.priceId,
      trialDays: resolved.trialDays,
      source: checkoutSource,
      successUrl: `${appOrigin}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: loggedInWeb
        ? `${appOrigin}/account/billing?tab=plans`
        : `${appOrigin}/subscribe/cancel`,
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
        trialDays: resolved.trialDays,
      },
    });
  } catch (err) {
    const mapped = mapStripeError(err);
    console.error('checkout-session error:', err);
    return NextResponse.json({ success: false, message: mapped.message }, { status: mapped.status });
  }
}

