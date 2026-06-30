import { NextRequest, NextResponse } from 'next/server';
import { extractSpreadsheetId, getSheetHeaders } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const { sheetUrl, sheetName } = await request.json();
    if (!sheetUrl || !sheetName) {
      return NextResponse.json(
        { success: false, message: 'sheetUrl and sheetName required' },
        { status: 400 }
      );
    }
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    if (!spreadsheetId) {
      return NextResponse.json({ success: false, message: 'Invalid Google Sheets URL' }, { status: 400 });
    }
    const headers = await getSheetHeaders(spreadsheetId, sheetName);
    return NextResponse.json({ success: true, data: { headers } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load headers' },
      { status: 400 }
    );
  }
}
