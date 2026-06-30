import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { scheduleCompanySheetSync } from '@/lib/google-sheets';

/**
 * Google Drive push notification webhook.
 * Google sends metadata in headers (not body). Resource states:
 * - sync: watch verification when channel is created — ack only
 * - update / change: spreadsheet was modified — debounced sync + socket events
 */
export async function POST(request: NextRequest) {
  const channelId = request.headers.get('x-goog-channel-id');
  const resourceId = request.headers.get('x-goog-resource-id');
  const resourceState = (request.headers.get('x-goog-resource-state') || '').toLowerCase();

  if (!channelId || !resourceId) {
    return NextResponse.json({ success: false, message: 'Invalid webhook' }, { status: 400 });
  }

  const connection = await prisma.companyGoogleSheet.findFirst({
    where: { watchChannelId: channelId, watchResourceId: resourceId },
  });

  if (!connection) {
    return NextResponse.json({ success: true, message: 'Unknown channel — ignored' });
  }

  // Initial watch handshake — no data changed yet
  if (resourceState === 'sync') {
    return NextResponse.json({ success: true, message: 'Watch verified', companyId: connection.companyId });
  }

  // Acknowledge immediately; sync runs debounced in background (Google expects fast 200)
  scheduleCompanySheetSync(connection.companyId).catch(async (error: Error) => {
    console.error('[sheet-webhook] sync failed for company', connection.companyId, error.message);
    await prisma.companyGoogleSheet.update({
      where: { companyId: connection.companyId },
      data: { lastSyncError: error.message },
    });
  });

  return NextResponse.json({
    success: true,
    message: 'Sync scheduled',
    companyId: connection.companyId,
    resourceState: resourceState || 'update',
  });
}

/** Google may probe with GET during setup */
export async function GET() {
  return NextResponse.json({ success: true, message: 'Google Sheet webhook active' });
}
