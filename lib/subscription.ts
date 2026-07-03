import prisma from '@/lib/prisma';
import crypto from 'crypto';

export type PlanTier = 'STARTUP' | 'STANDARD' | 'PREMIUM';

export interface PlanLimits {
  tier: PlanTier;
  label: string;
  monthlyPrice: number;
  maxCleaners: number;
  maxProperties: number;
  maxManagers: number;
  aiRequestsPerMonth: number;
  aiPhotoAnalysis: boolean;
  aiInsights: boolean;
  aiAssignment: boolean;
  aiTaskSuggestions: boolean;
  invoicesEnabled: boolean;
  maxInvoicesPerMonth: number;
  aiInvoiceAssist: boolean;
  maxPhotoVerificationsPerMonth: number;
  maxPdfGenerationsPerMonth: number;
}

export interface PlanUsageSnapshot {
  planTier: string;
  label: string;
  subscriptionActive: boolean;
  features: {
    aiPhoto: boolean;
    aiInsights: boolean;
    aiAssignment: boolean;
    aiTaskSuggestions: boolean;
    invoices: boolean;
    aiInvoiceAssist: boolean;
    pdfGeneration: boolean;
  };
  planIncludes: {
    aiPhoto: boolean;
    aiInsights: boolean;
    aiAssignment: boolean;
    aiTaskSuggestions: boolean;
    invoices: boolean;
    aiInvoiceAssist: boolean;
  };
  remaining: {
    aiThisMonth: number;
    invoicesThisMonth: number;
    photoVerificationsThisMonth: number;
    pdfGenerationsThisMonth: number;
  };
  usage: {
    cleaners: { current: number; max: number; atLimit: boolean };
    properties: { current: number; max: number; atLimit: boolean };
    managers: { current: number; max: number; atLimit: boolean };
    aiThisMonth: { current: number; max: number; atLimit: boolean };
    invoicesThisMonth: { current: number; max: number; atLimit: boolean };
    photoVerificationsThisMonth: { current: number; max: number; atLimit: boolean };
    pdfGenerationsThisMonth: { current: number; max: number; atLimit: boolean };
  };
  blocked: {
    ai: boolean;
    invoices: boolean;
    photoVerification: boolean;
    pdfGeneration: boolean;
    addCleaner: boolean;
    addProperty: boolean;
    addManager: boolean;
  };
  upgradeMessage?: string;
  pendingPlanTier?: string | null;
  pendingPlanLabel?: string | null;
  pendingPlanEffectiveAt?: string | null;
  /** Start of the current monthly quota window (Stripe billing period or calendar month). */
  usagePeriodStart?: string | null;
  /** End of the current monthly quota window (next Stripe renewal or end of calendar month). */
  usagePeriodEnd?: string | null;
  /** Whether quotas reset on Stripe billing cycle or calendar month fallback. */
  usagePeriodSource?: 'stripe' | 'calendar';
}

const DEFAULT_LIMITS: Record<PlanTier, PlanLimits> = {
  STARTUP: {
    tier: 'STARTUP',
    label: 'Startup',
    monthlyPrice: 29,
    maxCleaners: 5,
    maxProperties: 10,
    maxManagers: 2,
    aiRequestsPerMonth: 50,
    aiPhotoAnalysis: true,
    aiInsights: false,
    aiAssignment: true,
    aiTaskSuggestions: true,
    invoicesEnabled: false,
    maxInvoicesPerMonth: 5,
    aiInvoiceAssist: false,
    maxPhotoVerificationsPerMonth: 30,
    maxPdfGenerationsPerMonth: 20,
  },
  STANDARD: {
    tier: 'STANDARD',
    label: 'Standard',
    monthlyPrice: 79,
    maxCleaners: 25,
    maxProperties: 50,
    maxManagers: 10,
    aiRequestsPerMonth: 500,
    aiPhotoAnalysis: true,
    aiInsights: true,
    aiAssignment: true,
    aiTaskSuggestions: true,
    invoicesEnabled: true,
    maxInvoicesPerMonth: 50,
    aiInvoiceAssist: true,
    maxPhotoVerificationsPerMonth: 200,
    maxPdfGenerationsPerMonth: 100,
  },
  PREMIUM: {
    tier: 'PREMIUM',
    label: 'Premium',
    monthlyPrice: 149,
    maxCleaners: 999,
    maxProperties: 999,
    maxManagers: 999,
    aiRequestsPerMonth: 99999,
    aiPhotoAnalysis: true,
    aiInsights: true,
    aiAssignment: true,
    aiTaskSuggestions: true,
    invoicesEnabled: true,
    maxInvoicesPerMonth: 99999,
    aiInvoiceAssist: true,
    maxPhotoVerificationsPerMonth: 99999,
    maxPdfGenerationsPerMonth: 99999,
  },
};

function calendarMonthStart() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function calendarMonthEnd(start: Date) {
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return end;
}

export type MonthlyUsagePeriod = {
  start: Date;
  end: Date | null;
  source: 'stripe' | 'calendar';
};

/** Monthly quota window — Stripe billing period when available, else calendar month. */
export async function getMonthlyUsagePeriod(companyId: number): Promise<MonthlyUsagePeriod> {
  const billing = await prisma.billingRecord.findFirst({
    where: {
      companyId,
      subscriptionId: { not: null },
      status: { in: ['active', 'trialing', 'canceling', 'past_due', 'unpaid'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { currentPeriodStart: true, nextBillingDate: true },
  });

  const now = new Date();
  if (billing?.currentPeriodStart && billing.currentPeriodStart <= now) {
    return {
      start: billing.currentPeriodStart,
      end: billing.nextBillingDate,
      source: 'stripe',
    };
  }

  const start = calendarMonthStart();
  return { start, end: calendarMonthEnd(start), source: 'calendar' };
}

export async function getMonthlyUsagePeriodStart(companyId: number): Promise<Date> {
  const period = await getMonthlyUsagePeriod(companyId);
  return period.start;
}

/** All three tiers for admin UI — merges DB overrides with built-in defaults. */
export async function getAllSubscriptionPlansForAdmin(): Promise<PlanLimits[]> {
  const rows = await prisma.subscriptionPlanLimit.findMany({ orderBy: { tier: 'asc' } });
  const rowMap = new Map(rows.map((r) => [r.tier as PlanTier, r]));

  return (['STARTUP', 'STANDARD', 'PREMIUM'] as PlanTier[]).map((tier) => {
    const fallback = DEFAULT_LIMITS[tier];
    const row = rowMap.get(tier);
    if (!row) return fallback;
    return {
      tier,
      label: row.label || fallback.label,
      monthlyPrice: Number((row as { monthlyPrice?: unknown }).monthlyPrice ?? fallback.monthlyPrice),
      maxCleaners: row.maxCleaners,
      maxProperties: row.maxProperties,
      maxManagers: row.maxManagers,
      aiRequestsPerMonth: row.aiRequestsPerMonth,
      aiPhotoAnalysis: row.aiPhotoAnalysis,
      aiInsights: row.aiInsights,
      aiAssignment: row.aiAssignment,
      aiTaskSuggestions: row.aiTaskSuggestions,
      invoicesEnabled: row.invoicesEnabled,
      maxInvoicesPerMonth: row.maxInvoicesPerMonth,
      aiInvoiceAssist: row.aiInvoiceAssist,
      maxPhotoVerificationsPerMonth:
        (row as { maxPhotoVerificationsPerMonth?: number }).maxPhotoVerificationsPerMonth ??
        fallback.maxPhotoVerificationsPerMonth,
      maxPdfGenerationsPerMonth:
        (row as { maxPdfGenerationsPerMonth?: number }).maxPdfGenerationsPerMonth ??
        fallback.maxPdfGenerationsPerMonth,
    };
  });
}

export function serializePublicPricingPlan(plan: PlanLimits, trialDays?: number) {
  return {
    tier: plan.tier,
    label: plan.label,
    monthlyPrice: plan.monthlyPrice,
    currency: 'USD',
    limits: {
      cleaners: plan.maxCleaners,
      properties: plan.maxProperties,
      managers: plan.maxManagers,
      aiRequestsPerMonth: plan.aiRequestsPerMonth,
      invoicesPerMonth: plan.maxInvoicesPerMonth,
      photoVerificationsPerMonth: plan.maxPhotoVerificationsPerMonth,
      pdfGenerationsPerMonth: plan.maxPdfGenerationsPerMonth,
    },
    scope: {
      maxCleaners: plan.maxCleaners,
      maxProperties: plan.maxProperties,
      maxManagers: plan.maxManagers,
      aiRequestsPerMonth: plan.aiRequestsPerMonth,
      maxInvoicesPerMonth: plan.maxInvoicesPerMonth,
      maxPhotoVerificationsPerMonth: plan.maxPhotoVerificationsPerMonth,
      maxPdfGenerationsPerMonth: plan.maxPdfGenerationsPerMonth,
    },
    features: {
      aiPhotoAnalysis: plan.aiPhotoAnalysis,
      aiInsights: plan.aiInsights,
      aiAssignment: plan.aiAssignment,
      aiTaskSuggestions: plan.aiTaskSuggestions,
      invoicesEnabled: plan.invoicesEnabled,
      aiInvoiceAssist: plan.aiInvoiceAssist,
    },
    ...(trialDays !== undefined ? { trialDays } : {}),
  };
}

export async function upsertSubscriptionPlanTier(
  tier: string,
  fields: Record<string, unknown>
) {
  const tierUpper = String(tier).toUpperCase();
  if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tierUpper)) {
    throw new Error('Invalid plan tier');
  }

  return prisma.subscriptionPlanLimit.upsert({
    where: { tier: tierUpper },
    create: {
      tier: tierUpper,
      label: (fields.label as string) || tierUpper,
      maxCleaners: Number(fields.maxCleaners ?? 25),
      maxProperties: Number(fields.maxProperties ?? 50),
      maxManagers: Number(fields.maxManagers ?? 10),
      aiRequestsPerMonth: Number(fields.aiRequestsPerMonth ?? 500),
      aiPhotoAnalysis: fields.aiPhotoAnalysis !== undefined ? !!fields.aiPhotoAnalysis : true,
      aiInsights: fields.aiInsights !== undefined ? !!fields.aiInsights : true,
      aiAssignment: fields.aiAssignment !== undefined ? !!fields.aiAssignment : true,
      aiTaskSuggestions:
        fields.aiTaskSuggestions !== undefined ? !!fields.aiTaskSuggestions : true,
      invoicesEnabled: fields.invoicesEnabled !== undefined ? !!fields.invoicesEnabled : false,
      maxInvoicesPerMonth: Number(fields.maxInvoicesPerMonth ?? 5),
      aiInvoiceAssist: fields.aiInvoiceAssist !== undefined ? !!fields.aiInvoiceAssist : false,
      maxPhotoVerificationsPerMonth: Number(fields.maxPhotoVerificationsPerMonth ?? 100),
      maxPdfGenerationsPerMonth: Number(fields.maxPdfGenerationsPerMonth ?? 50),
      monthlyPrice: fields.monthlyPrice != null ? Number(fields.monthlyPrice) : 55,
    },
    update: {
      ...(fields.label !== undefined ? { label: String(fields.label) } : {}),
      ...(fields.maxCleaners !== undefined ? { maxCleaners: Number(fields.maxCleaners) } : {}),
      ...(fields.maxProperties !== undefined ? { maxProperties: Number(fields.maxProperties) } : {}),
      ...(fields.maxManagers !== undefined ? { maxManagers: Number(fields.maxManagers) } : {}),
      ...(fields.aiRequestsPerMonth !== undefined
        ? { aiRequestsPerMonth: Number(fields.aiRequestsPerMonth) }
        : {}),
      ...(fields.aiPhotoAnalysis !== undefined
        ? { aiPhotoAnalysis: !!fields.aiPhotoAnalysis }
        : {}),
      ...(fields.aiInsights !== undefined ? { aiInsights: !!fields.aiInsights } : {}),
      ...(fields.aiAssignment !== undefined ? { aiAssignment: !!fields.aiAssignment } : {}),
      ...(fields.aiTaskSuggestions !== undefined
        ? { aiTaskSuggestions: !!fields.aiTaskSuggestions }
        : {}),
      ...(fields.invoicesEnabled !== undefined
        ? { invoicesEnabled: !!fields.invoicesEnabled }
        : {}),
      ...(fields.maxInvoicesPerMonth !== undefined
        ? { maxInvoicesPerMonth: Number(fields.maxInvoicesPerMonth) }
        : {}),
      ...(fields.aiInvoiceAssist !== undefined
        ? { aiInvoiceAssist: !!fields.aiInvoiceAssist }
        : {}),
      ...(fields.maxPhotoVerificationsPerMonth !== undefined
        ? { maxPhotoVerificationsPerMonth: Number(fields.maxPhotoVerificationsPerMonth) }
        : {}),
      ...(fields.maxPdfGenerationsPerMonth !== undefined
        ? { maxPdfGenerationsPerMonth: Number(fields.maxPdfGenerationsPerMonth) }
        : {}),
      ...(fields.monthlyPrice !== undefined ? { monthlyPrice: Number(fields.monthlyPrice) } : {}),
    },
  });
}

export async function getPlanLimits(tier?: string | null): Promise<PlanLimits> {
  const key = (tier?.toUpperCase() || 'STANDARD') as PlanTier;
  const fallback = DEFAULT_LIMITS[key] || DEFAULT_LIMITS.STANDARD;

  const row = await prisma.subscriptionPlanLimit.findUnique({
    where: { tier: key },
  });

  if (!row) return fallback;

  return {
    tier: key,
    label: row.label || fallback.label,
    monthlyPrice: Number((row as { monthlyPrice?: unknown }).monthlyPrice ?? fallback.monthlyPrice),
    maxCleaners: row.maxCleaners,
    maxProperties: row.maxProperties,
    maxManagers: row.maxManagers,
    aiRequestsPerMonth: row.aiRequestsPerMonth,
    aiPhotoAnalysis: row.aiPhotoAnalysis,
    aiInsights: row.aiInsights,
    aiAssignment: row.aiAssignment,
    aiTaskSuggestions: row.aiTaskSuggestions,
    invoicesEnabled: row.invoicesEnabled,
    maxInvoicesPerMonth: row.maxInvoicesPerMonth,
    aiInvoiceAssist: row.aiInvoiceAssist,
    maxPhotoVerificationsPerMonth:
      (row as { maxPhotoVerificationsPerMonth?: number }).maxPhotoVerificationsPerMonth ??
      fallback.maxPhotoVerificationsPerMonth,
    maxPdfGenerationsPerMonth:
      (row as { maxPdfGenerationsPerMonth?: number }).maxPdfGenerationsPerMonth ??
      fallback.maxPdfGenerationsPerMonth,
  };
}

export async function getCompanyPlan(companyId: number) {
  await import('@/lib/plan-change').then((m) => m.applyPendingPlanChanges(companyId));

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      planTier: true,
      pendingPlanTier: true,
      pendingPlanEffectiveAt: true,
      subscriptionStatus: true,
      isTrialActive: true,
      trialEndsAt: true,
    },
  });
  if (!company) return null;

  const limits = await getPlanLimits(company.planTier);
  const pendingLimits = company.pendingPlanTier
    ? await getPlanLimits(company.pendingPlanTier)
    : null;

  return { company, limits, pendingLimits };
}

export async function requireActiveSubscription(tokenUser: {
  companyId?: number | null;
  role?: string;
}) {
  if (!tokenUser.companyId) {
    if (['SUPER_ADMIN', 'DEVELOPER', 'OWNER'].includes(tokenUser.role || '')) {
      return { allowed: true };
    }
    return { allowed: false, message: 'Company required' };
  }

  const company = await prisma.company.findUnique({
    where: { id: tokenUser.companyId },
    select: { subscriptionStatus: true, isTrialActive: true, trialEndsAt: true },
  });

  if (!company) return { allowed: false, message: 'Company not found' };

  const active =
    company.subscriptionStatus === 'active' ||
    company.subscriptionStatus === 'trialing' ||
    company.subscriptionStatus === 'canceling' ||
    (company.isTrialActive && company.trialEndsAt && company.trialEndsAt > new Date());

  if (!active) {
    return { allowed: false, message: 'Subscription inactive. Please renew to continue.' };
  }

  return { allowed: true };
}

export async function checkPlanLimit(
  companyId: number,
  resource:
    | 'cleaners'
    | 'properties'
    | 'managers'
    | 'ai_request'
    | 'invoice'
    | 'photo_verification'
    | 'pdf_generation'
): Promise<{ allowed: boolean; message?: string; limits?: PlanLimits }> {
  const plan = await getCompanyPlan(companyId);
  if (!plan) return { allowed: false, message: 'Company not found' };

  const { limits } = plan;
  const monthlyResources = new Set([
    'ai_request',
    'invoice',
    'photo_verification',
    'pdf_generation',
  ]);
  const periodStart = monthlyResources.has(resource)
    ? await getMonthlyUsagePeriodStart(companyId)
    : null;

  if (resource === 'cleaners') {
    const count = await prisma.user.count({
      where: { companyId, role: 'CLEANER', isActive: true },
    });
    if (count >= limits.maxCleaners) {
      return {
        allowed: false,
        message: `${limits.label} plan allows up to ${limits.maxCleaners} cleaners. Upgrade to add more.`,
        limits,
      };
    }
  }

  if (resource === 'properties') {
    const count = await prisma.property.count({ where: { companyId, isActive: true } });
    if (count >= limits.maxProperties) {
      return {
        allowed: false,
        message: `${limits.label} plan allows up to ${limits.maxProperties} properties. Upgrade to add more.`,
        limits,
      };
    }
  }

  if (resource === 'managers') {
    const count = await prisma.user.count({
      where: { companyId, role: { in: ['MANAGER', 'COMPANY_ADMIN'] }, isActive: true },
    });
    if (count >= limits.maxManagers) {
      return {
        allowed: false,
        message: `${limits.label} plan allows up to ${limits.maxManagers} managers.`,
        limits,
      };
    }
  }

  if (resource === 'ai_request') {
    const used = await prisma.aIUsageLog.count({
      where: { companyId, createdAt: { gte: periodStart! } },
    });
    if (used >= limits.aiRequestsPerMonth) {
      return {
        allowed: false,
        message: `AI usage limit reached (${limits.aiRequestsPerMonth}/month on ${limits.label} plan). Upgrade for more.`,
        limits,
      };
    }
  }

  if (resource === 'invoice') {
    if (!limits.invoicesEnabled) {
      return {
        allowed: false,
        message: `${limits.label} plan does not include client invoicing. Upgrade to enable invoices.`,
        limits,
      };
    }
    const used = await prisma.clientInvoice.count({
      where: { companyId, createdAt: { gte: periodStart! }, status: { not: 'void' } },
    });
    if (used >= limits.maxInvoicesPerMonth) {
      return {
        allowed: false,
        message: `Invoice limit reached (${limits.maxInvoicesPerMonth}/month on ${limits.label} plan). Upgrade for more.`,
        limits,
      };
    }
  }

  if (resource === 'photo_verification') {
    if (!limits.aiPhotoAnalysis) {
      return {
        allowed: false,
        message: `${limits.label} plan does not include AI photo verification. Upgrade your subscription.`,
        limits,
      };
    }
    const used = await prisma.aIUsageLog.count({
      where: { companyId, feature: 'photo_verification', createdAt: { gte: periodStart! } },
    });
    if (used >= limits.maxPhotoVerificationsPerMonth) {
      return {
        allowed: false,
        message: `Photo verification limit reached (${limits.maxPhotoVerificationsPerMonth}/month on ${limits.label} plan). Upgrade for more.`,
        limits,
      };
    }
  }

  if (resource === 'pdf_generation') {
    const used = await prisma.pDFRecord.count({
      where: {
        createdAt: { gte: periodStart! },
        task: { companyId },
      },
    });
    if (used >= limits.maxPdfGenerationsPerMonth) {
      return {
        allowed: false,
        message: `PDF generation limit reached (${limits.maxPdfGenerationsPerMonth}/month on ${limits.label} plan). Upgrade for more.`,
        limits,
      };
    }
  }

  return { allowed: true, limits };
}

export async function requireAIFeature(
  companyId: number,
  feature: 'photo' | 'insights' | 'assignment' | 'task_suggestions'
): Promise<{ allowed: boolean; message?: string }> {
  const sub = await requireActiveSubscription({ companyId, role: 'OWNER' });
  if (!sub.allowed) return sub;

  const plan = await getCompanyPlan(companyId);
  if (!plan) return { allowed: false, message: 'Company not found' };

  if (feature === 'photo') {
    const photoLimit = await checkPlanLimit(companyId, 'photo_verification');
    if (!photoLimit.allowed) return photoLimit;
  } else {
    const usage = await checkPlanLimit(companyId, 'ai_request');
    if (!usage.allowed) return usage;
  }

  const flags: Record<string, boolean> = {
    photo: plan.limits.aiPhotoAnalysis,
    insights: plan.limits.aiInsights,
    assignment: plan.limits.aiAssignment,
    task_suggestions: plan.limits.aiTaskSuggestions,
  };

  if (!flags[feature]) {
    return {
      allowed: false,
      message: `${plan.limits.label} plan does not include this AI feature. Upgrade your subscription.`,
    };
  }

  return { allowed: true };
}

export async function requirePdfGeneration(companyId: number) {
  const sub = await requireActiveSubscription({ companyId, role: 'OWNER' });
  if (!sub.allowed) return sub;
  return checkPlanLimit(companyId, 'pdf_generation');
}

export async function requireInvoiceFeature(companyId: number) {
  const sub = await requireActiveSubscription({ companyId, role: 'OWNER' });
  if (!sub.allowed) return sub;
  return checkPlanLimit(companyId, 'invoice');
}

export async function logAIUsage(companyId: number, feature: string) {
  await prisma.aIUsageLog.create({ data: { companyId, feature } }).catch(() => {});

  try {
    const plan = await getCompanyPlan(companyId);
    if (!plan) return;
    const periodStart = await getMonthlyUsagePeriodStart(companyId);
    const used = await prisma.aIUsageLog.count({
      where: { companyId, createdAt: { gte: periodStart } },
    });
    const remaining = Math.max(0, plan.limits.aiRequestsPerMonth - used);
    if (remaining > 5) return;

    const { enqueuePlanLimitWarning } = await import('./automation-queue');
    const { notifyOwnersPlanLimitLow } = await import('./automation-worker');
    const queued = await enqueuePlanLimitWarning(
      companyId,
      remaining,
      plan.limits.aiRequestsPerMonth
    );
    if (!queued) {
      await notifyOwnersPlanLimitLow(companyId, remaining, plan.limits.aiRequestsPerMonth);
    }
  } catch (err) {
    console.warn('Plan limit notification check failed:', err);
  }
}

export function hashFingerprint(parts: (string | number | Date | null | undefined)[]): string {
  const raw = parts.map((p) => (p instanceof Date ? p.toISOString() : String(p ?? ''))).join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export async function getPlanUsageSnapshot(companyId: number): Promise<PlanUsageSnapshot | null> {
  const plan = await getCompanyPlan(companyId);
  if (!plan) return null;

  const usagePeriod = await getMonthlyUsagePeriod(companyId);
  const periodStart = usagePeriod.start;
  const [cleaners, properties, managers, aiUsed, invoicesUsed, photoVerificationsUsed, pdfGenerationsUsed] =
    await Promise.all([
    prisma.user.count({ where: { companyId, role: 'CLEANER', isActive: true } }),
    prisma.property.count({ where: { companyId, isActive: true } }),
    prisma.user.count({
      where: { companyId, role: { in: ['MANAGER', 'COMPANY_ADMIN'] }, isActive: true },
    }),
    prisma.aIUsageLog.count({ where: { companyId, createdAt: { gte: periodStart } } }),
    prisma.clientInvoice.count({
      where: { companyId, createdAt: { gte: periodStart }, status: { not: 'void' } },
    }),
    prisma.aIUsageLog.count({
      where: { companyId, feature: 'photo_verification', createdAt: { gte: periodStart } },
    }),
    prisma.pDFRecord.count({
      where: { createdAt: { gte: periodStart }, task: { companyId } },
    }),
  ]);

  const { limits, company, pendingLimits } = plan;
  const subscriptionActive =
    company.subscriptionStatus === 'active' ||
    company.subscriptionStatus === 'trialing' ||
    company.subscriptionStatus === 'canceling' ||
    !!(company.isTrialActive && company.trialEndsAt && company.trialEndsAt > new Date());

  const pendingActive =
    !!company.pendingPlanTier &&
    !!company.pendingPlanEffectiveAt &&
    company.pendingPlanEffectiveAt > new Date();

  const aiAtLimit = aiUsed >= limits.aiRequestsPerMonth;
  const invoicesAtLimit = !limits.invoicesEnabled || invoicesUsed >= limits.maxInvoicesPerMonth;
  const photoAtLimit =
    !limits.aiPhotoAnalysis || photoVerificationsUsed >= limits.maxPhotoVerificationsPerMonth;
  const pdfAtLimit = pdfGenerationsUsed >= limits.maxPdfGenerationsPerMonth;

  return {
    planTier: company.planTier || 'STANDARD',
    label: limits.label,
    subscriptionActive,
    features: {
      aiPhoto: limits.aiPhotoAnalysis && !photoAtLimit && subscriptionActive,
      aiInsights: limits.aiInsights && !aiAtLimit && subscriptionActive,
      aiAssignment: limits.aiAssignment && !aiAtLimit && subscriptionActive,
      aiTaskSuggestions: limits.aiTaskSuggestions && !aiAtLimit && subscriptionActive,
      invoices: limits.invoicesEnabled && !invoicesAtLimit && subscriptionActive,
      aiInvoiceAssist: limits.aiInvoiceAssist && !aiAtLimit && subscriptionActive,
      pdfGeneration: !pdfAtLimit && subscriptionActive,
    },
    planIncludes: {
      aiPhoto: limits.aiPhotoAnalysis,
      aiInsights: limits.aiInsights,
      aiAssignment: limits.aiAssignment,
      aiTaskSuggestions: limits.aiTaskSuggestions,
      invoices: limits.invoicesEnabled,
      aiInvoiceAssist: limits.aiInvoiceAssist,
    },
    remaining: {
      aiThisMonth: Math.max(0, limits.aiRequestsPerMonth - aiUsed),
      invoicesThisMonth: Math.max(0, limits.maxInvoicesPerMonth - invoicesUsed),
      photoVerificationsThisMonth: Math.max(
        0,
        limits.maxPhotoVerificationsPerMonth - photoVerificationsUsed
      ),
      pdfGenerationsThisMonth: Math.max(0, limits.maxPdfGenerationsPerMonth - pdfGenerationsUsed),
    },
    usage: {
      cleaners: { current: cleaners, max: limits.maxCleaners, atLimit: cleaners >= limits.maxCleaners },
      properties: {
        current: properties,
        max: limits.maxProperties,
        atLimit: properties >= limits.maxProperties,
      },
      managers: { current: managers, max: limits.maxManagers, atLimit: managers >= limits.maxManagers },
      aiThisMonth: {
        current: aiUsed,
        max: limits.aiRequestsPerMonth,
        atLimit: aiAtLimit,
      },
      invoicesThisMonth: {
        current: invoicesUsed,
        max: limits.maxInvoicesPerMonth,
        atLimit: invoicesAtLimit,
      },
      photoVerificationsThisMonth: {
        current: photoVerificationsUsed,
        max: limits.maxPhotoVerificationsPerMonth,
        atLimit: photoAtLimit,
      },
      pdfGenerationsThisMonth: {
        current: pdfGenerationsUsed,
        max: limits.maxPdfGenerationsPerMonth,
        atLimit: pdfAtLimit,
      },
    },
    blocked: {
      ai: aiAtLimit || !subscriptionActive,
      invoices: invoicesAtLimit || !subscriptionActive,
      photoVerification: photoAtLimit || !subscriptionActive,
      pdfGeneration: pdfAtLimit || !subscriptionActive,
      addCleaner: cleaners >= limits.maxCleaners || !subscriptionActive,
      addProperty: properties >= limits.maxProperties || !subscriptionActive,
      addManager: managers >= limits.maxManagers || !subscriptionActive,
    },
    upgradeMessage: pendingActive && pendingLimits
      ? `Downgrade to ${pendingLimits.label} scheduled for ${company.pendingPlanEffectiveAt!.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}. You keep ${limits.label} features until then.`
      : !subscriptionActive
      ? 'Your subscription is inactive. Renew in Billing to restore features.'
      : aiAtLimit
        ? `AI limit reached (${aiUsed}/${limits.aiRequestsPerMonth} this month). Upgrade your plan.`
        : undefined,
    pendingPlanTier: pendingActive ? company.pendingPlanTier : null,
    pendingPlanLabel: pendingActive ? pendingLimits?.label ?? null : null,
    pendingPlanEffectiveAt: pendingActive
      ? company.pendingPlanEffectiveAt!.toISOString()
      : null,
    usagePeriodStart: periodStart.toISOString(),
    usagePeriodEnd: usagePeriod.end?.toISOString() ?? null,
    usagePeriodSource: usagePeriod.source,
  };
}
