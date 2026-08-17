import { NextRequest, NextResponse } from 'next/server';
import { verifySpreadsheet } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const { sheetUrl } = await request.json();
    if (!sheetUrl) {
      return NextResponse.json({ success: false, message: 'sheetUrl required' }, { status: 400 });
    }
    const data = await verifySpreadsheet(sheetUrl);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to verify sheet' },
      { status: 400 }
    );
  }
}
