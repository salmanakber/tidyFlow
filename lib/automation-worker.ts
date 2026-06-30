import { Worker, Job } from 'bullmq';
import prisma from './prisma';
import { createNotification } from './notifications';
import { UserRole } from '@prisma/client';

const connectionOptions = (() => {
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        maxRetriesPerRequest: null,
      };
    } catch {
      /* fallback */
    }
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };
})();

async function notifyOwnersPlanLimitLow(companyId: number, remaining: number, max: number) {
  const monthKey = new Date().toISOString().slice(0, 7);

  const owners = await prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: [UserRole.OWNER, UserRole.COMPANY_ADMIN] },
    },
    select: { id: true },
  });

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

export const automationWorker = new Worker(
  'tidyflow-automation',
  async (job: Job) => {
    if (job.name === 'plan-limit-warning') {
      const { companyId, remaining, max } = job.data as {
        companyId: number;
        remaining: number;
        max: number;
      };
      await notifyOwnersPlanLimitLow(companyId, remaining, max);
      return { success: true };
    }
    return { skipped: true };
  },
  { connection: connectionOptions }
);

automationWorker.on('error', (err) => {
  console.error('[Automation Worker] error:', err);
});

export function initializeAutomationWorker() {
  console.log('[Automation Worker] initialized');
  return automationWorker;
}

/** Direct call when queue unavailable */
export { notifyOwnersPlanLimitLow };
