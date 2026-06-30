import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { getAllSubscriptionPlansForAdmin } from '@/lib/subscription';
function isPlatformAdmin(role: any) {
  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.DEVELOPER ||
    role === UserRole.ADMIN_UNIQUE
  );
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth || !isPlatformAdmin(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const plans = await getAllSubscriptionPlansForAdmin();
  return NextResponse.json({ success: true, data: plans });
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth || !isPlatformAdmin(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { tier, ...fields } = body;
  if (!tier) {
    return NextResponse.json({ success: false, message: 'tier required' }, { status: 400 });
  }

  const tierUpper = String(tier).toUpperCase();
  if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tierUpper)) {
    return NextResponse.json({ success: false, message: 'Invalid tier' }, { status: 400 });
  }

  const updated = await prisma.subscriptionPlanLimit.upsert({
    where: { tier: tierUpper },
    create: {
      tier: tierUpper,
      label: fields.label || tier,
      maxCleaners: fields.maxCleaners ?? 25,
      maxProperties: fields.maxProperties ?? 50,
      maxManagers: fields.maxManagers ?? 10,
      aiRequestsPerMonth: fields.aiRequestsPerMonth ?? 500,
      aiPhotoAnalysis: fields.aiPhotoAnalysis ?? true,
      aiInsights: fields.aiInsights ?? true,
      aiAssignment: fields.aiAssignment ?? true,
      aiTaskSuggestions: fields.aiTaskSuggestions ?? true,
      invoicesEnabled: fields.invoicesEnabled ?? false,
      maxInvoicesPerMonth: fields.maxInvoicesPerMonth ?? 5,
      aiInvoiceAssist: fields.aiInvoiceAssist ?? false,
      maxPhotoVerificationsPerMonth: fields.maxPhotoVerificationsPerMonth ?? 100,
      maxPdfGenerationsPerMonth: fields.maxPdfGenerationsPerMonth ?? 50,
      monthlyPrice: fields.monthlyPrice != null ? Number(fields.monthlyPrice) : 55,
    },
    update: {
      ...(fields.label !== undefined ? { label: fields.label } : {}),
      ...(fields.maxCleaners !== undefined ? { maxCleaners: Number(fields.maxCleaners) } : {}),
      ...(fields.maxProperties !== undefined ? { maxProperties: Number(fields.maxProperties) } : {}),
      ...(fields.maxManagers !== undefined ? { maxManagers: Number(fields.maxManagers) } : {}),
      ...(fields.aiRequestsPerMonth !== undefined ? { aiRequestsPerMonth: Number(fields.aiRequestsPerMonth) } : {}),
      ...(fields.aiPhotoAnalysis !== undefined ? { aiPhotoAnalysis: !!fields.aiPhotoAnalysis } : {}),
      ...(fields.aiInsights !== undefined ? { aiInsights: !!fields.aiInsights } : {}),
      ...(fields.aiAssignment !== undefined ? { aiAssignment: !!fields.aiAssignment } : {}),
      ...(fields.aiTaskSuggestions !== undefined ? { aiTaskSuggestions: !!fields.aiTaskSuggestions } : {}),
      ...(fields.invoicesEnabled !== undefined ? { invoicesEnabled: !!fields.invoicesEnabled } : {}),
      ...(fields.maxInvoicesPerMonth !== undefined ? { maxInvoicesPerMonth: Number(fields.maxInvoicesPerMonth) } : {}),
      ...(fields.aiInvoiceAssist !== undefined ? { aiInvoiceAssist: !!fields.aiInvoiceAssist } : {}),
      ...(fields.maxPhotoVerificationsPerMonth !== undefined
        ? { maxPhotoVerificationsPerMonth: Number(fields.maxPhotoVerificationsPerMonth) }
        : {}),
      ...(fields.maxPdfGenerationsPerMonth !== undefined
        ? { maxPdfGenerationsPerMonth: Number(fields.maxPdfGenerationsPerMonth) }
        : {}),
      ...(fields.monthlyPrice !== undefined ? { monthlyPrice: Number(fields.monthlyPrice) } : {}),
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
