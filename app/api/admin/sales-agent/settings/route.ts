import { NextRequest, NextResponse } from 'next/server';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import {
  getAllSettingsMasked,
  getDiscoveryConfig,
  getSalesAgentSmtpConfig,
  upsertSettings,
} from '@/lib/sales-agent/config';
import { getReplyInboxConfig } from '@/lib/sales-agent/reply-sync';
import { saLog } from '@/lib/sales-agent/logger';
import { enqueueSyncReplies } from '@/lib/sales-agent/queue';
import {
  testSmtpConnection,
  testImapConnection,
  sendTestSalesEmail,
  testReplySync,
  runEmailDiagnostics,
} from '@/lib/sales-agent/connection-test';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const smtp = await getSalesAgentSmtpConfig();
  const discovery = await getDiscoveryConfig();
  const replyInbox = await getReplyInboxConfig();
  const settings = await getAllSettingsMasked();

  return jsonOk({
    smtp: {
      ...smtp,
      password: smtp.password ? '••••••••' : '',
      hasPassword: !!smtp.password,
    },
    replyInbox: {
      ...replyInbox,
      password: replyInbox.password ? '••••••••' : '',
      hasPassword: !!replyInbox.password,
    },
    discovery: {
      ...discovery,
      googlePlacesApiKey: discovery.googlePlacesApiKey ? '••••••••' : '',
      hasGooglePlacesKey: !!discovery.googlePlacesApiKey,
    },
    settings,
  });
}

export async function PUT(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  const entries: Array<{ key: string; value: string; category: any; encrypt?: boolean }> = [];

  const map: Array<[string, string, any, boolean?]> = [
    ['smtpHost', 'smtp_host', 'smtp'],
    ['smtpPort', 'smtp_port', 'smtp'],
    ['smtpUsername', 'smtp_username', 'smtp'],
    ['smtpPassword', 'smtp_password', 'smtp', true],
    ['senderEmail', 'sender_email', 'smtp'],
    ['senderName', 'sender_name', 'smtp'],
    ['replyToEmail', 'reply_to_email', 'smtp'],
    ['replyImapEnabled', 'reply_imap_enabled', 'smtp'],
    ['replyImapHost', 'reply_imap_host', 'smtp'],
    ['replyImapPort', 'reply_imap_port', 'smtp'],
    ['replyImapUser', 'reply_imap_user', 'smtp'],
    ['replyImapPassword', 'reply_imap_password', 'smtp', true],
    ['replyImapTls', 'reply_imap_tls', 'smtp'],
    ['dailyEmailLimit', 'daily_email_limit', 'limits'],
    ['hourlyEmailLimit', 'hourly_email_limit', 'limits'],
    ['googlePlacesApiKey', 'google_places_api_key', 'discovery', true],
    ['searchEngine', 'search_engine', 'discovery'],
    ['searchDelayMs', 'search_delay_ms', 'discovery'],
    ['maxResults', 'max_results', 'discovery'],
    ['concurrentWorkers', 'concurrent_workers', 'discovery'],
    ['bookingLink', 'booking_link', 'discovery'],
  ];

  for (const [bodyKey, dbKey, category, encrypt] of map) {
    if (body[bodyKey] !== undefined && body[bodyKey] !== null) {
      entries.push({ key: dbKey, value: String(body[bodyKey]), category, encrypt });
    }
  }

  await upsertSettings(entries, gate.userId);
  await saLog({
    category: 'user',
    action: 'settings_updated',
    message: 'Sales agent settings updated',
    userId: gate.userId,
  });

  return jsonOk({ saved: true });
}

export async function POST(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (action === 'sync_replies') {
    const queued = await enqueueSyncReplies();
    return jsonOk({ queued });
  }

  if (action === 'test_smtp') {
    return jsonOk(await testSmtpConnection());
  }

  if (action === 'test_imap') {
    return jsonOk(await testImapConnection());
  }

  if (action === 'test_send') {
    const toEmail = body.toEmail || body.to || gate.email;
    if (!toEmail) return jsonError('toEmail is required (e.g. tidyflaw@gmail.com)');
    return jsonOk(await sendTestSalesEmail({ toEmail, userId: gate.userId }));
  }

  if (action === 'test_reply_sync') {
    return jsonOk(await testReplySync());
  }

  if (action === 'test_all') {
    return jsonOk(
      await runEmailDiagnostics({
        sendTo: body.toEmail || body.to || undefined,
        userId: gate.userId,
      })
    );
  }

  return jsonOk({ ok: true });
}
