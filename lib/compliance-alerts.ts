import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';
import { UserRole } from '@prisma/client';
import {
  buildComplianceChecklist,
  computeComplianceStatus,
  COMPLIANCE_DOC_TYPES,
} from '@/lib/compliance';

/** Days before expiry to send reminder pushes (plus day-of and expired). */
export const COMPLIANCE_REMINDER_MILESTONES = [30, 14, 7, 1, 0] as const;

export type ComplianceAlertKind = 'expiring' | 'expired' | 'missing';

export interface ComplianceExpiryAlertJob {
  companyId: number;
  documentId?: number;
  docType: string;
  title: string;
  kind: ComplianceAlertKind;
  daysLeft?: number;
  expiresAt?: string;
  dedupeKey: string;
}

function complianceDedupeKey(input: {
  companyId: number;
  docType: string;
  kind: ComplianceAlertKind;
  documentId?: number;
  daysLeft?: number;
  expiresAt?: string | null;
}) {
  const datePart = input.expiresAt ? input.expiresAt.slice(0, 10) : 'none';
  const dayPart = input.daysLeft != null ? String(input.daysLeft) : input.kind;
  const docPart = input.documentId ?? input.docType;
  return `compliance-${input.companyId}-${docPart}-${input.kind}-${dayPart}-${datePart}`;
}

async function getComplianceContacts(companyId: number) {
  return prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: [UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.MANAGER] },
    },
    select: { id: true },
  });
}

async function wasComplianceAlertSent(userId: number, dedupeKey: string) {
  const recent = await prisma.notification.findFirst({
    where: {
      userId,
      type: 'compliance_alert',
      metadata: { contains: dedupeKey },
    },
  });
  return !!recent;
}

export async function sendComplianceAlert(payload: ComplianceExpiryAlertJob) {
  const contacts = await getComplianceContacts(payload.companyId);
  if (!contacts.length) return { sent: 0 };

  let title = 'Compliance document alert';
  let message = payload.title;

  if (payload.kind === 'expired') {
    title = 'Compliance document expired';
    message = `${payload.title} has expired. Upload a renewed document in Compliance.`;
  } else if (payload.kind === 'expiring') {
    const days = payload.daysLeft ?? 0;
    title = days <= 0 ? 'Compliance document expires today' : 'Compliance document expiring soon';
    message =
      days <= 0
        ? `${payload.title} expires today. Renew it in Compliance.`
        : `${payload.title} expires in ${days} day${days === 1 ? '' : 's'}. Renew it in Compliance.`;
  } else if (payload.kind === 'missing') {
    title = 'Missing compliance document';
    message = `${payload.title} is not on file. Upload it in Compliance & Safety.`;
  }

  let sent = 0;
  for (const user of contacts) {
    const alreadySent = await wasComplianceAlertSent(user.id, payload.dedupeKey);
    if (alreadySent) continue;

    await createNotification({
      userId: user.id,
      title,
      message,
      type: 'compliance_alert',
      metadata: {
        dedupeKey: payload.dedupeKey,
        companyId: payload.companyId,
        docType: payload.docType,
        documentId: payload.documentId,
        kind: payload.kind,
        daysLeft: payload.daysLeft,
        expiresAt: payload.expiresAt,
      },
      screenRoute: 'Compliance',
    }).catch((err) => console.warn('[Compliance] push failed:', err));

    sent += 1;
  }

  return { sent };
}

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function milestoneForDaysLeft(daysLeft: number): number | null {
  if (daysLeft < 0) return null;
  for (const milestone of COMPLIANCE_REMINDER_MILESTONES) {
    if (daysLeft === milestone) return milestone;
  }
  return null;
}

/** Daily scan: refresh statuses, push for expiring/expired/missing required docs. */
export async function scanComplianceExpiryAlerts() {
  const companies = await prisma.company.findMany({
    where: { subscriptionStatus: { not: 'cancelled' } },
    select: { id: true },
  });

  const result = {
    companiesScanned: companies.length,
    documentsUpdated: 0,
    alertsQueued: 0,
    alertsSent: 0,
  };

  for (const company of companies) {
    const documents = await prisma.complianceDocument.findMany({
      where: { companyId: company.id },
      orderBy: [{ docType: 'asc' }, { updatedAt: 'desc' }],
    });

    // Refresh stored status from expiry date
    for (const doc of documents) {
      const nextStatus = computeComplianceStatus(doc.expiresAt, !!doc.fileUrl);
      if (doc.status !== nextStatus) {
        await prisma.complianceDocument.update({
          where: { id: doc.id },
          data: { status: nextStatus },
        });
        result.documentsUpdated += 1;
      }
    }

    const checklist = buildComplianceChecklist(documents);

    for (const item of checklist) {
      if (item.status === 'missing') {
        const monthKey = new Date().toISOString().slice(0, 7);
        const dedupeKey = `${complianceDedupeKey({
          companyId: company.id,
          docType: item.docType,
          kind: 'missing',
        })}-month-${monthKey}`;

        const { sent } = await sendComplianceAlert({
          companyId: company.id,
          docType: item.docType,
          title: item.title,
          kind: 'missing',
          dedupeKey,
        });
        result.alertsQueued += 1;
        result.alertsSent += sent;
        continue;
      }

      const doc = item.document;
      if (!doc?.expiresAt) continue;

      const expiresAt = new Date(doc.expiresAt);
      const daysLeft = daysUntil(expiresAt);

      if (item.status === 'expired' || daysLeft < 0) {
        const dedupeKey = complianceDedupeKey({
          companyId: company.id,
          docType: item.docType,
          kind: 'expired',
          documentId: doc.id,
          daysLeft: 0,
          expiresAt: doc.expiresAt.toISOString(),
        });

        const { sent } = await sendComplianceAlert({
          companyId: company.id,
          documentId: doc.id,
          docType: item.docType,
          title: item.title,
          kind: 'expired',
          daysLeft: 0,
          expiresAt: doc.expiresAt.toISOString(),
          dedupeKey,
        });
        result.alertsQueued += 1;
        result.alertsSent += sent;
        continue;
      }

      const milestone = milestoneForDaysLeft(daysLeft);
      if (milestone == null) continue;

      const dedupeKey = complianceDedupeKey({
        companyId: company.id,
        docType: item.docType,
        kind: 'expiring',
        documentId: doc.id,
        daysLeft: milestone,
        expiresAt: doc.expiresAt.toISOString(),
      });

      const { sent } = await sendComplianceAlert({
        companyId: company.id,
        documentId: doc.id,
        docType: item.docType,
        title: item.title,
        kind: 'expiring',
        daysLeft: milestone,
        expiresAt: doc.expiresAt.toISOString(),
        dedupeKey,
      });

      result.alertsQueued += 1;
      result.alertsSent += sent;
    }
  }

  return result;
}

export function complianceExpiryJobId(
  companyId: number,
  docType: string,
  kind: ComplianceAlertKind,
  daysLeft: number,
  expiresAt?: string | null
) {
  const datePart = expiresAt ? expiresAt.slice(0, 10) : 'none';
  return `compliance-alert-${companyId}-${docType}-${kind}-${daysLeft}-${datePart}`.replace(
    /[^a-zA-Z0-9-_]/g,
    '_'
  );
}

/** Schedule milestone reminders when a document with expiry is uploaded/updated. */
export async function scheduleComplianceExpiryReminders(input: {
  companyId: number;
  documentId: number;
  docType: string;
  title: string;
  expiresAt: Date;
}) {
  const { automationQueue } = await import('@/lib/automation-queue');
  const dayMs = 24 * 60 * 60 * 1000;
  const daysUntilExpiry = Math.ceil((input.expiresAt.getTime() - Date.now()) / dayMs);
  let scheduled = 0;

  for (const daysLeft of COMPLIANCE_REMINDER_MILESTONES) {
    if (daysLeft > daysUntilExpiry) continue;

    const fireAt = new Date(input.expiresAt.getTime() - daysLeft * dayMs);
    const delay = Math.max(0, fireAt.getTime() - Date.now());
    const kind: ComplianceAlertKind = daysLeft < 0 || input.expiresAt.getTime() < Date.now() ? 'expired' : 'expiring';
    const dedupeKey = complianceDedupeKey({
      companyId: input.companyId,
      docType: input.docType,
      kind,
      documentId: input.documentId,
      daysLeft: Math.max(daysLeft, 0),
      expiresAt: input.expiresAt.toISOString(),
    });

    try {
      await automationQueue.add(
        'compliance-expiry-alert',
        {
          companyId: input.companyId,
          documentId: input.documentId,
          docType: input.docType,
          title: input.title,
          kind,
          daysLeft: Math.max(daysLeft, 0),
          expiresAt: input.expiresAt.toISOString(),
          dedupeKey,
        } satisfies ComplianceExpiryAlertJob,
        {
          jobId: complianceExpiryJobId(
            input.companyId,
            input.docType,
            kind,
            Math.max(daysLeft, 0),
            input.expiresAt.toISOString()
          ),
          delay,
        }
      );
      scheduled += 1;
    } catch (error) {
      console.warn('[Compliance] Could not schedule expiry reminder:', error);
    }
  }

  return scheduled;
}

/**
 * Weekly digest for owners/managers: summary of missing / expiring / expired docs.
 * Designed to run once per week (Monday) via automation scheduler.
 */
export async function sendWeeklyComplianceDigest() {
  const companies = await prisma.company.findMany({
    where: { subscriptionStatus: { not: 'cancelled' } },
    select: { id: true, name: true },
  });

  const result = { companiesScanned: companies.length, digestsSent: 0, skipped: 0 };

  for (const company of companies) {
    const documents = await prisma.complianceDocument.findMany({
      where: { companyId: company.id },
      orderBy: [{ docType: 'asc' }, { updatedAt: 'desc' }],
      include: { uploader: { select: { firstName: true, lastName: true } } },
    });

    const checklist = buildComplianceChecklist(documents);
    const missing = checklist.filter((i) => i.status === 'missing');
    const expiring = checklist.filter((i) => i.status === 'expiring');
    const expired = checklist.filter((i) => i.status === 'expired');

    if (!missing.length && !expiring.length && !expired.length) {
      result.skipped += 1;
      continue;
    }

    const weekKey = isoWeekKey(new Date());
    const lines = [
      `Weekly compliance digest for ${company.name || `Company #${company.id}`}:`,
      `• Missing: ${missing.length}`,
      `• Expiring soon: ${expiring.length}`,
      `• Expired: ${expired.length}`,
    ];
    if (expired.length) {
      lines.push(`Expired: ${expired.map((i) => i.title).join(', ')}`);
    }
    if (expiring.length) {
      lines.push(`Expiring: ${expiring.map((i) => i.title).join(', ')}`);
    }
    if (missing.length) {
      lines.push(`Missing: ${missing.map((i) => i.title).join(', ')}`);
    }
    lines.push('Open Compliance to renew or upload documents.');

    const contacts = await getComplianceContacts(company.id);
    for (const user of contacts) {
      const dedupeKey = `compliance-weekly-digest-${company.id}-${user.id}-${weekKey}`;
      const already = await wasComplianceAlertSent(user.id, dedupeKey);
      if (already) continue;

      await createNotification({
        userId: user.id,
        title: 'Weekly compliance digest',
        message: lines.join('\n'),
        type: 'compliance_alert',
        metadata: {
          dedupeKey,
          companyId: company.id,
          kind: 'weekly_digest',
          missing: missing.length,
          expiring: expiring.length,
          expired: expired.length,
        },
        screenRoute: 'Compliance',
      }).catch((err) => console.warn('[Compliance] weekly digest failed:', err));

      // Best-effort email when user has an email address
      try {
        const fullUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { email: true },
        });
        if (fullUser?.email) {
          const { sendEmail } = await import('@/lib/email');
          await sendEmail({
            to: fullUser.email,
            subject: `TidyFlow · Weekly compliance digest (${company.name || 'your company'})`,
            html: `<p>${lines.map((l) => escapeHtml(l)).join('<br/>')}</p><p><strong>TidyFlow Compliance</strong></p>`,
          });
        }
      } catch (err) {
        console.warn('[Compliance] weekly digest email skipped:', err);
      }

      result.digestsSent += 1;
    }
  }

  return result;
}

function isoWeekKey(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export { COMPLIANCE_DOC_TYPES };
