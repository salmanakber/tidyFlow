import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });

  const items = await prisma.supplyItem.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ success: true, data: items });
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });

  const body = await request.json();
  const { name, unit, currentStock, minStock } = body;

  if (!name) return NextResponse.json({ success: false, message: 'name required' }, { status: 400 });

  const item = await prisma.supplyItem.create({
    data: {
      companyId,
      name: String(name).trim(),
      unit: unit || 'units',
      currentStock: currentStock ?? 0,
      minStock: minStock ?? 5,
    },
  });

  return NextResponse.json({ success: true, data: item }, { status: 201 });
}
