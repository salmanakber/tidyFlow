import { NextRequest, NextResponse } from 'next/server';
import { requireSalesAgentAdmin, jsonOk, jsonError } from '@/lib/sales-agent/auth';
import {
  getAllSettingsMasked,
  getDiscoveryConfig,
  getResendSmtpConfig,
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
  testResendSmtpConnection,
  sendTestResendEmail,
  testGooglePlacesConnection,
} from '@/lib/sales-agent/connection-test';

export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  const smtp = await getSalesAgentSmtpConfig();
  const resend = await getResendSmtpConfig();
  const discovery = await getDiscoveryConfig();
  const replyInbox = await getReplyInboxConfig();
  const settings = await getAllSettingsMasked();
  const { getSettingsByCategory } = await import('@/lib/sales-agent/config');
  const general = await getSettingsByCategory('general');

  return jsonOk({
    smtp: {
      ...smtp,
      password: smtp.password ? '••••••••' : '',
      hasPassword: !!smtp.password,
    },
    resend: {
      ...resend,
      apiKey: resend.apiKey ? '••••••••' : '',
      hasApiKey: !!resend.apiKey,
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
    templateDefaults: {
      defaultContactName: general.default_contact_name || '',
      defaultPersonalizedIntro: general.default_personalized_intro || '',
      defaultServices: general.default_services || '',
      defaultCity: general.default_city || '',
      defaultCompanyName: general.default_company_name || '',
      senderName: smtp.senderName,
      bookingLink: discovery.bookingLink,
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
    ['resendEnabled', 'resend_enabled', 'smtp'],
    ['resendHost', 'resend_host', 'smtp'],
    ['resendPort', 'resend_port', 'smtp'],
    ['resendUsername', 'resend_username', 'smtp'],
    ['resendApiKey', 'resend_api_key', 'smtp', true],
    ['resendSenderEmail', 'resend_sender_email', 'smtp'],
    ['resendSenderName', 'resend_sender_name', 'smtp'],
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
    ['defaultContactName', 'default_contact_name', 'general'],
    ['defaultPersonalizedIntro', 'default_personalized_intro', 'general'],
    ['defaultServices', 'default_services', 'general'],
    ['defaultCity', 'default_city', 'general'],
    ['defaultCompanyName', 'default_company_name', 'general'],
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

  if (action === 'test_resend_smtp') {
    return jsonOk(await testResendSmtpConnection());
  }

  if (action === 'test_imap') {
    return jsonOk(await testImapConnection());
  }

  if (action === 'test_send') {
    const toEmail = body.toEmail || body.to || gate.email;
    if (!toEmail) return jsonError('toEmail is required (e.g. tidyflaw@gmail.com)');
    return jsonOk(await sendTestSalesEmail({ toEmail, userId: gate.userId }));
  }

  if (action === 'test_resend_send') {
    const toEmail = body.toEmail || body.to || gate.email;
    if (!toEmail) return jsonError('toEmail is required (e.g. tidyflaw@gmail.com)');
    return jsonOk(await sendTestResendEmail({ toEmail, userId: gate.userId }));
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

  if (action === 'test_google_places') {
    const override =
      typeof body.googlePlacesApiKey === 'string' && body.googlePlacesApiKey.trim()
        ? body.googlePlacesApiKey.trim()
        : undefined;
    return jsonOk(
      await testGooglePlacesConnection({
        apiKey: override,
        userId: gate.userId,
      })
    );
  }

  return jsonOk({ ok: true });
}
