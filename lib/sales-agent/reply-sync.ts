import { getSettingsByCategory, upsertSettings } from './config';
import { classifyAndStoreReply } from './replies';
import { saLog } from './logger';
import prisma from '@/lib/prisma';

export interface ReplyInboxConfig {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

export async function getReplyInboxConfig(): Promise<ReplyInboxConfig> {
  const smtp = await getSettingsByCategory('smtp');
  return {
    enabled: (smtp.reply_imap_enabled || 'false') === 'true',
    host: smtp.reply_imap_host || 'imap.gmail.com',
    port: parseInt(smtp.reply_imap_port || '993', 10),
    user: smtp.reply_imap_user || smtp.reply_to_email || '',
    password: smtp.reply_imap_password || '',
    tls: (smtp.reply_imap_tls || 'true') === 'true',
  };
}

/**
 * Sync replies from the Reply-To inbox (typically Gmail via App Password).
 * Matches In-Reply-To / References to sa_sent_emails.message_id.
 *
 * Uses dynamic import of `imapflow` when available.
 */
export async function syncRepliesFromInbox(): Promise<{
  checked: number;
  imported: number;
  skipped: number;
  error?: string;
}> {
  const config = await getReplyInboxConfig();
  if (!config.enabled) {
    return { checked: 0, imported: 0, skipped: 0, error: 'Reply inbox sync is disabled' };
  }
  if (!config.user || !config.password) {
    return { checked: 0, imported: 0, skipped: 0, error: 'IMAP user/password not configured' };
  }

  let ImapFlow: any;
  try {
    // Optional dependency — install with: npm i imapflow
    ImapFlow = (await import('imapflow')).ImapFlow;
  } catch {
    return {
      checked: 0,
      imported: 0,
      skipped: 0,
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

  let checked = 0;
  let imported = 0;
  let skipped = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Last 7 days, unseen or recent
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      for await (const msg of client.fetch(
        { since },
        { envelope: true, source: true, uid: true }
      )) {
        checked++;
        const envelope = msg.envelope;
        const messageId = envelope?.messageId || null;
        const inReplyTo = Array.isArray(envelope?.inReplyTo)
          ? envelope.inReplyTo[0]
          : envelope?.inReplyTo || null;
        const references = envelope?.references
          ? (Array.isArray(envelope.references) ? envelope.references : [envelope.references])
          : [];

        if (messageId) {
          const existing = await (prisma as any).saReply.findFirst({
            where: { messageId },
          });
          if (existing) {
            skipped++;
            continue;
          }
        }

        const matchIds = [inReplyTo, ...references].filter(Boolean).map((id: string) =>
          String(id).replace(/^<|>$/g, '')
        );

        let sentEmail: any = null;
        if (matchIds.length) {
          const candidates = await (prisma as any).saSentEmail.findMany({
            where: {
              OR: matchIds.flatMap((id: string) => [
                { messageId: id },
                { messageId: `<${id}>` },
                { threadId: id },
                { threadId: `<${id}>` },
              ]),
            },
            take: 1,
          });
          sentEmail = candidates[0] || null;
        }

        // Fallback: match by from-email to a contacted lead
        const fromAddr =
          envelope?.from?.[0]?.address ||
          (typeof envelope?.from?.[0] === 'string' ? envelope.from[0] : null);

        if (!sentEmail && fromAddr) {
          sentEmail = await (prisma as any).saSentEmail.findFirst({
            where: {
              recipientEmail: fromAddr.toLowerCase(),
              deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED'] },
            },
            orderBy: { sentAt: 'desc' },
          });
        }

        const source = msg.source ? Buffer.from(msg.source).toString('utf8') : '';
        const textMatch = source.match(/\r?\n\r?\n([\s\S]*)$/);
        const bodyText = textMatch ? textMatch[1].slice(0, 20000) : envelope?.subject || '';

        await classifyAndStoreReply({
          fromEmail: fromAddr || 'unknown@unknown',
          fromName: envelope?.from?.[0]?.name || undefined,
          subject: envelope?.subject || undefined,
          bodyText,
          messageId: messageId || undefined,
          inReplyTo: inReplyTo || undefined,
          threadId: sentEmail?.threadId || messageId || undefined,
          sentEmailId: sentEmail?.id,
          companyId: sentEmail?.companyId || undefined,
        });
        imported++;
      }
    } finally {
      lock.release();
    }
    await client.logout();

    await saLog({
      category: 'reply',
      action: 'imap_sync',
      message: `IMAP sync checked=${checked} imported=${imported} skipped=${skipped}`,
      details: { checked, imported, skipped },
    });

    return { checked, imported, skipped };
  } catch (err: any) {
    await saLog({
      level: 'error',
      category: 'reply',
      action: 'imap_sync_failed',
      message: err.message,
      success: false,
    });
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    return { checked, imported, skipped, error: err.message };
  }
}
