import { getSettingsByCategory } from './config';
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

function normalizeMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  return String(id).replace(/^<|>$/g, '').trim() || null;
}

/**
 * Sync only emails that are replies to our outbound sales emails
 * (matched via In-Reply-To / References → sa_sent_emails.message_id).
 * Ignores unrelated inbox mail.
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
      // Only recent mail; still require a match to a sent sales email below
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      for await (const msg of client.fetch(
        { since },
        { envelope: true, source: true, uid: true }
      )) {
        checked++;
        const envelope = msg.envelope;
        const messageId = normalizeMessageId(envelope?.messageId);
        const inReplyToRaw = Array.isArray(envelope?.inReplyTo)
          ? envelope.inReplyTo[0]
          : envelope?.inReplyTo || null;
        const inReplyTo = normalizeMessageId(inReplyToRaw);
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

        // Must look like a reply to one of our messages
        const matchIds = [inReplyTo, ...references.map(normalizeMessageId)].filter(Boolean) as string[];
        if (!matchIds.length) {
          skipped++;
          continue;
        }

        const candidates = await (prisma as any).saSentEmail.findMany({
          where: {
            OR: matchIds.flatMap((id: string) => [
              { messageId: id },
              { messageId: `<${id}>` },
              { threadId: id },
              { threadId: `<${id}>` },
            ]),
            deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED'] },
          },
          take: 1,
        });
        const sentEmail = candidates[0] || null;

        // Strict: only import if this email replies to a sales-agent sent email
        if (!sentEmail) {
          skipped++;
          continue;
        }

        const fromAddr =
          envelope?.from?.[0]?.address ||
          (typeof envelope?.from?.[0] === 'string' ? envelope.from[0] : null);

        const source = msg.source ? Buffer.from(msg.source).toString('utf8') : '';
        const textMatch = source.match(/\r?\n\r?\n([\s\S]*)$/);
        const bodyText = textMatch ? textMatch[1].slice(0, 20000) : envelope?.subject || '';

        await classifyAndStoreReply({
          fromEmail: fromAddr || sentEmail.recipientEmail || 'unknown@unknown',
          fromName: envelope?.from?.[0]?.name || undefined,
          subject: envelope?.subject || undefined,
          bodyText,
          messageId: messageId || undefined,
          inReplyTo: inReplyTo || undefined,
          threadId: sentEmail.threadId || messageId || undefined,
          sentEmailId: sentEmail.id,
          companyId: sentEmail.companyId || undefined,
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
      message: `IMAP sync checked=${checked} imported=${imported} skipped=${skipped} (only replies to sent emails)`,
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
