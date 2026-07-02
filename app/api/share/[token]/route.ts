import { NextRequest, NextResponse } from 'next/server';
import { getSharePortalData } from '@/lib/share-portal';

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const result = await getSharePortalData(params.token);
  if (result.ok === false) {
    return NextResponse.json({ success: false, message: result.message }, { status: result.status });
  }
  return NextResponse.json({ success: true, data: result.data });
}
