import nodemailer from 'nodemailer';
import prisma from '@/lib/prisma';
import { getSalesAgentSmtpConfig } from './config';
import { getReplyInboxConfig, syncRepliesFromInbox } from './reply-sync';
import { saLog } from './logger';

/** Verify Brevo SMTP credentials (no email sent). */
export async function testSmtpConnection() {
  const smtp = await getSalesAgentSmtpConfig();
  if (!smtp.host || !smtp.username || !smtp.password) {
    return {
      ok: false,
      step: 'smtp',
      error: 'SMTP host/username/password not configured (Brevo)',
      smtp: { host: smtp.host, port: smtp.port, senderEmail: smtp.senderEmail, replyToEmail: smtp.replyToEmail },
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.username, pass: smtp.password },
    });
    await transporter.verify();
    return {
      ok: true,
      step: 'smtp',
      message: `SMTP OK — connected to ${smtp.host}:${smtp.port}`,
      smtp: {
        host: smtp.host,
        port: smtp.port,
        senderEmail: smtp.senderEmail,
        senderName: smtp.senderName,
        replyToEmail: smtp.replyToEmail || null,
        hasReplyTo: !!smtp.replyToEmail,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      step: 'smtp',
      error: err.message || 'SMTP verification failed',
      smtp: { host: smtp.host, port: smtp.port },
    };
  }
}

/** Verify Gmail IMAP login (App Password). */
export async function testImapConnection() {
  const config = await getReplyInboxConfig();
  if (!config.enabled) {
    return {
      ok: false,
      step: 'imap',
      error: 'IMAP reply sync is disabled — enable it and save settings first',
      imap: { host: config.host, user: config.user, enabled: false },
    };
  }
  if (!config.user || !config.password) {
    return {
      ok: false,
      step: 'imap',
      error: 'IMAP user or App Password missing. Use tidyflaw@gmail.com + Gmail App Password.',
      imap: { host: config.host, user: config.user, enabled: true, hasPassword: false },
    };
  }

  let ImapFlow: any;
  try {
    ImapFlow = (await import('imapflow')).ImapFlow;
  } catch {
    return {
      ok: false,
      step: 'imap',
      error: 'imapflow package not installed. Run: npm i imapflow',
    };
  }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.tls,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });

  try {
    await client.connect();
    const status = await client.status('INBOX', { messages: true, unseen: true });
    await client.logout();
    return {
      ok: true,
      step: 'imap',
      message: `IMAP OK — logged into ${config.user} (${config.host})`,
      imap: {
        host: config.host,
        port: config.port,
        user: config.user,
        messages: status.messages ?? null,
        unseen: status.unseen ?? null,
      },
    };
  } catch (err: any) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      step: 'imap',
      error: err.message || 'IMAP connection failed',
      hint:
        'Use a Gmail App Password (not your normal password). Enable 2-Step Verification first at https://myaccount.google.com/security',
      imap: { host: config.host, user: config.user },
    };
  }
}

/**
 * Send a real test email via Brevo with Reply-To = your Gmail.
 * Creates a sent-email record so reply sync can match when you reply.
 */
export async function sendTestSalesEmail(input: {
  toEmail: string;
  userId?: number;
}) {
  const to = String(input.toEmail || '').trim().toLowerCase();
  if (!to || !to.includes('@')) {
    return { ok: false, step: 'send', error: 'Valid toEmail is required' };
  }

  const smtpCheck = await testSmtpConnection();
  if (!smtpCheck.ok) return { ...smtpCheck, step: 'send' };

  const smtp = await getSalesAgentSmtpConfig();
  if (!smtp.replyToEmail) {
    return {
      ok: false,
      step: 'send',
      error: 'Set Reply-To Email to tidyflaw@gmail.com (or your Gmail) and save before testing',
    };
  }

  // Ensure a test lead exists for tracking
  let lead = await (prisma as any).saLeadCompany.findFirst({
    where: { email: to },
  });
  if (!lead) {
    lead = await (prisma as any).saLeadCompany.create({
      data: {
        name: `Test lead (${to})`,
        email: to,
        hasEmail: true,
        source: 'MANUAL',
        status: 'NEW',
        industry: 'cleaning',
        discoveryKeyword: 'sales-agent-test',
      },
    });
  }

  const subject = `[TidyFlow Sales Agent Test] ${new Date().toISOString().slice(0, 19)}`;
  const textBody = `This is a test email from the TidyFlow AI Sales Agent.

From (Brevo): ${smtp.senderEmail}
Reply-To (your Gmail): ${smtp.replyToEmail}

How to verify reply tracking:
1. Open this email in your inbox.
2. Hit Reply and send any short message (e.g. "interested").
3. Wait ~1 minute, then click "Test reply sync" in Setup (or wait for the 15-min auto sync).
4. The reply should appear under Outreach → Replies, and the lead gets a Replied badge.

Sent at: ${new Date().toISOString()}
`;

  const htmlBody = `<div style="font-family:sans-serif;line-height:1.5;color:#111">
  <p><strong>TidyFlow Sales Agent — test email</strong></p>
  <p>This message was sent via Brevo SMTP.</p>
  <ul>
    <li><strong>From:</strong> ${smtp.senderEmail}</li>
    <li><strong>Reply-To:</strong> ${smtp.replyToEmail}</li>
  </ul>
  <p>Reply to this email to test reply tracking. Then run <em>Test reply sync</em> in Setup.</p>
  <p style="color:#666;font-size:12px">Sent at ${new Date().toISOString()}</p>
</div>`;

  const record = await (prisma as any).saSentEmail.create({
    data: {
      companyId: lead.id,
      recipientEmail: to,
      recipientName: lead.name,
      subject,
      htmlBody,
      textBody,
      deliveryStatus: 'PENDING',
    },
  });

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      requireTLS: smtp.port === 587,
      auth: { user: smtp.username, pass: smtp.password },
    });

    const info = await transporter.sendMail({
      from: `"${smtp.senderName}" <${smtp.senderEmail}>`,
      to,
      replyTo: smtp.replyToEmail,
      subject,
      html: htmlBody,
      text: textBody,
      headers: {
        'X-TidyFlow-Sales-Agent': String(record.id),
        'X-TidyFlow-Test': '1',
      },
      envelope: {
        from: smtp.senderEmail,
        to: [to],
      },
    });

    const accepted = (info.accepted || []).map(String);
    const rejected = (info.rejected || []).map(String);
    const messageId = info.messageId || null;
    const smtpPayload = {
      accepted,
      rejected,
      response: info.response,
      envelope: info.envelope,
      messageId,
      from: smtp.senderEmail,
      replyTo: smtp.replyToEmail,
      test: true,
    };

    // SMTP "accepted" at relay ≠ inbox delivery. Fail clearly if rejected.
    if (rejected.length > 0 || (accepted.length === 0 && !messageId)) {
      await (prisma as any).saSentEmail.update({
        where: { id: record.id },
        data: {
          deliveryStatus: 'FAILED',
          errorMessage: `SMTP rejected: ${rejected.join(', ') || 'no accepted recipients'}`,
          smtpResponse: JSON.stringify(smtpPayload),
        },
      });
      return {
        ok: false,
        step: 'send',
        error: `SMTP rejected recipient: ${rejected.join(', ') || 'none accepted'}`,
        smtpResponse: info.response,
        fromEmail: smtp.senderEmail,
        hint: 'Check Brevo → Senders & Domains: the From email must be verified. Also check Spam.',
        sentEmailId: record.id,
      };
    }

    await (prisma as any).saSentEmail.update({
      where: { id: record.id },
      data: {
        deliveryStatus: 'SENT',
        sentAt: new Date(),
        messageId,
        threadId: messageId,
        smtpResponse: JSON.stringify(smtpPayload),
      },
    });

    await (prisma as any).saLeadCompany.update({
      where: { id: lead.id },
      data: {
        lastContactedAt: new Date(),
        emailSentCount: { increment: 1 },
        status: 'CONTACTED',
      },
    });

    await saLog({
      category: 'smtp',
      action: 'test_email_sent',
      message: `Test email sent to ${to} from ${smtp.senderEmail}`,
      userId: input.userId,
      entityType: 'SaSentEmail',
      entityId: record.id,
      details: smtpPayload,
    });

    const looksLikeDefault =
      /noreply@tidyflowapp\.com/i.test(smtp.senderEmail) ||
      !smtp.senderEmail.includes('@');

    return {
      ok: true,
      step: 'send',
      message: `SMTP accepted mail to ${to}. From: ${smtp.senderEmail} · Reply-To: ${smtp.replyToEmail}`,
      sentEmailId: record.id,
      companyId: lead.id,
      messageId,
      fromEmail: smtp.senderEmail,
      replyToEmail: smtp.replyToEmail,
      smtpResponse: info.response,
      accepted,
      rejected,
      warning: looksLikeDefault
        ? 'From address looks like a default (noreply@tidyflowapp.com). If Brevo has not verified this sender/domain, Gmail may never deliver — verify the sender in Brevo and set From Email in Setup to that verified address.'
        : 'If nothing arrives in Inbox, check Spam/Promotions. In Brevo dashboard → Transactional → Logs, confirm the message was delivered (not blocked/bounced).',
      nextSteps: [
        `Look in Inbox AND Spam for mail From: ${smtp.senderEmail}`,
        'Brevo → Transactional → Email logs: find this send and check status (delivered / deferred / blocked)',
        'If blocked: verify sender domain/email in Brevo → Senders & IP',
        `Confirm Reply-To would be ${smtp.replyToEmail} once delivered`,
        'After you receive it: Reply → then Test reply sync',
      ],
    };
  } catch (err: any) {
    await (prisma as any).saSentEmail.update({
      where: { id: record.id },
      data: { deliveryStatus: 'FAILED', errorMessage: err.message },
    });
    return { ok: false, step: 'send', error: err.message || 'Failed to send test email', sentEmailId: record.id };
  }
}

/** Run IMAP sync immediately and return counts (for testing). */
export async function testReplySync() {
  const imap = await testImapConnection();
  if (!imap.ok) return { ...imap, step: 'reply_sync' };

  const result = await syncRepliesFromInbox();
  if (result.error) {
    return {
      ok: false,
      step: 'reply_sync',
      error: result.error,
      checked: result.checked,
      imported: result.imported,
      skipped: result.skipped,
    };
  }

  return {
    ok: true,
    step: 'reply_sync',
    message: `Reply sync OK — checked ${result.checked}, imported ${result.imported}, skipped ${result.skipped}`,
    checked: result.checked,
    imported: result.imported,
    skipped: result.skipped,
    tip:
      result.imported === 0
        ? 'No new replies found. Send a test email, reply to it from another account (or the same), wait a minute, then try again.'
        : 'New replies were imported — open Outreach → Replies.',
  };
}

/** Full diagnostics: SMTP + IMAP (+ optional send). */
export async function runEmailDiagnostics(input?: { sendTo?: string; userId?: number }) {
  const smtp = await testSmtpConnection();
  const imap = await testImapConnection();
  let send: any = null;
  if (input?.sendTo) {
    send = await sendTestSalesEmail({ toEmail: input.sendTo, userId: input.userId });
  }
  return {
    ok: smtp.ok && imap.ok && (send ? send.ok : true),
    smtp,
    imap,
    send,
  };
}
