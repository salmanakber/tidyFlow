import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { getPlanLimits } from '@/lib/subscription';
import { createStripeInstance } from '@/lib/stripe';
import { getStripeSecretKey, getStripePriceIdForTier } from '@/lib/stripe-settings';
import { getCompanyCurrency } from '@/lib/company-config';

/** Owner changes subscription tier — updates DB + Stripe subscription price. */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!['OWNER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  try {
    const { planTier } = await request.json();
    const tier = String(planTier || '').toUpperCase();
    if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tier)) {
      return NextResponse.json({ success: false, message: 'Invalid plan tier' }, { status: 400 });
    }

    const limits = await getPlanLimits(tier);
    const billingCurrency = await getCompanyCurrency(companyId);
    const propertyCount = await prisma.property.count({ where: { companyId, isActive: true } });

    if (propertyCount > limits.maxProperties) {
      return NextResponse.json(
        {
          success: false,
          message: `You have ${propertyCount} active properties but ${limits.label} allows ${limits.maxProperties}. Remove or deactivate properties before downgrading.`,
        },
        { status: 400 }
      );
    }

    const cleanerCount = await prisma.user.count({
      where: { companyId, role: 'CLEANER', isActive: true },
    });
    if (cleanerCount > limits.maxCleaners) {
      return NextResponse.json(
        {
          success: false,
          message: `You have ${cleanerCount} cleaners but ${limits.label} allows ${limits.maxCleaners}.`,
        },
        { status: 400 }
      );
    }

    const billing = await prisma.billingRecord.findFirst({
      where: {
        companyId,
        status: { in: ['active', 'trialing'] },
        subscriptionId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    let stripeUpdated = false;
    if (billing?.subscriptionId) {
      const secretKey = await getStripeSecretKey();
      const newPriceId = await getStripePriceIdForTier(tier, billingCurrency);

      if (!secretKey) {
        return NextResponse.json(
          { success: false, message: 'Stripe is not configured. Contact support.' },
          { status: 500 }
        );
      }
      if (!newPriceId) {
        return NextResponse.json(
          {
            success: false,
            message: `Stripe price ID not configured for ${limits.label} (${billingCurrency}). Add it in Admin → Stripe Billing.`,
          },
          { status: 500 }
        );
      }

      const stripe = createStripeInstance(secretKey);
      const subscription = await stripe.subscriptions.retrieve(billing.subscriptionId);
      const primaryItem = subscription.items.data[0];

      if (primaryItem?.id) {
        await stripe.subscriptions.update(billing.subscriptionId, {
          items: [{ id: primaryItem.id, price: newPriceId }],
          proration_behavior: 'create_prorations',
          metadata: { planTier: tier, companyId: String(companyId) },
        });
        stripeUpdated = true;

        await prisma.billingRecord.update({
          where: { id: billing.id },
          data: {
            amountDue: limits.monthlyPrice,
          },
        });
      }
    }

    await prisma.company.update({
      where: { id: companyId },
      data: {
        planTier: tier,
        basePrice: limits.monthlyPrice,
      },
    });

    return NextResponse.json({
      success: true,
      message: stripeUpdated
        ? `Plan changed to ${limits.label}. Stripe billing updated.`
        : `Plan changed to ${limits.label}.${billing?.subscriptionId ? '' : ' No active Stripe subscription found — DB only.'}`,
      data: {
        planTier: tier,
        label: limits.label,
        monthlyPrice: limits.monthlyPrice,
        limits,
        stripeUpdated,
      },
    });
  } catch (error: any) {
    console.error('Change plan error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to change plan' },
      { status: 500 }
    );
  }
}
