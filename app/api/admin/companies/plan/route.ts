import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

function isPlatformAdmin(role: string) {
  return [UserRole.SUPER_ADMIN, UserRole.DEVELOPER, UserRole.ADMIN_UNIQUE].includes(role as UserRole);
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth || !isPlatformAdmin(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { companyId, planTier } = body;
  if (!companyId || !planTier) {
    return NextResponse.json({ success: false, message: 'companyId and planTier required' }, { status: 400 });
  }

  const tier = String(planTier).toUpperCase();
  if (!['STARTUP', 'STANDARD', 'PREMIUM'].includes(tier)) {
    return NextResponse.json({ success: false, message: 'Invalid plan tier' }, { status: 400 });
  }

  const company = await prisma.company.update({
    where: { id: Number(companyId) },
    data: { planTier: tier },
    select: { id: true, name: true, planTier: true },
  });

  return NextResponse.json({ success: true, data: company });
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth || !isPlatformAdmin(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, planTier: true, subscriptionStatus: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ success: true, data: companies });
}
