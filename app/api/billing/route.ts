import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyBillingAccess } from '@/lib/rbac';
import { getPlanLimits } from '@/lib/subscription';
import { createStripeInstance } from '@/lib/stripe';
import { getStripeSecretKey } from '@/lib/stripe-settings';
import { stripeSubscriptionPeriodDates } from '@/lib/stripe-webhook-sync';

function serializeBillingRecord(record: {
  id: number;
  companyId: number;
  status: string;
  amountPaid: unknown;
  amountDue: unknown;
  billingDate: Date | null;
  nextBillingDate: Date | null;
  propertyCount: number;
  isTrialPeriod: boolean;
  trialEndsAt: Date | null;
  invoiceUrl: string | null;
  subscriptionId: string | null;
  createdAt: Date;
  company: { name: string };
}) {
  return {
    id: String(record.id),
    companyName: record.company.name,
    billingDate: record.billingDate?.toISOString() ?? record.createdAt.toISOString(),
    status: record.status as 'active' | 'failed' | 'pending',
    amountPaid: Number(record.amountPaid),
    amountDue: Number(record.amountDue),
    propertyCount: record.propertyCount,
    nextBillingDate: record.nextBillingDate?.toISOString(),
    isTrialPeriod: record.isTrialPeriod,
    trialEndsAt: record.trialEndsAt?.toISOString(),
    invoiceUrl: record.invoiceUrl,
    subscriptionId: record.subscriptionId,
  };
}

export async function GET(request: NextRequest) {
  const access = await requireCompanyBillingAccess(request);
  if (access.response) return access.response;
  const companyId = access.companyId;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const skip = (page - 1) * limit;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      subscriptionStatus: true,
      planTier: true,
      pendingPlanTier: true,
      pendingPlanEffectiveAt: true,
      basePrice: true,
      propertyCount: true,
      isTrialActive: true,
      trialEndsAt: true,
    },
  });

  if (!company) {
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
  }

  const limits = await getPlanLimits(company.planTier);

  const now = new Date();
  const trialEndDate = company.trialEndsAt ? new Date(company.trialEndsAt) : null;
  const trialStillValid = !!(trialEndDate && !Number.isNaN(trialEndDate.getTime()) && trialEndDate > now);
  const isTrialActiveEffective = !!(company.isTrialActive && trialStillValid);
  const trialDaysRemaining = trialStillValid && trialEndDate
    ? Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // If DB still says trialing but the trial window is over / flag off, don't advertise trial
  const subscriptionStatusEffective =
    !isTrialActiveEffective &&
    (company.subscriptionStatus || '').toLowerCase() === 'trialing'
      ? 'inactive'
      : company.subscriptionStatus || 'inactive';

  const [records, total, failedPayments, activeBilling] = await Promise.all([
    prisma.billingRecord.findMany({
      where: { companyId },
      include: { company: { select: { name: true } } },
      orderBy: [{ billingDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.billingRecord.count({ where: { companyId } }),
    prisma.billingRecord.count({ where: { companyId, status: 'failed' } }),
    prisma.billingRecord.findFirst({
      where: {
        companyId,
        subscriptionId: { not: null },
        status: { in: ['active', 'trialing', 'canceling'] },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  let currentSubscription: {
    id: string;
    subscriptionId: string;
    status: string;
    nextBillingDate?: string;
    cancelAtPeriodEnd?: boolean;
    cancelEffectiveAt?: string | null;
  } | null = null;

  if (activeBilling?.subscriptionId) {
    currentSubscription = {
      id: String(activeBilling.id),
      subscriptionId: activeBilling.subscriptionId,
      status: activeBilling.status,
      nextBillingDate: activeBilling.nextBillingDate?.toISOString(),
    };

    const secretKey = await getStripeSecretKey();
    if (secretKey) {
      try {
        const stripe = createStripeInstance(secretKey);
        const sub = await stripe.subscriptions.retrieve(activeBilling.subscriptionId);
        const { currentPeriodStart, currentPeriodEnd } = stripeSubscriptionPeriodDates(sub);
        const periodEnd = currentPeriodEnd ?? activeBilling.nextBillingDate;

        if (currentPeriodStart || currentPeriodEnd) {
          await prisma.billingRecord.update({
            where: { id: activeBilling.id },
            data: {
              ...(currentPeriodStart ? { currentPeriodStart } : {}),
              ...(currentPeriodEnd ? { nextBillingDate: currentPeriodEnd } : {}),
            },
          });
        }

        currentSubscription = {
          id: String(activeBilling.id),
          subscriptionId: activeBilling.subscriptionId,
          status: sub.status,
          nextBillingDate: periodEnd?.toISOString(),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          cancelEffectiveAt: sub.cancel_at_period_end ? periodEnd?.toISOString() ?? null : null,
        };
      } catch (err) {
        console.warn('Could not sync subscription from Stripe:', err);
      }
    }
  }

  // Never surface Stripe/DB "trialing" when the company trial is not actually active
  if (
    currentSubscription &&
    !isTrialActiveEffective &&
    String(currentSubscription.status).toLowerCase() === 'trialing'
  ) {
    currentSubscription = {
      ...currentSubscription,
      status: subscriptionStatusEffective || 'inactive',
    };
  }

  return NextResponse.json({
    success: true,
    billingRecords: records.map(serializeBillingRecord),
    company: {
      name: company.name,
      isTrialActive: isTrialActiveEffective,
      trialExpired: Boolean(company.trialEndsAt && !trialStillValid),
      trialDaysRemaining: isTrialActiveEffective ? trialDaysRemaining : 0,
      subscriptionStatus: isTrialActiveEffective
        ? company.subscriptionStatus
        : subscriptionStatusEffective,
      planTier: company.planTier,
      pendingPlanTier: company.pendingPlanTier,
      pendingPlanEffectiveAt: company.pendingPlanEffectiveAt?.toISOString() ?? null,
      monthlyCost: limits.monthlyPrice,
      basePrice: Number(company.basePrice),
      propertyCount: company.propertyCount,
      trialEndsAt: company.trialEndsAt?.toISOString(),
    },
    currentSubscription,
    summary: {
      total_transactions: total,
      failed_payments: failedPayments,
    },
    pagination: {
      page,
      limit,
      hasMore: skip + records.length < total,
    },
  });
}
