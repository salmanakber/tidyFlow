import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(_request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const existing = await prisma.notification.findFirst({
    where: { id, userId: auth.tokenUser.userId },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { status: 'read', readAt: new Date() },
  });

  return NextResponse.json({ success: true, data: updated });
}
