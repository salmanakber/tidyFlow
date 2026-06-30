import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { requireActiveSubscription } from '@/lib/subscription';
import { UserRole } from '@prisma/client';

type RouteParams = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const subscriptionCheck = await requireActiveSubscription(auth.tokenUser);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({ success: false, message: subscriptionCheck.message }, { status: 403 });
  }

  const id = Number(params.id);
  const role = auth.tokenUser.role as UserRole;
  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;

  const property = await prisma.property.findFirst({
    where: {
      id,
      ...(role !== UserRole.SUPER_ADMIN && role !== UserRole.DEVELOPER && companyId
        ? { companyId }
        : {}),
    },
    include: {
      company: { select: { id: true, name: true } },
    },
  });

  if (!property) {
    return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: { property } });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (![UserRole.OWNER, UserRole.MANAGER, UserRole.COMPANY_ADMIN, UserRole.DEVELOPER, UserRole.SUPER_ADMIN].includes(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const subscriptionCheck = await requireActiveSubscription(auth.tokenUser);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({ success: false, message: subscriptionCheck.message }, { status: 403 });
  }

  const id = Number(params.id);
  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;

  const existing = await prisma.property.findFirst({
    where: {
      id,
      ...(role !== UserRole.SUPER_ADMIN && role !== UserRole.DEVELOPER && companyId
        ? { companyId }
        : {}),
    },
  });

  if (!existing) {
    return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });
  }

  const body = await request.json();
  const {
    address,
    postcode,
    latitude,
    longitude,
    propertyType,
    notes,
    clientName,
    clientEmail,
    clientPhone,
    defaultServiceRate,
    unitCount,
    pricePerUnit,
    googleSheetUrl,
    isActive,
  } = body;

  const property = await prisma.property.update({
    where: { id },
    data: {
      ...(address !== undefined ? { address } : {}),
      ...(postcode !== undefined ? { postcode } : {}),
      ...(latitude !== undefined ? { latitude: Number(latitude) } : {}),
      ...(longitude !== undefined ? { longitude: Number(longitude) } : {}),
      ...(propertyType !== undefined ? { propertyType } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(clientName !== undefined ? { clientName: clientName || null } : {}),
      ...(clientEmail !== undefined ? { clientEmail: clientEmail || null } : {}),
      ...(clientPhone !== undefined ? { clientPhone: clientPhone || null } : {}),
      ...(defaultServiceRate !== undefined
        ? { defaultServiceRate: defaultServiceRate ? Number(defaultServiceRate) : null }
        : {}),
      ...(unitCount !== undefined ? { unitCount: Number(unitCount) } : {}),
      ...(pricePerUnit !== undefined ? { pricePerUnit: Number(pricePerUnit) } : {}),
      ...(googleSheetUrl !== undefined ? { googleSheetUrl: googleSheetUrl || null } : {}),
      ...(isActive !== undefined ? { isActive: !!isActive } : {}),
    },
  });

  return NextResponse.json({ success: true, data: { property } });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (![UserRole.OWNER, UserRole.MANAGER, UserRole.COMPANY_ADMIN, UserRole.DEVELOPER, UserRole.SUPER_ADMIN].includes(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const id = Number(params.id);
  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;

  const existing = await prisma.property.findFirst({
    where: {
      id,
      ...(role !== UserRole.SUPER_ADMIN && role !== UserRole.DEVELOPER && companyId
        ? { companyId }
        : {}),
    },
  });

  if (!existing) {
    return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });
  }

  await prisma.property.delete({ where: { id } });

  return NextResponse.json({ success: true, message: 'Property deleted' });
}
