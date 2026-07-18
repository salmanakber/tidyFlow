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

async function countSentSince(since: Date): Promise<number> {
  return (prisma as any).saSentEmail.count({
    where: {
      deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED'] },
      sentAt: { gte: since },
    },
  });
}

export async function checkSendLimits(): Promise<{ ok: boolean; reason?: string }> {
  const smtp = await getSalesAgentSmtpConfig();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [hourly, daily] = await Promise.all([countSentSince(hourAgo), countSentSince(dayStart)]);
  if (hourly >= smtp.hourlyLimit) {
    return { ok: false, reason: `Hourly email limit reached (${smtp.hourlyLimit})` };
  }
  if (daily >= smtp.dailyLimit) {
    return { ok: false, reason: `Daily email limit reached (${smtp.dailyLimit})` };
  }
  return { ok: true };
}

export interface SendSalesEmailInput {
  companyId?: number;
  campaignId?: number;
  templateId?: number;
  to: string;
  toName?: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  aiPrompt?: string;
  aiProvider?: string;
  scheduledFor?: Date | null;
}

type SmtpProvider = 'brevo' | 'resend';

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

/** Send via Brevo SMTP by default; fall back to Resend on limit/error. */
export async function sendSalesEmail(input: SendSalesEmailInput) {
  const limits = await checkSendLimits();
  if (!limits.ok && !input.scheduledFor) {
    throw new Error(limits.reason);
  }

  const email = input.to.toLowerCase();

  // Hard rule: never send the same campaign twice to the same company / recipient
  if (input.campaignId) {
    const alreadyInCampaign = await (prisma as any).saSentEmail.findFirst({
      where: {
        campaignId: input.campaignId,
        deliveryStatus: { in: ['SENT', 'DELIVERED', 'OPENED', 'QUEUED', 'PENDING', 'RETRYING'] },
        OR: [
          input.companyId ? { companyId: input.companyId } : undefined,
          { recipientEmail: email },
        ].filter(Boolean),
      },
    });
    if (alreadyInCampaign) {
      throw new Error(
        'Already emailed in this campaign — use a new follow-up campaign for a second email'
      );
    }
  }

  // Also block identical subject to same inbox within 7 days (safety net)
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

  const record = await (prisma as any).saSentEmail.create({
    data: {
      companyId: input.companyId || null,
      campaignId: input.campaignId || null,
      templateId: input.templateId || null,
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

  let lastError: any = null;
  const attempts: Array<{ provider: SmtpProvider; ok: boolean; error?: string }> = [];

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

  // 1) Primary: Brevo
  if (brevoReady) {
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
      });
    }
  }

  // 2) Fallback: Resend (https://resend.com/docs/send-with-smtp)
  if (resendReady && (lastError || !brevoReady)) {
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
    }
  }

  const failMsg = lastError?.message || 'Email send failed';
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
    success: false,
    details: { attempts },
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
