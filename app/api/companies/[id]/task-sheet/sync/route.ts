import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import {
  getCompanySheetConnection,
  registerSheetWatch,
  saveMasterSheetConfiguration,
  saveTaskSheetConfiguration,
  syncCompanyGoogleSheet,
} from '@/lib/google-sheets';
import { UserRole } from '@prisma/client';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN', 'DEVELOPER'].includes(role)) {
    return NextResponse.json(
      { success: false, message: 'Only owners and managers can configure Google Sheets sync' },
      { status: 403 }
    );
  }

  const companyId = Number(params.id);
  const tokenCompanyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (tokenCompanyId && tokenCompanyId !== companyId) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      syncOnly,
      templateMode,
      spreadsheetId,
      sheetName,
      propertiesTab,
      tasksTab,
      columnMapping,
      propertyIdColumn,
      actionColumn,
      sheetUrl,
    } = body;

    if (syncOnly) {
      const conn = await getCompanySheetConnection(companyId);
      if (!conn) {
        return NextResponse.json({ success: false, message: 'No sheet configuration found' }, { status: 404 });
      }
      const importResult = await syncCompanyGoogleSheet(companyId);
      return NextResponse.json({ success: true, data: { importResult } });
    }

    if (templateMode) {
      if (!sheetUrl || !propertiesTab || !tasksTab) {
        return NextResponse.json(
          { success: false, message: 'sheetUrl, propertiesTab, and tasksTab are required' },
          { status: 400 }
        );
      }

      const existing = await getCompanySheetConnection(companyId);
      const resolvedSpreadsheetId = spreadsheetId || existing?.spreadsheetId;
      if (existing && resolvedSpreadsheetId && existing.spreadsheetId !== resolvedSpreadsheetId) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Your company already has a different Google Sheet connected. Disconnect it first in Settings → Google Sheets.',
          },
          { status: 409 }
        );
      }

      await saveMasterSheetConfiguration(companyId, { sheetUrl, propertiesTab, tasksTab });

      const webhookBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
      if (webhookBase) {
        try {
          await registerSheetWatch(companyId, `${webhookBase}/api/company/google-sheet/webhook`);
        } catch {
          /* non-fatal */
        }
      }

      const importResult = await syncCompanyGoogleSheet(companyId);
      return NextResponse.json({
        success: true,
        data: { importResult },
        message: 'Master sheet connected',
      });
    }

    if (!spreadsheetId || !sheetName || !columnMapping || !propertyIdColumn || !actionColumn) {
      return NextResponse.json(
        { success: false, message: 'spreadsheetId, sheetName, columnMapping, propertyIdColumn, actionColumn required' },
        { status: 400 }
      );
    }

    const existing = await getCompanySheetConnection(companyId);
    if (existing && existing.spreadsheetId !== spreadsheetId) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Your company already has a different Google Sheet connected. Disconnect it first in Settings → Google Sheets.',
        },
        { status: 409 }
      );
    }

    await saveTaskSheetConfiguration(companyId, {
      spreadsheetId,
      sheetName,
      sheetUrl,
      columnMapping,
      propertyIdColumn,
      actionColumn,
    });

    const webhookBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (webhookBase) {
      try {
        await registerSheetWatch(companyId, `${webhookBase}/api/company/google-sheet/webhook`);
      } catch {
        /* non-fatal */
      }
    }

    const importResult = await syncCompanyGoogleSheet(companyId);

    return NextResponse.json({
      success: true,
      data: { importResult },
      message: 'Task sheet configuration saved',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Task sheet sync failed' },
      { status: 400 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(_request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = Number(params.id);
  const conn = await getCompanySheetConnection(companyId);
  return NextResponse.json({
    success: !!(conn?.propertiesTab || conn?.propertyIdColumn),
    data: conn,
  });
}
