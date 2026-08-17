import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyIdAsync, requireCompanyBillingAccess } from '@/lib/rbac';
import {
  getCompanyInvoiceSettings,
  upsertCompanyInvoiceSettings,
  type CompanyInvoiceSettingsDTO,
} from '@/lib/invoice-settings';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Please sign in to continue.' }, { status: 401 });

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'No company is linked to this account yet.' }, { status: 400 });
  }

  const settings = await getCompanyInvoiceSettings(companyId);
  return NextResponse.json({ success: true, data: settings });
}

export async function PATCH(request: NextRequest) {
  const access = await requireCompanyBillingAccess(request);
  if (access.response) return access.response;
  const companyId = access.companyId;

  try {
    const body = (await request.json()) as Partial<CompanyInvoiceSettingsDTO>;
    const saved = await upsertCompanyInvoiceSettings(companyId, body);
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    console.error('Invoice settings PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Failed to save invoice settings' }, { status: 500 });
  }
}
