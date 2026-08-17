import prisma from '@/lib/prisma';
import { salesAgentChat, parseJsonLoose } from './ai-provider';
import { saLog } from './logger';

const INTENT_VALUES = [
  'INTERESTED',
  'NOT_INTERESTED',
  'BOOK_DEMO',
  'NEED_PRICING',
  'REQUEST_INFORMATION',
  'ALREADY_USING_COMPETITOR',
  'WRONG_CONTACT',
  'SPAM',
  'OTHER',
] as const;

export async function classifyAndStoreReply(input: {
  fromEmail: string;
  fromName?: string;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  messageId?: string;
  inReplyTo?: string;
  threadId?: string;
  sentEmailId?: number;
  companyId?: number;
}) {
  let companyId = input.companyId || null;
  let sentEmailId = input.sentEmailId || null;

  if (!sentEmailId && input.inReplyTo) {
    const matched = await (prisma as any).saSentEmail.findFirst({
      where: { messageId: input.inReplyTo },
    });
    if (matched) {
      sentEmailId = matched.id;
      companyId = companyId || matched.companyId;
    }
  }

  if (!companyId && input.fromEmail) {
    const email = input.fromEmail.toLowerCase();
    const lead = await (prisma as any).saLeadCompany.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (lead) {
      companyId = lead.id;
    } else {
      const contact = await (prisma as any).saContact.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { companyId: true },
      });
      if (contact?.companyId) companyId = contact.companyId;
    }
  }

  let intent: string = 'OTHER';
  let sentiment = 'neutral';
  let aiSummary = '';
  let isPositive: boolean | null = null;

  try {
    const result = await salesAgentChat(
      [
        {
          role: 'system',
          content: `Classify this sales outreach reply. Return JSON:
{"intent": one of ${INTENT_VALUES.join('|')}, "sentiment": "positive"|"neutral"|"negative", "summary": "one sentence", "isPositive": boolean}`,
        },
        {
          role: 'user',
          content: `From: ${input.fromEmail}\nSubject: ${input.subject || ''}\n\n${input.bodyText || input.bodyHtml || ''}`,
        },
      ],
      { action: 'classify_reply', jsonMode: true, companyId: companyId || undefined }
    );
    const parsed = parseJsonLoose<{
      intent?: string;
      sentiment?: string;
      summary?: string;
      isPositive?: boolean;
    }>(result.text);
    if (parsed.intent && INTENT_VALUES.includes(parsed.intent as any)) intent = parsed.intent;
    sentiment = parsed.sentiment || 'neutral';
    aiSummary = parsed.summary || '';
    isPositive = parsed.isPositive ?? (sentiment === 'positive');
  } catch (err: any) {
    await saLog({
      level: 'warn',
      category: 'reply',
      action: 'classify_failed',
      message: err.message,
      success: false,
    });
  }

  const reply = await (prisma as any).saReply.create({
    data: {
      companyId,
      sentEmailId,
      fromEmail: input.fromEmail.toLowerCase(),
      fromName: input.fromName || null,
      subject: input.subject || null,
      bodyText: input.bodyText || null,
      bodyHtml: input.bodyHtml || null,
      threadId: input.threadId || null,
      messageId: input.messageId || null,
      inReplyTo: input.inReplyTo || null,
      sentiment,
      intent,
      aiSummary: aiSummary || null,
      isPositive,
    },
  });

  if (companyId) {
    await (prisma as any).saLeadCompany.update({
      where: { id: companyId },
      data: {
        replyStatus: intent,
        status: intent === 'BOOK_DEMO' || intent === 'INTERESTED' ? 'CONVERTED' : 'REPLIED',
      },
    });
    try {
      const { addLeadToHighPriorityGroup } = await import('./groups');
      await addLeadToHighPriorityGroup(companyId);
    } catch (err: any) {
      await saLog({
        level: 'warn',
        category: 'reply',
        action: 'priority_group_failed',
        message: err.message,
        success: false,
      });
    }
  }

  await saLog({
    category: 'reply',
    action: 'reply_recorded',
    message: `Reply from ${input.fromEmail} intent=${intent}`,
    entityType: 'SaReply',
    entityId: reply.id,
  });

  return reply;
}
