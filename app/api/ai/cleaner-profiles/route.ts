import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { recalculateCleanerProfile } from '@/lib/ai';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const userId = request.nextUrl.searchParams.get('userId');

  const profiles = await prisma.cleanerAIProfile.findMany({
    where: {
      companyId,
      ...(userId ? { userId: Number(userId) } : {}),
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { qualityScore: 'desc' },
  });

  return NextResponse.json({
    success: true,
    data: profiles.map((p) => ({
      ...p,
      strengths: p.strengths ? JSON.parse(p.strengths) : [],
      weaknesses: p.weaknesses ? JSON.parse(p.weaknesses) : [],
      preferredTaskTypes: p.preferredTaskTypes ? JSON.parse(p.preferredTaskTypes) : [],
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const body = await request.json();
  const { userId } = body;

  if (userId) {
    const profile = await recalculateCleanerProfile(Number(userId), companyId);
    return NextResponse.json({ success: true, data: profile });
  }

  const cleaners = await prisma.user.findMany({
    where: { companyId, role: 'CLEANER', isActive: true },
    select: { id: true },
  });

  for (const c of cleaners) {
    await recalculateCleanerProfile(c.id, companyId);
  }

  return NextResponse.json({ success: true, data: { recalculated: cleaners.length } });
}
