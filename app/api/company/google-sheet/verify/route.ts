import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { verifySpreadsheet } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  try {
    const { sheetUrl } = await request.json();
    if (!sheetUrl) {
      return NextResponse.json({ success: false, message: 'sheetUrl required' }, { status: 400 });
    }
    const data = await verifySpreadsheet(sheetUrl);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || 'Failed to verify sheet' }, { status: 400 });
  }
}
