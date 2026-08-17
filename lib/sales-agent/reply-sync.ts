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

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return String(email).trim().toLowerCase() || null;
}

/** Decode quoted-printable / basic encoded words enough for readable bodies */
function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Extract text + HTML from a raw RFC822 source without extra dependencies.
 * Prefer multipart HTML parts when present (Gmail replies).
 */
export function extractEmailBodies(rawSource: string): { text: string; html: string | null } {
  if (!rawSource) return { text: '', html: null };

  const source = rawSource.replace(/\r\n/g, '\n');
  let html: string | null = null;
  let text = '';

  const decodePart = (headers: string, body: string): string => {
    const encoding = (headers.match(/Content-Transfer-Encoding:\s*([^\n]+)/i)?.[1] || '')
      .trim()
      .toLowerCase();
    let out = body.trim();
    if (encoding.includes('base64')) {
      try {
        out = Buffer.from(out.replace(/\s+/g, ''), 'base64').toString('utf8');
      } catch {
        /* keep */
      }
    } else if (encoding.includes('quoted-printable')) {
      out = decodeQuotedPrintable(out);
    }
    return out;
  };

  // Split on MIME boundaries when present
  const boundaryMatch = source.match(/boundary="?([^"\s;]+)"?/i);
  if (boundaryMatch?.[1]) {
    const boundary = boundaryMatch[1];
    const parts = source.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    for (const part of parts) {
      const splitAt = part.search(/\n\n/);
      if (splitAt < 0) continue;
      const headers = part.slice(0, splitAt);
      const body = part.slice(splitAt + 2);
      const ct = headers.match(/Content-Type:\s*([^\n;]+)/i)?.[1]?.toLowerCase() || '';
      if (ct.includes('text/html') && !html) {
        html = decodePart(headers, body).slice(0, 200000);
      } else if (ct.includes('text/plain') && !text) {
        text = decodePart(headers, body).slice(0, 50000);
      }
    }
  }

  // Fallback: single-part or poorly structured source
  if (!html && !text) {
    const htmlPart = source.match(
      /Content-Type:\s*text\/html[^\n]*(?:\n(?!\n)[^\n]*)*\n\n([\s\S]*?)(?=\n--|\nContent-Type:|$)/i
    );
    const textPart = source.match(
      /Content-Type:\s*text\/plain[^\n]*(?:\n(?!\n)[^\n]*)*\n\n([\s\S]*?)(?=\n--|\nContent-Type:|$)/i
    );
    if (htmlPart?.[1]) {
      const headerBlock = source.slice(Math.max(0, source.indexOf(htmlPart[0]) - 200), source.indexOf(htmlPart[1]));
      html = decodePart(headerBlock, htmlPart[1]).slice(0, 200000);
    }
    if (textPart?.[1]) {
      const headerBlock = source.slice(Math.max(0, source.indexOf(textPart[0]) - 200), source.indexOf(textPart[1]));
      text = decodePart(headerBlock, textPart[1]).slice(0, 50000);
    }
  }

  if (!html && !text) {
    const body = source.includes('\n\n') ? source.split(/\n\n/).slice(1).join('\n\n') : source;
    if (/<html[\s>]/i.test(body) || /<(div|p|table|span)[\s>]/i.test(body)) {
      html = body.slice(0, 200000);
    } else {
      text = body.slice(0, 50000);
    }
  }

  if (html && !text) text = stripHtmlToText(html).slice(0, 50000);
  return { text, html };
}

async function findLeadByEmail(email: string): Promise<{
  companyId: number;
  email: string;
} | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const company = await (prisma as any).saLeadCompany.findFirst({
    where: { email: { equals: normalized, mode: 'insensitive' } },
    select: { id: true, email: true },
  });
  if (company) return { companyId: company.id, email: company.email || normalized };

  const contact = await (prisma as any).saContact.findFirst({
    where: { email: { equals: normalized, mode: 'insensitive' } },
    select: { companyId: true, email: true },
  });
  if (contact?.companyId) {
    return { companyId: contact.companyId, email: contact.email || normalized };
  }
  return null;
}

/**
 * Sync inbox mail that:
 * 1) Comes from an email belonging to a sales-agent lead (company or contact), AND
 * 2) Is a reply to one of our outbound sent emails (In-Reply-To / References),
 *    or we previously emailed that lead (fallback link).
 * Stores HTML when available so the UI can render formatted replies.
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
          ? Array.isArray(envelope.references)
            ? envelope.references
            : [envelope.references]
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

        const fromAddr = normalizeEmail(
          envelope?.from?.[0]?.address ||
            (typeof envelope?.from?.[0] === 'string' ? envelope.from[0] : null)
        );

        // Hard rule: only sync mail from known lead emails
        if (!fromAddr) {
          skipped++;
          continue;
        }
        const lead = await findLeadByEmail(fromAddr);
        if (!lead) {
          skipped++;
          continue;
        }

        // Prefer threading to our outbound message
        const matchIds = [inReplyTo, ...references.map(normalizeMessageId)].filter(
          Boolean
        ) as string[];
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
              deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED'] },
            },
            take: 1,
          });
          sentEmail = candidates[0] || null;
        }

        // Fallback: latest email we sent to this lead / address
        if (!sentEmail) {
          sentEmail = await (prisma as any).saSentEmail.findFirst({
            where: {
              deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED'] },
              OR: [
                { companyId: lead.companyId },
                { recipientEmail: { equals: fromAddr, mode: 'insensitive' } },
              ],
            },
            orderBy: { sentAt: 'desc' },
          });
        }

        // Still nothing outbound → skip (not a sales reply we care about)
        if (!sentEmail) {
          skipped++;
          continue;
        }

        const source = msg.source ? Buffer.from(msg.source).toString('utf8') : '';
        const bodies = extractEmailBodies(source);
        const bodyText =
          bodies.text ||
          (bodies.html ? stripHtmlToText(bodies.html) : '') ||
          envelope?.subject ||
          '';
        const bodyHtml = bodies.html;

        await classifyAndStoreReply({
          fromEmail: fromAddr,
          fromName: envelope?.from?.[0]?.name || undefined,
          subject: envelope?.subject || undefined,
          bodyText: bodyText.slice(0, 50000),
          bodyHtml: bodyHtml || undefined,
          messageId: messageId || undefined,
          inReplyTo: inReplyTo || undefined,
          threadId: sentEmail.threadId || messageId || undefined,
          sentEmailId: sentEmail.id,
          companyId: sentEmail.companyId || lead.companyId,
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
      message: `IMAP sync checked=${checked} imported=${imported} skipped=${skipped} (lead emails only)`,
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
