import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  const id = Number(params.id);

  const insight = await prisma.aIInsight.findUnique({ where: { id } });
  if (!insight || !companyId || insight.companyId !== companyId) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.aIInsight.update({
    where: { id },
    data: {
      dismissedAt: new Date(),
      dismissedBy: auth.tokenUser.userId,
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
