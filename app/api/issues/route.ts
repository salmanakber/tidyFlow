import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/issues?status=&severity=
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || undefined;
  const severity = searchParams.get('severity') || undefined;

  try {
    const issues = await prisma.note.findMany({
      where: {
        noteType: 'issue',
        task: { companyId },
        ...(status ? { status: status as any } : {}),
        ...(severity ? { severity: severity as any } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        task: {
          select: {
            id: true,
            title: true,
            property: { select: { address: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: issues });
  } catch (error) {
    console.error('[issues GET]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
