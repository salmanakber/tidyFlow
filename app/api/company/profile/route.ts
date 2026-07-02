import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { getCompanyInvoiceSettings, upsertCompanyInvoiceSettings } from '@/lib/invoice-settings';
import {
  SUPPORTED_ADDRESS_COUNTRIES,
  normalizeAddressCountryCode,
  getCompanyAddressCountry,
} from '@/lib/address-country';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) {
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
  }

  const invoice = await getCompanyInvoiceSettings(companyId);
  const addressCountry = await getCompanyAddressCountry(companyId);

  return NextResponse.json({
    success: true,
    data: {
      companyId,
      companyName: company.name,
      companyDisplayName: invoice.companyDisplayName,
      address: invoice.address,
      phone: invoice.phone,
      email: invoice.email,
      website: invoice.website,
      addressCountry,
      countries: SUPPORTED_ADDRESS_COUNTRIES,
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
      { success: false, message: 'Only the company owner can update company details' },
      { status: 403 }
    );
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const body = await request.json();
  const {
    companyName,
    companyDisplayName,
    address,
    phone,
    email,
    website,
    addressCountry,
  } = body;

  if (companyName !== undefined) {
    const name = String(companyName).trim();
    if (!name) {
      return NextResponse.json({ success: false, message: 'Company name is required' }, { status: 400 });
    }
    await prisma.company.update({ where: { id: companyId }, data: { name } });
  }

  const invoicePatch: Record<string, string | null> = {};
  if (companyDisplayName !== undefined) {
    invoicePatch.companyDisplayName = String(companyDisplayName).trim() || null;
  }
  if (address !== undefined) invoicePatch.address = String(address).trim() || null;
  if (phone !== undefined) invoicePatch.phone = String(phone).trim() || null;
  if (email !== undefined) invoicePatch.email = String(email).trim() || null;
  if (website !== undefined) invoicePatch.website = String(website).trim() || null;

  if (Object.keys(invoicePatch).length) {
    await upsertCompanyInvoiceSettings(companyId, invoicePatch);
  }

  if (addressCountry !== undefined) {
    const code = normalizeAddressCountryCode(addressCountry);
    if (!code) {
      return NextResponse.json({ success: false, message: 'Unsupported country code' }, { status: 400 });
    }
    await prisma.adminConfiguration.upsert({
      where: { companyId },
      create: { companyId, addressCountry: code },
      update: { addressCountry: code },
    });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  const invoice = await getCompanyInvoiceSettings(companyId);
  const resolvedCountry = await getCompanyAddressCountry(companyId);

  return NextResponse.json({
    success: true,
    data: {
      companyId,
      companyName: company?.name || '',
      companyDisplayName: invoice.companyDisplayName,
      address: invoice.address,
      phone: invoice.phone,
      email: invoice.email,
      website: invoice.website,
      addressCountry: resolvedCountry,
      countries: SUPPORTED_ADDRESS_COUNTRIES,
    },
    message: 'Company details updated',
  });
}
