import nodemailer from 'nodemailer';
import prisma from '@/lib/prisma';
import { getDiscoveryConfig, getResendSmtpConfig, getSalesAgentSmtpConfig } from './config';
import { saLog } from './logger';

export const TEMPLATE_VARIABLES = [
  'company_name',
  'contact_name',
  'website',
  'city',
  'services',
  'personalized_intro',
  'sender_name',
  'booking_link',
] as const;

export function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const val = vars[key];
    return val != null ? String(val) : '';
  });
}

export async function buildTemplateVars(companyId: number, extras: Record<string, string> = {}) {
  const company = await (prisma as any).saLeadCompany.findUnique({
    where: { id: companyId },
    include: {
      contacts: { where: { isPrimary: true }, take: 1 },
      analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!company) throw new Error('Company not found');

  const smtp = await getSalesAgentSmtpConfig();
  const discovery = await getDiscoveryConfig();
  const { getSettingsByCategory } = await import('./config');
  const tpl = await getSettingsByCategory('general');

  let services = '';
  try {
    services = company.services ? JSON.parse(company.services).join(', ') : '';
  } catch {
    services = company.services || '';
  }

  // company_name / city / website = the LEAD (prospect), not TidyFlow
  // personalized_intro = AI analysis when available, else default from Setup
  // sender_name / booking_link = your company settings
  return {
    company_name: company.name || tpl.default_company_name || '',
    contact_name:
      company.contacts[0]?.name ||
      extras.contact_name ||
      tpl.default_contact_name ||
      company.name ||
      '',
    website: company.website || '',
    city: company.city || tpl.default_city || '',
    services: services || tpl.default_services || '',
    personalized_intro:
      company.analyses[0]?.personalizedIntro ||
      extras.personalized_intro ||
      tpl.default_personalized_intro ||
      '',
    sender_name: smtp.senderName || tpl.default_sender_name || 'TidyFlow',
    booking_link: discovery.bookingLink || tpl.default_booking_link || '',
    ...extras,
  };
}

type SmtpProvider = 'brevo' | 'resend';

async function countSentSince(since: Date, provider?: SmtpProvider): Promise<number> {
  const where: Record<string, any> = {
    deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED'] },
    sentAt: { gte: since },
  };
  if (provider) {
    // smtpResponse JSON includes `"provider":"brevo"` / `"provider":"resend"`
    where.smtpResponse = { contains: `"provider":"${provider}"` };
  }
  return (prisma as any).saSentEmail.count({ where });
}

export async function checkSendLimits(provider?: SmtpProvider): Promise<{
  ok: boolean;
  reason?: string;
  hourly: number;
  daily: number;
  hourlyLimit: number;
  dailyLimit: number;
}> {
  const smtp = await getSalesAgentSmtpConfig();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  // Provider-scoped limits: Brevo quota should not block Resend fallback
  const [hourly, daily] = await Promise.all([
    countSentSince(hourAgo, provider),
    countSentSince(dayStart, provider),
  ]);
  if (hourly >= smtp.hourlyLimit) {
    return {
      ok: false,
      reason: `${provider || 'SMTP'} hourly limit reached (${smtp.hourlyLimit})`,
      hourly,
      daily,
      hourlyLimit: smtp.hourlyLimit,
      dailyLimit: smtp.dailyLimit,
    };
  }
  if (daily >= smtp.dailyLimit) {
    return {
      ok: false,
      reason: `${provider || 'SMTP'} daily limit reached (${smtp.dailyLimit})`,
      hourly,
      daily,
      hourlyLimit: smtp.hourlyLimit,
      dailyLimit: smtp.dailyLimit,
    };
  }
  return {
    ok: true,
    hourly,
    daily,
    hourlyLimit: smtp.hourlyLimit,
    dailyLimit: smtp.dailyLimit,
  };
}

function isProviderLimitError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('limit') ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('too many') ||
    msg.includes('429') ||
    msg.includes('550') ||
    msg.includes('daily') ||
    msg.includes('maximum') ||
    msg.includes('exceed')
  );
}

export interface SendSalesEmailInput {
  companyId?: number;
  campaignId?: number;
  templateId?: number;
  /** Segment index within a campaign sequence (1 = first email). */
  sequenceStep?: number;
  to: string;
  toName?: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  aiPrompt?: string;
  aiProvider?: string;
  scheduledFor?: Date | null;
}

function createSalesTransport(opts: {
  host: string;
  port: number;
  username: string;
  password: string;
}) {
  return nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.port === 465 || opts.port === 2465,
    requireTLS: opts.port === 587 || opts.port === 2587 || opts.port === 25,
    auth: { user: opts.username, pass: opts.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 25_000,
  });
}

async function sendWithProvider(input: {
  provider: SmtpProvider;
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  sentEmailId: number;
}) {
  const transporter = createSalesTransport({
    host: input.host,
    port: input.port,
    username: input.username,
    password: input.password,
  });
  try {
    return await transporter.sendMail({
      from: `"${input.fromName}" <${input.fromEmail}>`,
      to: input.to,
      replyTo: input.replyToEmail
        ? `"${input.fromName}" <${input.replyToEmail}>`
        : undefined,
      subject: input.subject,
      html: input.html || undefined,
      text: input.text || undefined,
      headers: {
        'X-TidyFlow-Sales-Agent': String(input.sentEmailId),
        'X-TidyFlow-Smtp-Provider': input.provider,
        ...(input.provider === 'resend'
          ? { 'Resend-Idempotency-Key': `sa-sent-${input.sentEmailId}` }
          : {}),
        ...(input.replyToEmail
          ? { 'Reply-To': `"${input.fromName}" <${input.replyToEmail}>` }
          : {}),
      },
    });
  } finally {
    try {
      transporter.close();
    } catch {
      /* ignore */
    }
  }
}

/** Create DB row + queue; Brevo is primary at deliver time with Resend fallback. */
export async function sendSalesEmail(input: SendSalesEmailInput) {
  // Soft check only for immediate sends — campaigns use scheduledFor and deliver later
  if (!input.scheduledFor) {
    const brevoLimits = await checkSendLimits('brevo');
    const resend = await getResendSmtpConfig();
    const resendReady = !!(resend.enabled && resend.apiKey && resend.senderEmail);
    if (!brevoLimits.ok && !resendReady) {
      throw new Error(brevoLimits.reason || 'Email send limit reached');
    }
  }

  const email = input.to.toLowerCase();
  const sequenceStep = Math.max(1, Number(input.sequenceStep) || 1);

  // One send per campaign + lead + sequence step (allows multi-template drip)
  if (input.campaignId) {
    const alreadyInCampaign = await (prisma as any).saSentEmail.findFirst({
      where: {
        campaignId: input.campaignId,
        sequenceStep,
        deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED', 'QUEUED', 'PENDING', 'RETRYING'] },
        OR: [
          input.companyId ? { companyId: input.companyId } : undefined,
          { recipientEmail: email },
        ].filter(Boolean),
      },
    });
    if (alreadyInCampaign) {
      throw new Error(
        `Already queued/sent step ${sequenceStep} in this campaign for this lead`
      );
    }
  }

  // Cross-campaign safety — campaign start already dedupes per step
  if (!input.campaignId) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dup = await (prisma as any).saSentEmail.findFirst({
      where: {
        recipientEmail: email,
        subject: input.subject,
        createdAt: { gte: weekAgo },
        deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED', 'QUEUED', 'PENDING'] },
      },
    });
    if (dup) {
      throw new Error('Duplicate email prevented (same recipient + subject within 7 days)');
    }
  }

  const record = await (prisma as any).saSentEmail.create({
    data: {
      companyId: input.companyId || null,
      campaignId: input.campaignId || null,
      templateId: input.templateId || null,
      sequenceStep,
      recipientEmail: email,
      recipientName: input.toName || null,
      subject: input.subject,
      htmlBody: input.htmlBody || null,
      textBody: input.textBody || null,
      aiPrompt: input.aiPrompt || null,
      aiProvider: input.aiProvider || null,
      deliveryStatus: input.scheduledFor ? 'QUEUED' : 'PENDING',
      scheduledFor: input.scheduledFor || null,
    },
  });

  if (input.scheduledFor && input.scheduledFor > new Date()) {
    return record;
  }

  return deliverSalesEmail(record.id);
}

/** Audience filter for campaign email sends / follow-ups. */
export type CampaignAudience =
  | 'never_contacted'
  | 'already_contacted'
  | 'from_campaign'
  | 'all_with_email';

export function buildAudienceWhere(opts: {
  audience: CampaignAudience;
  sourceCampaignId?: number | null;
  campaignId?: number;
  minScore?: number;
}): Record<string, any> {
  const where: Record<string, any> = {
    hasEmail: true,
    email: { not: null },
  };
  if (opts.minScore != null) where.leadScore = { gte: opts.minScore };

  if (opts.audience === 'never_contacted') {
    where.emailSentCount = 0;
  } else if (opts.audience === 'already_contacted') {
    where.emailSentCount = { gt: 0 };
  } else if (opts.audience === 'from_campaign' && opts.sourceCampaignId) {
    where.sentEmails = {
      some: {
        campaignId: opts.sourceCampaignId,
        deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED'] },
      },
    };
  }

  // Never re-include anyone already emailed by THIS campaign
  if (opts.campaignId) {
    where.NOT = {
      sentEmails: {
        some: {
          campaignId: opts.campaignId,
          deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED', 'QUEUED', 'PENDING', 'RETRYING'] },
        },
      },
    };
  }

  return where;
}

export async function deliverSalesEmail(sentEmailId: number) {
  const record = await (prisma as any).saSentEmail.findUnique({ where: { id: sentEmailId } });
  if (!record) throw new Error('Sent email record not found');

  if (['SENT', 'DELIVERED', 'OPENED', 'CANCELED'].includes(record.deliveryStatus)) {
    return record;
  }

  // Honor scheduledFor (e.g. email_sending sweeper picked up early)
  if (record.scheduledFor && new Date(record.scheduledFor).getTime() > Date.now() + 2000) {
    return record;
  }

  // Respect campaign pause / cancel for delayed sequence steps
  if (record.campaignId) {
    const campaign = await (prisma as any).saCampaign.findUnique({
      where: { id: record.campaignId },
      select: { status: true, followUpSchedule: true },
    });
    if (campaign && (campaign.status === 'PAUSED' || campaign.status === 'FAILED')) {
      await (prisma as any).saSentEmail.update({
        where: { id: sentEmailId },
        data: {
          deliveryStatus: 'CANCELED',
          errorMessage: `Skipped — campaign is ${campaign.status}`,
        },
      });
      await saLog({
        level: 'warn',
        category: 'campaign',
        action: 'sequence_step_canceled',
        message: `Step ${record.sequenceStep || 1} canceled — campaign ${campaign.status}`,
        entityType: 'SaSentEmail',
        entityId: sentEmailId,
        success: false,
      });
      return { ...record, deliveryStatus: 'CANCELED' };
    }

    const step = Math.max(1, Number(record.sequenceStep) || 1);
    if (step > 1 && record.companyId) {
      const { parseCampaignSequence } = await import('./campaign-sequence');
      const seq = parseCampaignSequence(campaign?.followUpSchedule);
      const skipIfReplied = seq.skipIfReplied !== false;
      if (skipIfReplied) {
        const replied =
          (await (prisma as any).saReply.count({
            where: {
              OR: [
                { companyId: record.companyId },
                {
                  sentEmail: {
                    campaignId: record.campaignId,
                    companyId: record.companyId,
                  },
                },
              ],
            },
          })) > 0 ||
          !!(await (prisma as any).saLeadCompany.findFirst({
            where: {
              id: record.companyId,
              OR: [
                { replyStatus: { not: null } },
                { status: 'REPLIED' },
              ],
            },
            select: { id: true },
          }));

        if (replied) {
          await (prisma as any).saSentEmail.update({
            where: { id: sentEmailId },
            data: {
              deliveryStatus: 'CANCELED',
              errorMessage: 'Skipped — lead already replied (follow-up suppressed)',
            },
          });
          await saLog({
            category: 'campaign',
            action: 'sequence_step_skipped_reply',
            message: `Step ${step} skipped — lead replied`,
            entityType: 'SaSentEmail',
            entityId: sentEmailId,
          });
          return { ...record, deliveryStatus: 'CANCELED' };
        }
      }
    }
  }

  const smtp = await getSalesAgentSmtpConfig();
  const resend = await getResendSmtpConfig();
  const brevoReady = !!(smtp.host && smtp.username && smtp.password && smtp.senderEmail);
  const resendReady = !!(resend.enabled && resend.apiKey && resend.senderEmail);

  if (!brevoReady && !resendReady) {
    await (prisma as any).saSentEmail.update({
      where: { id: sentEmailId },
      data: {
        deliveryStatus: 'FAILED',
        errorMessage: 'No SMTP configured — set Brevo and/or Resend in Setup',
      },
    });
    throw new Error('No SMTP configured (Brevo or Resend)');
  }

  const brevoLimits = brevoReady ? await checkSendLimits('brevo') : { ok: false, reason: 'Brevo not configured' };
  const resendLimits = resendReady ? await checkSendLimits('resend') : { ok: false, reason: 'Resend not configured' };

  let lastError: any = null;
  const attempts: Array<{ provider: SmtpProvider; ok: boolean; error?: string; skipped?: boolean }> = [];

  const markSent = async (info: any, provider: SmtpProvider) => {
    const messageId = info.messageId || null;
    const updated = await (prisma as any).saSentEmail.update({
      where: { id: sentEmailId },
      data: {
        deliveryStatus: 'SENT',
        sentAt: new Date(),
        messageId,
        threadId: messageId,
        smtpResponse: JSON.stringify({
          provider,
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
          attempts,
        }),
        errorMessage: null,
      },
    });

    if (record.companyId) {
      await (prisma as any).saLeadCompany.update({
        where: { id: record.companyId },
        data: {
          lastContactedAt: new Date(),
          emailSentCount: { increment: 1 },
          status: 'CONTACTED',
        },
      });
    }
    if (record.campaignId) {
      await (prisma as any).saCampaign.update({
        where: { id: record.campaignId },
        data: { emailsSent: { increment: 1 } },
      });
    }

    await saLog({
      category: 'email',
      action: 'email_sent',
      message: `Sent to ${record.recipientEmail} via ${provider}`,
      entityType: 'SaSentEmail',
      entityId: sentEmailId,
      details: { messageId, provider, attempts },
    });

    return updated;
  };

  const tryResend = async () => {
    if (!resendReady) return null;
    if (!resendLimits.ok) {
      attempts.push({
        provider: 'resend',
        ok: false,
        skipped: true,
        error: resendLimits.reason,
      });
      lastError = new Error(resendLimits.reason || 'Resend limit reached');
      return null;
    }
    try {
      const info = await sendWithProvider({
        provider: 'resend',
        host: resend.host,
        port: resend.port,
        username: resend.username || 'resend',
        password: resend.apiKey,
        fromEmail: resend.senderEmail,
        fromName: resend.senderName,
        replyToEmail: smtp.replyToEmail || undefined,
        to: record.recipientEmail,
        subject: record.subject,
        html: record.htmlBody || undefined,
        text: record.textBody || undefined,
        sentEmailId,
      });
      attempts.push({ provider: 'resend', ok: true });
      return await markSent(info, 'resend');
    } catch (err: any) {
      lastError = err;
      attempts.push({ provider: 'resend', ok: false, error: err.message });
      return null;
    }
  };

  // 1) Primary: Brevo (skip if our Brevo quota is already used — go straight to Resend)
  if (brevoReady && brevoLimits.ok) {
    try {
      const info = await sendWithProvider({
        provider: 'brevo',
        host: smtp.host,
        port: smtp.port,
        username: smtp.username,
        password: smtp.password,
        fromEmail: smtp.senderEmail,
        fromName: smtp.senderName,
        replyToEmail: smtp.replyToEmail || undefined,
        to: record.recipientEmail,
        subject: record.subject,
        html: record.htmlBody || undefined,
        text: record.textBody || undefined,
        sentEmailId,
      });
      attempts.push({ provider: 'brevo', ok: true });
      if (!smtp.replyToEmail) {
        await saLog({
          level: 'warn',
          category: 'email',
          action: 'missing_reply_to',
          message: 'Sent without Reply-To — set your Gmail in Setup so customers reply to you',
          entityType: 'SaSentEmail',
          entityId: sentEmailId,
          success: true,
        });
      }
      return await markSent(info, 'brevo');
    } catch (err: any) {
      lastError = err;
      attempts.push({ provider: 'brevo', ok: false, error: err.message });
      await saLog({
        level: 'warn',
        category: 'smtp',
        action: 'brevo_failed_try_resend',
        message: `Brevo failed: ${err.message}${resendReady ? ' — trying Resend fallback' : ''}`,
        entityType: 'SaSentEmail',
        entityId: sentEmailId,
        success: false,
        details: { limitError: isProviderLimitError(err) },
      });
    }
  } else if (brevoReady && !brevoLimits.ok) {
    attempts.push({
      provider: 'brevo',
      ok: false,
      skipped: true,
      error: brevoLimits.reason,
    });
    await saLog({
      level: 'info',
      category: 'smtp',
      action: 'brevo_limit_use_resend',
      message: `${brevoLimits.reason} — using Resend`,
      entityType: 'SaSentEmail',
      entityId: sentEmailId,
      details: brevoLimits,
    });
    lastError = new Error(brevoLimits.reason || 'Brevo limit reached');
  }

  // 2) Fallback: Resend when Brevo missing, limited, or failed
  if (resendReady && (lastError || !brevoReady || !brevoLimits.ok)) {
    const sent = await tryResend();
    if (sent) return sent;
  }

  // Both limited / failed — keep QUEUED and retry later instead of hard-failing the lead
  const failMsg = lastError?.message || 'Email send failed';
  const bothLimited =
    (isProviderLimitError(lastError) || !brevoLimits.ok || !resendLimits.ok) &&
    attempts.every((a) => !a.ok);

  if (bothLimited) {
    const retryAt = new Date(Date.now() + 60 * 60 * 1000);
    await (prisma as any).saSentEmail.update({
      where: { id: sentEmailId },
      data: {
        deliveryStatus: 'QUEUED',
        scheduledFor: retryAt,
        retryCount: { increment: 1 },
        errorMessage: `Deferred — ${failMsg}. Will retry via Brevo/Resend.`,
        smtpResponse: JSON.stringify({ attempts, deferred: true, retryAt }),
      },
    });
    try {
      const { enqueueSendEmail } = await import('./queue');
      await enqueueSendEmail(sentEmailId, 60 * 60 * 1000);
    } catch {
      /* sweeper / next start can pick up */
    }
    await saLog({
      level: 'warn',
      category: 'smtp',
      action: 'email_deferred_limits',
      message: `Deferred send to ${record.recipientEmail}: ${failMsg}`,
      entityType: 'SaSentEmail',
      entityId: sentEmailId,
      details: { attempts, retryAt },
    });
    return { ...record, deliveryStatus: 'QUEUED', scheduledFor: retryAt };
  }

  await (prisma as any).saSentEmail.update({
    where: { id: sentEmailId },
    data: {
      deliveryStatus: 'FAILED',
      retryCount: { increment: 1 },
      errorMessage: failMsg,
      smtpResponse: JSON.stringify({ attempts, error: failMsg }),
    },
  });
  await saLog({
    level: 'error',
    category: 'smtp',
    action: 'email_failed',
    message: failMsg,
    entityType: 'SaSentEmail',
    entityId: sentEmailId,
    details: { attempts },
    success: false,
  });
  throw lastError || new Error(failMsg);
}

export async function retryFailedEmail(sentEmailId: number) {
  const record = await (prisma as any).saSentEmail.findUnique({ where: { id: sentEmailId } });
  if (!record) throw new Error('Email not found');
  if (record.retryCount >= 5) throw new Error('Max retries exceeded');
  await (prisma as any).saSentEmail.update({
    where: { id: sentEmailId },
    data: { deliveryStatus: 'RETRYING' },
  });
  return deliverSalesEmail(sentEmailId);
}
