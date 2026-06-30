import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import {
  getCompanyInvoiceSettings,
  upsertCompanyInvoiceSettings,
  type CompanyInvoiceSettingsDTO,
} from '@/lib/invoice-settings';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const settings = await getCompanyInvoiceSettings(companyId);
  return NextResponse.json({ success: true, data: settings });
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!['OWNER', 'SUPER_ADMIN', 'DEVELOPER'].includes(role)) {
    return NextResponse.json(
      { success: false, message: 'Only the company owner can update invoice settings' },
      { status: 403 }
    );
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as Partial<CompanyInvoiceSettingsDTO>;
    const saved = await upsertCompanyInvoiceSettings(companyId, body);
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error('Invoice settings PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Failed to save invoice settings' }, { status: 500 });
  }
}
