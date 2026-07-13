import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import {
  connectCompanySheet,
  getCompanySheetConnection,
  registerSheetWatch,
} from '@/lib/google-sheets';
import { requireGoogleSheetsFeature } from '@/lib/subscription';
import { UserRole } from '@prisma/client';

export async function POST(request: NextRequest) {
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

  const planFeature = await requireGoogleSheetsFeature(companyId);
  if (!planFeature.allowed) {
    return NextResponse.json({ success: false, message: planFeature.message }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { sheetUrl, propertiesTab, tasksTab, propertiesMapping, tasksMapping, uniqueColumn } = body;
    if (!sheetUrl) {
      return NextResponse.json({ success: false, message: 'sheetUrl required' }, { status: 400 });
    }

    const existing = await getCompanySheetConnection(companyId);
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Your company already has a Google Sheet connected. Disconnect it before connecting a different one.',
        },
        { status: 409 }
      );
    }

    const connection = await connectCompanySheet(companyId, {
      sheetUrl,
      propertiesTab,
      tasksTab,
      propertiesMapping,
      tasksMapping,
      uniqueColumn,
    });

    const webhookBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (webhookBase) {
      try {
        await registerSheetWatch(companyId, `${webhookBase}/api/company/google-sheet/webhook`);
      } catch (e) {
        console.warn('Sheet watch registration failed (sync still works):', e);
      }
    }

    return NextResponse.json({ success: true, data: connection }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to connect sheet' },
      { status: 400 }
    );
  }
}
