import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });

  const { id } = await params;
  const itemId = Number(id);
  const existing = await prisma.supplyItem.findFirst({
    where: { id: itemId, companyId },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Supply not found' }, { status: 404 });
  }

  const body = await request.json();
  const { name, unit, currentStock, minStock, isActive } = body;

  const updated = await prisma.supplyItem.update({
    where: { id: itemId },
    data: {
      ...(name !== undefined && { name }),
      ...(unit !== undefined && { unit }),
      ...(currentStock !== undefined && { currentStock: Number(currentStock) }),
      ...(minStock !== undefined && { minStock: Number(minStock) }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });

  const { id } = await params;
  const itemId = Number(id);
  const existing = await prisma.supplyItem.findFirst({
    where: { id: itemId, companyId },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Supply not found' }, { status: 404 });
  }

  await prisma.supplyItem.update({
    where: { id: itemId },
    data: { isActive: false },
  });

  return NextResponse.json({ success: true, message: 'Supply archived' });
}
