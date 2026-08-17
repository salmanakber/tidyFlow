import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, comparePassword } from '@/lib/auth';
import { requireAuth } from '@/lib/rbac';

const PARTNER_JWT_EXPIRES = '14d';

export type PartnerJwtPayload = {
  partnerId: number;
  email: string;
  type: 'MARKETER' | 'INVESTOR';
  kind: 'partner';
};

function jwtSecret() {
  return process.env.JWT_SECRET || 'your-secret-key-change-in-production';
}

export function generatePartnerToken(payload: Omit<PartnerJwtPayload, 'kind'>): string {
  return jwt.sign({ ...payload, kind: 'partner' }, jwtSecret(), { expiresIn: PARTNER_JWT_EXPIRES });
}

export function verifyPartnerToken(token: string): PartnerJwtPayload | null {
  try {
    const decoded = jwt.verify(token, jwtSecret()) as PartnerJwtPayload;
    if (decoded?.kind !== 'partner' || !decoded.partnerId) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function requirePartnerAuth(request: NextRequest): PartnerJwtPayload | null {
  const header = request.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const cookie = request.cookies.get('partnerAuthToken')?.value || null;
  const token = bearer || cookie;
  if (!token) return null;
  return verifyPartnerToken(token);
}

export function requirePartnersAdmin(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return null;
  const role = auth.tokenUser.role;
  const allowed = ['SUPER_ADMIN', 'DEVELOPER', 'ADMIN_UNIQUE', 'OWNER'].includes(role);
  if (!allowed && !(auth.tokenUser as any).isHeadSuperAdmin) return null;
  return auth;
}

export function generateReferralCode(base?: string): string {
  const slug = String(base || 'TF')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${slug || 'TF'}${rand}`;
}

export async function hashPartnerPassword(password: string) {
  return hashPassword(password);
}

export async function verifyPartnerPassword(password: string, hash: string) {
  return comparePassword(password, hash);
}

export async function findPartnerByReferralCode(code?: string | null) {
  const c = String(code || '')
    .trim()
    .toUpperCase();
  if (!c) return null;
  return (prisma as any).partner.findFirst({
    where: { referralCode: c, type: 'MARKETER', status: 'ACTIVE' },
  });
}

/**
 * Attribute a newly registered company to a marketer and create a referral row.
 */
export async function attributeCompanyToPartner(opts: {
  partnerId: number;
  companyId: number;
  userId?: number;
  registeredEmail: string;
  companyName?: string;
  attributionNote?: string;
}) {
  await (prisma as any).company.update({
    where: { id: opts.companyId },
    data: { referredByPartnerId: opts.partnerId },
  });
  const existing = await (prisma as any).partnerReferral.findFirst({
    where: { partnerId: opts.partnerId, companyId: opts.companyId },
  });
  if (existing) {
    await (prisma as any).partnerReferral.update({
      where: { id: existing.id },
      data: {
        registeredEmail: opts.registeredEmail.toLowerCase(),
        companyName: opts.companyName || existing.companyName,
        attributionNote: opts.attributionNote || existing.attributionNote,
        userId: opts.userId ?? existing.userId,
      },
    });
    return;
  }
  await (prisma as any).partnerReferral.create({
    data: {
      partnerId: opts.partnerId,
      companyId: opts.companyId,
      userId: opts.userId ?? null,
      registeredEmail: opts.registeredEmail.toLowerCase(),
      companyName: opts.companyName || null,
      attributionNote: opts.attributionNote || 'Registered via referral code',
    },
  });
}

/**
 * Create a pending commission from a paid billing record (idempotent per partner+billingRecord).
 */
export async function createCommissionFromBillingRecord(billingRecordId: number) {
  const record = await (prisma as any).billingRecord.findUnique({
    where: { id: billingRecordId },
    include: { company: true },
  });
  if (!record?.company?.referredByPartnerId) return null;

  const paid = Number(record.amountPaid || 0);
  if (paid <= 0) return null;

  const partner = await (prisma as any).partner.findUnique({
    where: { id: record.company.referredByPartnerId },
  });
  if (!partner || partner.type !== 'MARKETER' || partner.status !== 'ACTIVE') return null;

  const rate = Number(partner.commissionPercent || 0);
  const commissionAmount = Math.round(paid * (rate / 100) * 100) / 100;

  try {
    return await (prisma as any).partnerCommission.create({
      data: {
        partnerId: partner.id,
        companyId: record.companyId,
        billingRecordId: record.id,
        revenueAmount: paid,
        commissionAmount,
        commissionRate: rate,
        status: 'PENDING',
        periodLabel: record.billingDate
          ? new Date(record.billingDate).toISOString().slice(0, 7)
          : new Date().toISOString().slice(0, 7),
        notes: `Auto from billing #${record.id}`,
      },
    });
  } catch (err: any) {
    // unique constraint = already created
    if (String(err?.code) === 'P2002') return null;
    throw err;
  }
}

/** Sync missing commissions for all paid billing records of referred companies. */
export async function syncPartnerCommissions(partnerId?: number) {
  const where: any = {
    referredByPartnerId: partnerId ? partnerId : { not: null },
  };
  const companies = await (prisma as any).company.findMany({
    where,
    select: { id: true, referredByPartnerId: true },
  });
  let created = 0;
  for (const c of companies) {
    const records = await (prisma as any).billingRecord.findMany({
      where: {
        companyId: c.id,
        amountPaid: { gt: 0 },
      },
      select: { id: true },
    });
    for (const r of records) {
      const row = await createCommissionFromBillingRecord(r.id);
      if (row) created += 1;
    }
  }
  return { created };
}

const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing']);

function isCompanySubscriptionActive(company: {
  subscriptionStatus?: string | null;
  isTrialActive?: boolean | null;
}): boolean {
  const status = String(company.subscriptionStatus || '').toLowerCase();
  if (ACTIVE_SUB_STATUSES.has(status)) return true;
  // Fall back: active trial flag with status not clearly dead
  if (company.isTrialActive && !['canceled', 'cancelled', 'unpaid', 'inactive', 'expired'].includes(status)) {
    return true;
  }
  return false;
}

/**
 * Validate a marketer client-claim by customer email.
 * Customer must exist, have an active subscription, and not be linked to another marketer.
 */
export async function validateClientClaimForMarketer(opts: {
  partnerId: number;
  customerEmail: string;
}) {
  const email = String(opts.customerEmail || '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    return { ok: false as const, code: 'INVALID_EMAIL', message: 'Enter a valid customer email.' };
  }

  const partner = await (prisma as any).partner.findUnique({ where: { id: opts.partnerId } });
  if (!partner || partner.type !== 'MARKETER' || partner.status !== 'ACTIVE') {
    return { ok: false as const, code: 'PARTNER_INACTIVE', message: 'Your marketer account is not active.' };
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      companyId: true,
      company: {
        select: {
          id: true,
          name: true,
          subscriptionStatus: true,
          planTier: true,
          isTrialActive: true,
          referredByPartnerId: true,
          referredByPartner: {
            select: { id: true, email: true, firstName: true, lastName: true, companyName: true },
          },
        },
      },
    },
  });

  if (!user?.companyId || !user.company) {
    return {
      ok: false as const,
      code: 'NOT_REGISTERED',
      message: 'No registered TidyFlow customer found with that email.',
    };
  }

  const company = user.company;

  if (!isCompanySubscriptionActive(company)) {
    return {
      ok: false as const,
      code: 'NO_ACTIVE_SUBSCRIPTION',
      message: `This customer is registered but does not have an active subscription (status: ${company.subscriptionStatus || 'unknown'}).`,
      company: { id: company.id, name: company.name, subscriptionStatus: company.subscriptionStatus },
    };
  }

  if (company.referredByPartnerId && company.referredByPartnerId !== opts.partnerId) {
    return {
      ok: false as const,
      code: 'LINKED_TO_OTHER_MARKETER',
      message: 'This customer is already linked to another marketer and cannot be claimed.',
    };
  }

  if (company.referredByPartnerId === opts.partnerId) {
    return {
      ok: false as const,
      code: 'ALREADY_YOURS',
      message: 'This customer is already linked to your account.',
      company: { id: company.id, name: company.name },
    };
  }

  const pendingOther = await (prisma as any).partnerClientClaim.findFirst({
    where: {
      companyId: company.id,
      status: 'PENDING',
      partnerId: { not: opts.partnerId },
    },
    include: { partner: { select: { id: true, email: true } } },
  });
  if (pendingOther) {
    return {
      ok: false as const,
      code: 'PENDING_OTHER_MARKETER',
      message: 'Another marketer already has a pending claim for this customer. Wait for admin review.',
    };
  }

  const existingMine = await (prisma as any).partnerClientClaim.findFirst({
    where: {
      partnerId: opts.partnerId,
      companyId: company.id,
      status: 'PENDING',
    },
  });
  if (existingMine) {
    return {
      ok: false as const,
      code: 'ALREADY_PENDING',
      message: 'You already have a pending claim for this customer.',
      claimId: existingMine.id,
    };
  }

  return {
    ok: true as const,
    user,
    company,
    message: 'Customer verified. Submit for admin review.',
  };
}

export async function submitClientClaim(opts: {
  partnerId: number;
  customerEmail: string;
  note?: string;
}) {
  const validation = await validateClientClaimForMarketer(opts);
  if (!validation.ok) {
    return { success: false as const, ...validation };
  }

  const claim = await (prisma as any).partnerClientClaim.create({
    data: {
      partnerId: opts.partnerId,
      companyId: validation.company.id,
      userId: validation.user.id,
      customerEmail: validation.user.email.toLowerCase(),
      companyName: validation.company.name,
      note: opts.note?.trim() || null,
      status: 'PENDING',
    },
  });

  return {
    success: true as const,
    message: 'Claim submitted for admin review.',
    claim,
  };
}

export async function reviewClientClaim(opts: {
  claimId: number;
  approve: boolean;
  adminNote?: string;
  reviewedByUserId?: number;
}) {
  const claim = await (prisma as any).partnerClientClaim.findUnique({
    where: { id: opts.claimId },
    include: {
      partner: true,
      company: true,
    },
  });
  if (!claim) {
    return { success: false as const, message: 'Claim not found' };
  }
  if (claim.status !== 'PENDING') {
    return { success: false as const, message: `Claim is already ${claim.status}` };
  }

  if (!opts.approve) {
    const updated = await (prisma as any).partnerClientClaim.update({
      where: { id: claim.id },
      data: {
        status: 'REJECTED',
        adminNote: opts.adminNote || 'Rejected by admin',
        reviewedAt: new Date(),
        reviewedByUserId: opts.reviewedByUserId ?? null,
      },
    });
    return { success: true as const, claim: updated, message: 'Claim rejected' };
  }

  // Re-validate before approve
  const recheck = await validateClientClaimForMarketer({
    partnerId: claim.partnerId,
    customerEmail: claim.customerEmail,
  });
  // ALREADY_PENDING is expected for this claim itself — treat as ok if only blocked by our own pending
  if (!recheck.ok && recheck.code !== 'ALREADY_PENDING') {
    // If company became linked to this partner somehow, allow approve path via attribute
    if (recheck.code === 'ALREADY_YOURS') {
      // fall through to approve marking
    } else {
      await (prisma as any).partnerClientClaim.update({
        where: { id: claim.id },
        data: {
          status: 'REJECTED',
          adminNote: opts.adminNote || recheck.message,
          reviewedAt: new Date(),
          reviewedByUserId: opts.reviewedByUserId ?? null,
        },
      });
      return {
        success: false as const,
        message: `Cannot approve: ${recheck.message}`,
      };
    }
  }

  // Ensure not linked to another marketer at approve time
  const company = await (prisma as any).company.findUnique({ where: { id: claim.companyId } });
  if (company?.referredByPartnerId && company.referredByPartnerId !== claim.partnerId) {
    await (prisma as any).partnerClientClaim.update({
      where: { id: claim.id },
      data: {
        status: 'REJECTED',
        adminNote: 'Customer was linked to another marketer before approval.',
        reviewedAt: new Date(),
        reviewedByUserId: opts.reviewedByUserId ?? null,
      },
    });
    return {
      success: false as const,
      message: 'Cannot approve: customer is already linked to another marketer.',
    };
  }

  await attributeCompanyToPartner({
    partnerId: claim.partnerId,
    companyId: claim.companyId,
    userId: claim.userId || undefined,
    registeredEmail: claim.customerEmail,
    companyName: claim.companyName || company?.name,
    attributionNote: 'Approved marketer client claim',
  });

  const updated = await (prisma as any).partnerClientClaim.update({
    where: { id: claim.id },
    data: {
      status: 'APPROVED',
      adminNote: opts.adminNote || 'Approved',
      reviewedAt: new Date(),
      reviewedByUserId: opts.reviewedByUserId ?? null,
    },
  });

  // Reject other pending claims for same company
  await (prisma as any).partnerClientClaim.updateMany({
    where: {
      companyId: claim.companyId,
      status: 'PENDING',
      id: { not: claim.id },
    },
    data: {
      status: 'REJECTED',
      adminNote: 'Rejected automatically — customer attributed to another marketer.',
      reviewedAt: new Date(),
    },
  });

  await syncPartnerCommissions(claim.partnerId).catch(() => null);

  return { success: true as const, claim: updated, message: 'Claim approved and customer linked.' };
}

/** Admin: list client claims (default pending). */
export async function listClientClaims(opts?: { status?: string; take?: number }) {
  const status = opts?.status && opts.status !== 'ALL' ? opts.status : undefined;
  return (prisma as any).partnerClientClaim.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: opts?.take ?? 100,
    include: {
      partner: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          companyName: true,
          referralCode: true,
        },
      },
      company: {
        select: {
          id: true,
          name: true,
          subscriptionStatus: true,
          planTier: true,
          referredByPartnerId: true,
        },
      },
    },
  });
}

export async function getMarketerDashboard(partnerId: number) {
  const partner = await (prisma as any).partner.findUnique({ where: { id: partnerId } });
  if (!partner) return null;

  const [referrals, commissions, payouts, companies, claims] = await Promise.all([
    (prisma as any).partnerReferral.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            subscriptionStatus: true,
            planTier: true,
            isTrialActive: true,
            createdAt: true,
          },
        },
      },
    }),
    (prisma as any).partnerCommission.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { company: { select: { id: true, name: true } } },
    }),
    (prisma as any).partnerPayout.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    (prisma as any).company.findMany({
      where: { referredByPartnerId: partnerId },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        planTier: true,
        isTrialActive: true,
        createdAt: true,
      },
    }),
    (prisma as any).partnerClientClaim.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        company: {
          select: { id: true, name: true, subscriptionStatus: true, planTier: true },
        },
      },
    }),
  ]);

  const totalRevenue = commissions.reduce((s: number, c: any) => s + Number(c.revenueAmount || 0), 0);
  const totalCommission = commissions.reduce(
    (s: number, c: any) => s + Number(c.commissionAmount || 0),
    0
  );
  const pendingCommission = commissions
    .filter((c: any) => c.status === 'PENDING' || c.status === 'APPROVED')
    .reduce((s: number, c: any) => s + Number(c.commissionAmount || 0), 0);
  const paidCommission = commissions
    .filter((c: any) => c.status === 'PAID')
    .reduce((s: number, c: any) => s + Number(c.commissionAmount || 0), 0);
  const totalPaidOut = payouts
    .filter((p: any) => p.status === 'PAID')
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  return {
    partner: serializePartner(partner),
    summary: {
      customersBrought: companies.length,
      referralRows: referrals.length,
      totalRevenueCollected: totalRevenue,
      totalCommissionEarned: totalCommission,
      pendingCommission,
      paidCommission,
      totalPaidOut,
      commissionPercent: Number(partner.commissionPercent || 0),
    },
    companies,
    referrals,
    commissions,
    payouts,
    claims,
  };
}

export async function getInvestorDashboard(partnerId: number) {
  const partner = await (prisma as any).partner.findUnique({ where: { id: partnerId } });
  if (!partner || partner.type !== 'INVESTOR') return null;

  const [updates, documents, platform] = await Promise.all([
    (prisma as any).investorUpdate.findMany({
      where: {
        isPublished: true,
        OR: [{ partnerId: null }, { partnerId }],
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    }),
    (prisma as any).partnerDocument.findMany({
      where: { partnerId },
      orderBy: { createdAt: 'desc' },
    }),
    getPlatformInvestorMetrics(),
  ]);

  return {
    partner: serializePartner(partner),
    investment: {
      amount: Number(partner.investmentAmount || 0),
      equityPercent: Number(partner.equityPercent || 0),
      currency: partner.investmentCurrency || 'USD',
      date: partner.investmentDate,
      boardObserver: partner.boardObserver,
      termSheetUrl: partner.termSheetUrl,
      dataRoomNotes: partner.dataRoomNotes,
    },
    platformMetrics: platform,
    updates,
    documents,
  };
}

async function getPlatformInvestorMetrics() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [companies, activeSubs, monthRevenueAgg, allRevenueAgg, users] = await Promise.all([
    (prisma as any).company.count(),
    (prisma as any).company.count({
      where: { subscriptionStatus: { in: ['active', 'trialing'] } },
    }),
    (prisma as any).billingRecord.aggregate({
      where: {
        amountPaid: { gt: 0 },
        OR: [{ billingDate: { gte: monthStart } }, { createdAt: { gte: monthStart } }],
      },
      _sum: { amountPaid: true },
    }),
    (prisma as any).billingRecord.aggregate({
      where: { amountPaid: { gt: 0 } },
      _sum: { amountPaid: true },
    }),
    (prisma as any).user.count({ where: { role: 'OWNER' } }),
  ]);

  const mrr = Number(monthRevenueAgg?._sum?.amountPaid || 0);
  const totalRevenue = Number(allRevenueAgg?._sum?.amountPaid || 0);

  return {
    totalCompanies: companies,
    activeSubscriptions: activeSubs,
    ownerAccounts: users,
    mrrApprox: mrr,
    arrApprox: mrr * 12,
    lifetimeRevenue: totalRevenue,
    asOf: now.toISOString(),
  };
}

export function serializePartner(p: any) {
  if (!p) return null;
  return {
    id: p.id,
    type: p.type,
    status: p.status,
    email: p.email,
    firstName: p.firstName,
    lastName: p.lastName,
    companyName: p.companyName,
    phone: p.phone,
    referralCode: p.referralCode,
    commissionPercent: Number(p.commissionPercent || 0),
    notes: p.notes,
    payoutDetails: p.payoutDetails,
    investmentAmount: p.investmentAmount != null ? Number(p.investmentAmount) : null,
    equityPercent: p.equityPercent != null ? Number(p.equityPercent) : null,
    investmentDate: p.investmentDate,
    investmentCurrency: p.investmentCurrency,
    boardObserver: p.boardObserver,
    termSheetUrl: p.termSheetUrl,
    dataRoomNotes: p.dataRoomNotes,
    lastLoginAt: p.lastLoginAt,
    createdAt: p.createdAt,
  };
}
