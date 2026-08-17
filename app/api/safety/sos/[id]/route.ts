import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (
    role !== UserRole.MANAGER &&
    role !== UserRole.COMPANY_ADMIN &&
    role !== UserRole.OWNER &&
    role !== UserRole.SUPER_ADMIN
  ) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const id = Number(params.id);
  const body = await request.json();
  const { status, notes } = body as { status?: string; notes?: string };

  const alert = await prisma.sOSAlert.findUnique({ where: { id } });
  if (!alert) {
    return NextResponse.json({ success: false, message: 'Alert not found' }, { status: 404 });
  }

  const companyId = requireCompanyScope(tokenUser);
  if (companyId && alert.companyId !== companyId) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const updated = await prisma.sOSAlert.update({
    where: { id },
    data: {
      status: status || alert.status,
      notes: notes ?? alert.notes,
      acknowledgedBy: tokenUser.userId,
      acknowledgedAt: new Date(),
      resolvedAt: status === 'resolved' ? new Date() : alert.resolvedAt,
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
