import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync, resolveAuthenticatedUser, isCompanyBillingRole } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/** Company admin configuration (photo watermark, geofence, etc.) */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const queryCompanyId = searchParams.get('companyId');
  const role = auth.tokenUser.role as UserRole;
  let companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (queryCompanyId && ['SUPER_ADMIN', 'DEVELOPER', 'ADMIN_UNIQUE'].includes(role)) {
    companyId = Number(queryCompanyId);
  }
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'No company is linked to this account yet.' }, { status: 400 });
  }

  const config = await prisma.adminConfiguration.findUnique({ where: { companyId } });
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  return NextResponse.json({
    success: true,
    data: config
      ? { ...config, companyName: company?.name ?? null }
      : {
          companyId,
          companyName: company?.name ?? null,
          photoCountRequirement: 20,
          watermarkEnabled: false,
          geofenceRadius: 150,
          timezone: 'UTC',
          currency: 'GBP',
        },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const actor = await resolveAuthenticatedUser(auth.tokenUser);
  const role = (actor?.role || auth.tokenUser.role) as UserRole;
  if (
    !isCompanyBillingRole(role) &&
    !['MANAGER', 'COMPANY_ADMIN'].includes(String(role || '').toUpperCase())
  ) {
    return NextResponse.json({ success: false, message: 'You cannot update these settings.' }, { status: 403 });
  }

  const body = await request.json();
  let companyId = await resolveCompanyIdAsync(request, {
    ...auth.tokenUser,
    role: actor?.role || auth.tokenUser.role,
    companyId: actor?.companyId ?? auth.tokenUser.companyId,
  });
  if (body.companyId && ['SUPER_ADMIN', 'DEVELOPER', 'ADMIN_UNIQUE'].includes(role)) {
    companyId = Number(body.companyId);
  }
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.photoCountRequirement !== undefined) data.photoCountRequirement = Number(body.photoCountRequirement);
  if (body.watermarkEnabled !== undefined) data.watermarkEnabled = !!body.watermarkEnabled;
  if (body.geofenceRadius !== undefined) data.geofenceRadius = Number(body.geofenceRadius);
  if (body.timezone !== undefined) data.timezone = String(body.timezone);
  if (body.currency !== undefined) data.currency = String(body.currency);
  if (body.notificationTemplate !== undefined) data.notificationTemplate = body.notificationTemplate;
  if (body.dataRetentionDays !== undefined) data.dataRetentionDays = Number(body.dataRetentionDays);

  const saved = await prisma.adminConfiguration.upsert({
    where: { companyId },
    create: { companyId, ...data },
    update: data,
  });

  return NextResponse.json({ success: true, data: saved });
}
