import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { getAllSubscriptionPlansForAdmin, upsertSubscriptionPlanTier } from '@/lib/subscription';

function isPlatformAdmin(role: unknown) {
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

  try {
    const updated = await upsertSubscriptionPlanTier(String(tier), fields);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  return PATCH(request);
}

export async function DELETE(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth || !isPlatformAdmin(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const tier = request.nextUrl.searchParams.get('tier');
  if (!tier) {
    return NextResponse.json({ success: false, message: 'tier query param required' }, { status: 400 });
  }

  const tierUpper = tier.toUpperCase();
  if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tierUpper)) {
    return NextResponse.json({ success: false, message: 'Invalid tier' }, { status: 400 });
  }

  const existing = await prisma.subscriptionPlanLimit.findUnique({ where: { tier: tierUpper } });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Plan not found' }, { status: 404 });
  }

  await prisma.subscriptionPlanLimit.delete({ where: { tier: tierUpper } });
  return NextResponse.json({ success: true, message: `${tierUpper} removed` });
}
