import { Queue, QueueOptions } from 'bullmq';
import type {
  BillingNotificationJob,
  PendingPlanReminderJob,
  TrialEndingReminderJob,
} from '@/lib/billing-notification-jobs';
import {
  milestoneFireTime,
  pendingPlanReminderJobId,
  trialReminderJobId,
  BILLING_REMINDER_MILESTONES,
} from '@/lib/billing-notification-jobs';
import { getRedisConnectionOptions } from '@/lib/redis-connection';

const queueOptions: QueueOptions = {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 500 },
    removeOnFail: { age: 14 * 24 * 3600 },
  },
};

export const automationQueue = new Queue('tidyflow-automation', queueOptions);

function isRedisUnavailable(error: unknown) {
  const err = error as { code?: string; message?: string };
  return err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED');
}

export async function enqueuePlanLimitWarning(companyId: number, remaining: number, max: number) {
  const monthKey = new Date().toISOString().slice(0, 7);
  try {
    await automationQueue.add(
      'plan-limit-warning',
      { companyId, remaining, max, monthKey },
      { jobId: `plan-limit-${companyId}-${monthKey}` }
    );
  } catch (error) {
    if (isRedisUnavailable(error)) {
      console.warn('[Automation] Redis unavailable — plan limit notification skipped');
      return false;
    }
    throw error;
  }
  return true;
}

/** Queue in-app + push notification for billing events (webhooks, payments, etc.). */
export async function enqueueBillingNotification(payload: BillingNotificationJob) {
  const dedupeKey =
    (payload.metadata?.dedupeKey as string | undefined) ||
    `${payload.notificationType}-${payload.companyId}-${payload.title}`.slice(0, 120);

  try {
    await automationQueue.add(
      'billing-notification',
      { ...payload, dedupeKey },
      {
        jobId: `billing-notify-${dedupeKey}`.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 200),
      }
    );
    return true;
  } catch (error) {
    if (isRedisUnavailable(error)) {
      console.warn('[Automation] Redis unavailable — billing notification skipped');
      return false;
    }
    throw error;
  }
}

export async function scheduleTrialEndingReminders(
  companyId: number,
  trialEndsAt: Date,
  subscriptionId?: string
) {
  if (trialEndsAt.getTime() <= Date.now()) return 0;

  const dayMs = 24 * 60 * 60 * 1000;
  const daysUntilEnd = Math.ceil((trialEndsAt.getTime() - Date.now()) / dayMs);
  let catchUpIndex = 0;
  let scheduled = 0;

  for (const daysLeft of BILLING_REMINDER_MILESTONES) {
    if (daysLeft > daysUntilEnd) continue;

    const fireAt = milestoneFireTime(trialEndsAt, daysLeft);
    let delay = Math.max(0, fireAt.getTime() - Date.now());

    if (delay === 0 && trialEndsAt.getTime() > Date.now()) {
      delay = catchUpIndex * 1500;
      catchUpIndex += 1;
    }

    const job: TrialEndingReminderJob = {
      companyId,
      trialEndsAt: trialEndsAt.toISOString(),
      daysLeft,
      subscriptionId,
    };

    try {
      await automationQueue.add('trial-ending-reminder', job, {
        jobId: trialReminderJobId(companyId, trialEndsAt, daysLeft),
        delay,
      });
      scheduled += 1;
    } catch (error) {
      if (isRedisUnavailable(error)) {
        console.warn('[Automation] Redis unavailable — trial reminder not scheduled');
        return scheduled;
      }
      throw error;
    }
  }

  return scheduled;
}

export async function schedulePendingPlanSwitchReminders(
  companyId: number,
  pendingPlanTier: string,
  pendingPlanLabel: string,
  effectiveAt: Date
) {
  if (effectiveAt.getTime() <= Date.now()) return 0;

  const dayMs = 24 * 60 * 60 * 1000;
  const daysUntil = Math.ceil((effectiveAt.getTime() - Date.now()) / dayMs);
  let catchUpIndex = 0;
  let scheduled = 0;

  for (const daysLeft of BILLING_REMINDER_MILESTONES) {
    if (daysLeft > daysUntil) continue;

    const fireAt = milestoneFireTime(effectiveAt, daysLeft);
    let delay = Math.max(0, fireAt.getTime() - Date.now());
    if (delay === 0) {
      delay = catchUpIndex * 1500;
      catchUpIndex += 1;
    }

    const job: PendingPlanReminderJob = {
      companyId,
      pendingPlanTier,
      pendingPlanLabel,
      effectiveAt: effectiveAt.toISOString(),
      daysLeft,
    };

    try {
      await automationQueue.add('pending-plan-reminder', job, {
        jobId: pendingPlanReminderJobId(companyId, effectiveAt, daysLeft),
        delay,
      });
      scheduled += 1;
    } catch (error) {
      if (isRedisUnavailable(error)) {
        console.warn('[Automation] Redis unavailable — plan switch reminder not scheduled');
        return scheduled;
      }
      throw error;
    }
  }

  return scheduled;
}

/** Repeatable scan — catches trials / pending plan switches inside the 5-day window. */
export async function ensureBillingReminderScanScheduler() {
  try {
    await automationQueue.add(
      'scan-billing-reminders',
      {},
      {
        jobId: 'scan-billing-reminders-repeat',
        repeat: { every: 6 * 60 * 60 * 1000 },
      }
    );
  } catch (error) {
    if (isRedisUnavailable(error)) {
      console.warn('[Automation] Redis unavailable — billing reminder scan not scheduled');
      return false;
    }
    throw error;
  }
  return true;
}

/** Daily scan for expiring/expired/missing compliance documents. */
export async function ensureComplianceReminderScanScheduler() {
  try {
    await automationQueue.add(
      'scan-compliance-expiry',
      {},
      {
        jobId: 'scan-compliance-expiry-repeat',
        repeat: { every: 24 * 60 * 60 * 1000 },
      }
    );
  } catch (error) {
    if (isRedisUnavailable(error)) {
      console.warn('[Automation] Redis unavailable — compliance reminder scan not scheduled');
      return false;
    }
    throw error;
  }
  return true;
}

export async function cancelTrialReminderJobs(companyId: number, trialEndsAt: Date) {
  for (const daysLeft of BILLING_REMINDER_MILESTONES) {
    const jobId = trialReminderJobId(companyId, trialEndsAt, daysLeft);
    try {
      const job = await automationQueue.getJob(jobId);
      if (job) await job.remove();
    } catch {
      /* ignore */
    }
  }
}
