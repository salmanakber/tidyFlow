import { type NextRequest, NextResponse } from 'next/server';
import { sendWeeklyComplianceDigest, scanComplianceExpiryAlerts } from '@/lib/compliance-alerts';

/**
 * Weekly cron: compliance digest + expiry scan fallback.
 * Also safe to hit manually with CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'development-secret';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const mode = request.nextUrl.searchParams.get('mode') || 'digest';
    if (mode === 'scan') {
      const scan = await scanComplianceExpiryAlerts();
      return NextResponse.json({ success: true, data: { mode: 'scan', ...scan } });
    }

    const [digest, scan] = await Promise.all([
      sendWeeklyComplianceDigest(),
      scanComplianceExpiryAlerts(),
    ]);

    return NextResponse.json({
      success: true,
      data: { mode: 'digest', digest, scan },
    });
  } catch (error) {
    console.error('Compliance digest cron error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
