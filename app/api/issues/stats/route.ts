import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/issues/stats
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (role === UserRole.CLEANER) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
  }

  try {
    const [open, inProgress, resolved, high] = await Promise.all([
      prisma.note.count({ where: { noteType: 'issue', status: 'OPEN', task: { companyId } } }),
      prisma.note.count({ where: { noteType: 'issue', status: 'IN_PROGRESS', task: { companyId } } }),
      prisma.note.count({ where: { noteType: 'issue', status: 'RESOLVED', task: { companyId } } }),
      prisma.note.count({ where: { noteType: 'issue', severity: 'HIGH', status: { not: 'RESOLVED' }, task: { companyId } } }),
    ]);

    return NextResponse.json({
      success: true,
      data: { open, inProgress, resolved, high, total: open + inProgress + resolved },
    });
  } catch (error) {
    console.error('[issues stats GET]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
