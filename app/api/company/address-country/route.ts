import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope, resolveCompanyIdAsync } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import {
  SUPPORTED_ADDRESS_COUNTRIES,
  normalizeAddressCountryCode,
  resolveCompanyAddressCountry,
} from '@/lib/address-country';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const deviceRegion = searchParams.get('deviceRegion');
  const autoDetect = searchParams.get('autoDetect') !== 'false';

  const resolved = autoDetect
    ? await resolveCompanyAddressCountry(companyId, deviceRegion)
    : {
        countryCode: normalizeAddressCountryCode(
          (
            await prisma.adminConfiguration.findUnique({
              where: { companyId },
              select: { addressCountry: true },
            })
          )?.addressCountry
        ) || 'GB',
        autoDetected: false,
        persisted: false,
      };

  return NextResponse.json({
    success: true,
    data: {
      countryCode: resolved.countryCode,
      autoDetected: resolved.autoDetected,
      countries: SUPPORTED_ADDRESS_COUNTRIES,
      companyId,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (auth.tokenUser.role !== UserRole.OWNER) {
    return NextResponse.json(
      { success: false, message: 'Only the company owner can change address country settings' },
      { status: 403 }
    );
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const body = await request.json();
  const countryCode = normalizeAddressCountryCode(body.countryCode);
  if (!countryCode) {
    return NextResponse.json({ success: false, message: 'Unsupported country code' }, { status: 400 });
  }

  const updated = await prisma.adminConfiguration.upsert({
    where: { companyId },
    create: { companyId, addressCountry: countryCode },
    update: { addressCountry: countryCode },
    select: { addressCountry: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      countryCode: updated.addressCountry || countryCode,
      companyId,
    },
    message: 'Company address country updated for all team members',
  });
}
