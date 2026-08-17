import { NextRequest, NextResponse } from 'next/server';
import {
  getInvestorDashboard,
  getMarketerDashboard,
  requirePartnerAuth,
  syncPartnerCommissions,
} from '@/lib/partners';

/** GET /api/partner/dashboard */
export async function GET(request: NextRequest) {
  const auth = requirePartnerAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  if (auth.type === 'INVESTOR') {
    const dash = await getInvestorDashboard(auth.partnerId);
    return NextResponse.json({ success: true, data: dash });
  }

  await syncPartnerCommissions(auth.partnerId).catch(() => null);
  const dash = await getMarketerDashboard(auth.partnerId);
  return NextResponse.json({ success: true, data: dash });
}
