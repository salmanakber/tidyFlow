import { NextRequest, NextResponse } from 'next/server';
import { classifyAndStoreReply } from '@/lib/sales-agent/replies';
import { saLog } from '@/lib/sales-agent/logger';
import { jsonOk, jsonError } from '@/lib/sales-agent/auth';

/**
 * Inbound reply webhook (Brevo inbound parse, email forwarder, or Zapier/Make).
 *
 * Auth: ?secret=SALES_AGENT_INBOUND_SECRET or header X-Sales-Agent-Secret
 *
 * Body (JSON):
 * { fromEmail, fromName?, subject?, bodyText?, bodyHtml?, messageId?, inReplyTo?, threadId? }
 */
export async function POST(request: NextRequest) {
  const expected = process.env.SALES_AGENT_INBOUND_SECRET;
  const secret =
    request.nextUrl.searchParams.get('secret') ||
    request.headers.get('x-sales-agent-secret') ||
    '';

  if (expected && secret !== expected) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  let body: any = {};
  const contentType = request.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    } else {
      body = await request.json().catch(() => ({}));
    }
  } catch {
    return jsonError('Invalid body');
  }

  // Brevo / common provider field aliases
  const fromEmail =
    body.fromEmail ||
    body.from ||
    body.sender?.email ||
    body.From ||
    (typeof body.from === 'object' ? body.from?.email : null);

  const fromName =
    body.fromName || body.sender?.name || body.from?.name || undefined;

  const subject = body.subject || body.Subject || undefined;
  const bodyText = body.bodyText || body.text || body.TextBody || body['body-plain'] || undefined;
  const bodyHtml = body.bodyHtml || body.html || body.HtmlBody || body['body-html'] || undefined;
  const messageId = body.messageId || body.MessageID || body['Message-Id'] || undefined;
  const inReplyTo = body.inReplyTo || body['In-Reply-To'] || body.in_reply_to || undefined;
  const threadId = body.threadId || body.thread_id || undefined;

  if (!fromEmail || typeof fromEmail !== 'string') {
    return jsonError('fromEmail is required');
  }

  // Normalize "Name <email@x.com>"
  const emailMatch = fromEmail.match(/[\w.+-]+@[\w.-]+\.\w+/);
  const email = (emailMatch ? emailMatch[0] : fromEmail).toLowerCase();

  const reply = await classifyAndStoreReply({
    fromEmail: email,
    fromName,
    subject,
    bodyText,
    bodyHtml,
    messageId,
    inReplyTo,
    threadId,
  });

  await saLog({
    category: 'reply',
    action: 'inbound_webhook',
    message: `Inbound reply from ${email}`,
    entityType: 'SaReply',
    entityId: reply.id,
  });

  return jsonOk(reply, 201);
}
