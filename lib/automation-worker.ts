import { Worker, Job } from 'bullmq';
import prisma from './prisma';
import { createNotification } from './notifications';
import { UserRole } from '@prisma/client';
import {
  buildPendingPlanSwitchMessage,
  buildTrialUpgradeMessage,
  type BillingNotificationJob,
  type PendingPlanReminderJob,
  type TrialEndingReminderJob,
} from './billing-notification-jobs';
import {
  ensureBillingReminderScanScheduler,
  schedulePendingPlanSwitchReminders,
  scheduleTrialEndingReminders,
} from './automation-queue';
import { getRedisConnectionOptions } from './redis-connection';

async function getBillingContacts(companyId: number) {
  return prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: [UserRole.OWNER, UserRole.COMPANY_ADMIN] },
    },
    select: { id: true },
  });
}

async function sendBillingNotificationToOwners(payload: BillingNotificationJob & { dedupeKey?: string }) {
  const owners = await getBillingContacts(payload.companyId);
  if (!owners.length) return;

  const dedupeKey = payload.dedupeKey || `${payload.notificationType}-${payload.companyId}`;

  for (const owner of owners) {
    const alreadySent = await prisma.notification.findFirst({
      where: {
        userId: owner.id,
        type: payload.notificationType,
        metadata: { contains: dedupeKey },
      },
    });
    if (alreadySent) continue;

    await createNotification({
      userId: owner.id,
      title: payload.title,
      message: payload.message,
      type: payload.notificationType,
      metadata: { ...payload.metadata, dedupeKey, companyId: payload.companyId },
      screenRoute: payload.screenRoute || 'Billing',
    }).catch((err) => console.warn('[Automation] billing notification failed:', err));
  }
}

async function notifyOwnersPlanLimitLow(companyId: number, remaining: number, max: number) {
  const monthKey = new Date().toISOString().slice(0, 7);

  const owners = await getBillingContacts(companyId);
  if (owners.length === 0) return;

  const alreadySent = await prisma.notification.findFirst({
    where: {
      type: 'plan_limit',
      userId: { in: owners.map((o) => o.id) },
      message: { contains: monthKey },
    },
  });
  if (alreadySent) return;

  const message =
    remaining <= 0
      ? `Your AI request limit is exhausted (${max}/${max} this month). Upgrade your plan in Billing to restore AI features.`
      : `Only ${remaining} AI request${remaining === 1 ? '' : 's'} left this month (${max - remaining}/${max} used). Upgrade in Billing to avoid interruptions.`;

  for (const owner of owners) {
    await createNotification({
      userId: owner.id,
      title: remaining <= 0 ? 'AI limit reached' : 'AI quota running low',
      message: `${message} [${monthKey}]`,
      type: 'plan_limit',
      metadata: { companyId, remaining, max, monthKey },
      screenRoute: 'Billing',
    }).catch(() => {});
  }
}

async function handleTrialEndingReminder(data: TrialEndingReminderJob) {
  const trialEndsAt = new Date(data.trialEndsAt);
  if (trialEndsAt.getTime() <= Date.now()) return { skipped: true, reason: 'trial ended' };

  const company = await prisma.company.findUnique({
    where: { id: data.companyId },
    select: { isTrialActive: true, subscriptionStatus: true },
  });
  if (!company?.isTrialActive && company?.subscriptionStatus !== 'trialing') {
    return { skipped: true, reason: 'not trialing' };
  }

  const dedupeKey = `trial-${data.companyId}-${data.daysLeft}-${data.trialEndsAt.slice(0, 10)}`;
  await sendBillingNotificationToOwners({
    companyId: data.companyId,
    title:
      data.daysLeft <= 0
        ? 'Trial ends today — plan upgrading'
        : 'Trial ending soon — plan will upgrade',
    message: buildTrialUpgradeMessage(data.daysLeft, trialEndsAt),
    notificationType: 'trial_ending',
    metadata: {
      dedupeKey,
      daysLeft: data.daysLeft,
      trialEndsAt: data.trialEndsAt,
      subscriptionId: data.subscriptionId,
    },
    screenRoute: 'Billing',
  });

  return { success: true };
}

async function handlePendingPlanReminder(data: PendingPlanReminderJob) {
  const effectiveAt = new Date(data.effectiveAt);
  if (effectiveAt.getTime() <= Date.now()) return { skipped: true, reason: 'past effective date' };

  const company = await prisma.company.findUnique({
    where: { id: data.companyId },
    select: { pendingPlanTier: true, pendingPlanEffectiveAt: true },
  });
  if (!company?.pendingPlanTier || !company.pendingPlanEffectiveAt) {
    return { skipped: true, reason: 'no pending plan' };
  }

  const dedupeKey = `plan-switch-${data.companyId}-${data.daysLeft}-${data.effectiveAt.slice(0, 10)}`;
  await sendBillingNotificationToOwners({
    companyId: data.companyId,
    title: 'Plan change coming up',
    message: buildPendingPlanSwitchMessage(data.daysLeft, data.pendingPlanLabel, effectiveAt),
    notificationType: 'plan_switch',
    metadata: {
      dedupeKey,
      daysLeft: data.daysLeft,
      pendingPlanTier: data.pendingPlanTier,
      effectiveAt: data.effectiveAt,
    },
    screenRoute: 'Billing',
  });

  return { success: true };
}

async function scanBillingReminders() {
  const now = new Date();
  const inFiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  const trialCompanies = await prisma.company.findMany({
    where: {
      isTrialActive: true,
      trialEndsAt: { gt: now, lte: inFiveDays },
    },
    select: { id: true, trialEndsAt: true },
  });

  for (const company of trialCompanies) {
    if (!company.trialEndsAt) continue;
    await scheduleTrialEndingReminders(company.id, company.trialEndsAt);
  }

  const pendingPlanCompanies = await prisma.company.findMany({
    where: {
      pendingPlanTier: { not: null },
      pendingPlanEffectiveAt: { gt: now, lte: inFiveDays },
    },
    select: { id: true, pendingPlanTier: true, pendingPlanEffectiveAt: true },
  });

  for (const company of pendingPlanCompanies) {
    if (!company.pendingPlanTier || !company.pendingPlanEffectiveAt) continue;
    const { getPlanLimits } = await import('./subscription');
    const limits = await getPlanLimits(company.pendingPlanTier);
    await schedulePendingPlanSwitchReminders(
      company.id,
      company.pendingPlanTier,
      limits.label,
      company.pendingPlanEffectiveAt
    );
  }

  return {
    trialScans: trialCompanies.length,
    pendingPlanScans: pendingPlanCompanies.length,
  };
}

async function processAutomationJob(job: Job) {
  switch (job.name) {
    case 'plan-limit-warning': {
      const { companyId, remaining, max } = job.data as {
        companyId: number;
        remaining: number;
        max: number;
      };
      await notifyOwnersPlanLimitLow(companyId, remaining, max);
      return { success: true };
    }

    case 'billing-notification': {
      await sendBillingNotificationToOwners(job.data as BillingNotificationJob & { dedupeKey?: string });
      return { success: true };
    }

    case 'trial-ending-reminder':
      return handleTrialEndingReminder(job.data as TrialEndingReminderJob);

    case 'pending-plan-reminder':
      return handlePendingPlanReminder(job.data as PendingPlanReminderJob);

    case 'scan-billing-reminders':
      return scanBillingReminders();

    default:
      return { skipped: true };
  }
}

let automationWorkerInstance: Worker | null = null;

export function initializeAutomationWorker() {
  if (automationWorkerInstance) {
    return automationWorkerInstance;
  }

  automationWorkerInstance = new Worker('tidyflow-automation', processAutomationJob, {
    connection: getRedisConnectionOptions(),
    concurrency: 3,
  });

  automationWorkerInstance.on('completed', (job) => {
    console.log(`[Automation Worker] Job ${job.name} (${job.id}) completed`);
  });

  automationWorkerInstance.on('failed', (job, err) => {
    console.error(`[Automation Worker] Job ${job?.name} (${job?.id}) failed:`, err);
  });

  automationWorkerInstance.on('error', (err) => {
    console.error('[Automation Worker] error:', err);
  });

  ensureBillingReminderScanScheduler().catch((err) => {
    console.warn('[Automation Worker] billing reminder scan scheduler failed:', err);
  });

  console.log('[Automation Worker] initialized (billing, trial reminders, plan limits)');
  return automationWorkerInstance;
}

export { notifyOwnersPlanLimitLow, sendBillingNotificationToOwners, scanBillingReminders };
