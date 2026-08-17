import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import {
  connectCompanySheet,
  disconnectCompanySheet,
  getCompanySheetConnection,
  getServiceAccountEmail,
  isGoogleSheetsConfigured,
  SHEET_TEMPLATE,
  syncCompanySheet,
  verifySpreadsheet,
} from '@/lib/google-sheets';
import { UserRole } from '@prisma/client';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const connection = await getCompanySheetConnection(companyId);
  return NextResponse.json({
    success: true,
    data: {
      connected: !!connection,
      connection,
      serviceAccountEmail: getServiceAccountEmail(),
      configured: isGoogleSheetsConfigured(),
      template: SHEET_TEMPLATE,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'DEVELOPER'].includes(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  await disconnectCompanySheet(companyId);
  return NextResponse.json({ success: true, message: 'Google Sheet disconnected' });
}
