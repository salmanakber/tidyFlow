import { type NextRequest, NextResponse } from 'next/server';
import { runRebookAlerts } from '@/lib/rebook-alerts';

/** Daily cron: notify managers when a property has no upcoming job and last service was > N days ago. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'development-secret';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const companyIdParam = request.nextUrl.searchParams.get('companyId');
    const thresholdParam = request.nextUrl.searchParams.get('thresholdDays');

    const result = await runRebookAlerts({
      ...(companyIdParam ? { companyId: Number(companyIdParam) } : {}),
      ...(thresholdParam ? { thresholdDays: Number(thresholdParam) } : {}),
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Rebook alerts cron error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
