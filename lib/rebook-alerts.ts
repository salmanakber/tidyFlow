import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';

const COMPLETED_STATUSES = ['SUBMITTED', 'QA_REVIEW', 'APPROVED', 'COMPLETED', 'ARCHIVED'] as const;
const UPCOMING_STATUSES = ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING', 'RESERVED'] as const;

export const DEFAULT_REBOOK_THRESHOLD_DAYS = 30;
export const REBOOK_ALERT_DEDUPE_DAYS = 7;

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function resolveLastServiceDate(task: {
  completedAt: Date | null;
  scheduledDate: Date | null;
  updatedAt: Date;
}): Date {
  return task.completedAt ?? task.scheduledDate ?? task.updatedAt;
}

async function wasRecentlyNotified(
  userId: number,
  propertyId: number,
  since: Date
): Promise<boolean> {
  const recent = await prisma.notification.findMany({
    where: {
      userId,
      type: 'rebook_alert',
      createdAt: { gte: since },
    },
    select: { metadata: true },
    take: 100,
  });

  return recent.some((row) => {
    try {
      const meta = JSON.parse(row.metadata || '{}') as { propertyId?: number };
      return meta.propertyId === propertyId;
    } catch {
      return false;
    }
  });
}

async function notifyManagersRebookAlert(input: {
  companyId: number;
  propertyId: number;
  propertyAddress: string;
  daysSinceLastJob: number;
  lastTaskTitle?: string | null;
  dedupeSince: Date;
}) {
  const managers = await prisma.user.findMany({
    where: {
      companyId: input.companyId,
      role: { in: ['MANAGER', 'COMPANY_ADMIN', 'OWNER'] },
      isActive: true,
    },
    select: { id: true },
  });

  let sent = 0;
  for (const manager of managers) {
    const alreadySent = await wasRecentlyNotified(manager.id, input.propertyId, input.dedupeSince);
    if (alreadySent) continue;

    await createNotification({
      userId: manager.id,
      title: 'Re-book opportunity',
      message: `No upcoming job at ${input.propertyAddress}. Last service was ${input.daysSinceLastJob} days ago${input.lastTaskTitle ? ` (${input.lastTaskTitle})` : ''}.`,
      type: 'rebook_alert',
      metadata: {
        propertyId: input.propertyId,
        daysSinceLastJob: input.daysSinceLastJob,
        source: 'rebook_cron',
      },
      screenRoute: 'CreateTask',
      screenParams: { propertyId: input.propertyId },
    }).catch(() => {});

    sent += 1;
  }

  return sent;
}

export interface RebookAlertResult {
  scanned: number;
  eligible: number;
  notified: number;
  skipped: {
    noCompletedJob: number;
    tooRecent: number;
    hasUpcoming: number;
    hasRecurring: number;
    deduped: number;
  };
  errors: string[];
}

export async function runRebookAlerts(options?: {
  thresholdDays?: number;
  companyId?: number;
}): Promise<RebookAlertResult> {
  const thresholdDays =
    options?.thresholdDays ??
    Number(process.env.REBOOK_ALERT_DAYS || DEFAULT_REBOOK_THRESHOLD_DAYS);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - thresholdDays);

  const dedupeSince = new Date();
  dedupeSince.setDate(dedupeSince.getDate() - REBOOK_ALERT_DEDUPE_DAYS);

  const todayStart = startOfTodayUtc();

  const result: RebookAlertResult = {
    scanned: 0,
    eligible: 0,
    notified: 0,
    skipped: {
      noCompletedJob: 0,
      tooRecent: 0,
      hasUpcoming: 0,
      hasRecurring: 0,
      deduped: 0,
    },
    errors: [],
  };

  const properties = await prisma.property.findMany({
    where: {
      isActive: true,
      ...(options?.companyId ? { companyId: options.companyId } : {}),
    },
    select: {
      id: true,
      address: true,
      companyId: true,
    },
  });

  for (const property of properties) {
    result.scanned += 1;

    try {
      const lastTask = await prisma.task.findFirst({
        where: {
          propertyId: property.id,
          status: { in: [...COMPLETED_STATUSES] },
        },
        orderBy: [{ completedAt: 'desc' }, { scheduledDate: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          title: true,
          completedAt: true,
          scheduledDate: true,
          updatedAt: true,
        },
      });

      if (!lastTask) {
        result.skipped.noCompletedJob += 1;
        continue;
      }

      const lastServiceDate = resolveLastServiceDate(lastTask);
      if (lastServiceDate > cutoff) {
        result.skipped.tooRecent += 1;
        continue;
      }

      const [upcomingCount, recurringCount] = await Promise.all([
        prisma.task.count({
          where: {
            propertyId: property.id,
            status: { in: [...UPCOMING_STATUSES] },
            OR: [
              { scheduledDate: { gte: todayStart } },
              { scheduledDate: null },
            ],
          },
        }),
        prisma.recurringJob.count({
          where: { propertyId: property.id, active: true },
        }),
      ]);

      if (upcomingCount > 0) {
        result.skipped.hasUpcoming += 1;
        continue;
      }

      if (recurringCount > 0) {
        result.skipped.hasRecurring += 1;
        continue;
      }

      result.eligible += 1;

      const daysSinceLastJob = Math.floor(
        (Date.now() - lastServiceDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const sent = await notifyManagersRebookAlert({
        companyId: property.companyId,
        propertyId: property.id,
        propertyAddress: property.address,
        daysSinceLastJob,
        lastTaskTitle: lastTask.title,
        dedupeSince,
      });

      if (sent === 0) {
        result.skipped.deduped += 1;
      } else {
        result.notified += sent;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Property ${property.id}: ${message}`);
    }
  }

  return result;
}
