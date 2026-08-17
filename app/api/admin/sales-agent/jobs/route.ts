import { NextRequest, NextResponse } from 'next/server';
import { requireSalesAgentAdmin, jsonOk } from '@/lib/sales-agent/auth';
import { automationQueue } from '@/lib/automation-queue';
import prisma from '@/lib/prisma';

const SA_PREFIXES = [
  'sa-discover',
  'sa-analyze',
  'sa-send',
  'sa-retry',
  'sa-sync',
  'sa-run',
  'sa-scheduler',
];

function isSalesAgentJob(name?: string | null) {
  if (!name) return false;
  return SA_PREFIXES.some((p) => name.startsWith(p));
}

function serializeJob(job: any) {
  return {
    id: job.id,
    name: job.name,
    data: job.data,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
    delay: job.opts?.delay,
  };
}

/** Live view of Redis/BullMQ sales-agent jobs on tidyflow-automation. */
export async function GET(request: NextRequest) {
  const gate = await requireSalesAgentAdmin(request);
  if (gate instanceof NextResponse) return gate;

  try {
    const [waiting, active, delayed, completed, failed] = await Promise.all([
      automationQueue.getJobs(['waiting'], 0, 200),
      automationQueue.getJobs(['active'], 0, 50),
      automationQueue.getJobs(['delayed'], 0, 80),
      automationQueue.getJobs(['completed'], 0, 30),
      automationQueue.getJobs(['failed'], 0, 30),
    ]);

    const filter = (jobs: any[]) =>
      jobs.filter((j) => isSalesAgentJob(j.name)).map(serializeJob);

    const saWaiting = filter(waiting);
    const saActive = filter(active);
    const saDelayed = filter(delayed);
    const saCompleted = filter(completed);
    const saFailed = filter(failed);

    const recentLogs = await (prisma as any).saSystemLog.findMany({
      where: {
        OR: [
          { category: 'job' },
          { category: 'google_places' },
          { category: 'search' },
          { category: 'campaign' },
          { category: 'ai' },
          { action: { contains: 'discover' } },
          { action: { contains: 'analyze' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const byPrefix = (jobs: any[], prefix: string) =>
      jobs.filter((j) => String(j.name || '').startsWith(prefix)).length;

    const counts = {
      waiting: saWaiting.length,
      active: saActive.length,
      delayed: saDelayed.length,
      completed: saCompleted.length,
      failed: saFailed.length,
      // Immediate work only — delayed emails / cron must NOT block UI "done"
      immediate: saWaiting.length + saActive.length,
      discoverWaiting: byPrefix(saWaiting, 'sa-discover'),
      discoverActive: byPrefix(saActive, 'sa-discover'),
      analyzeWaiting: byPrefix(saWaiting, 'sa-analyze'),
      analyzeActive: byPrefix(saActive, 'sa-analyze'),
    };

    return jsonOk({
      redis: true,
      queue: 'tidyflow-automation',
      counts,
      waiting: saWaiting,
      active: saActive,
      delayed: saDelayed,
      completed: saCompleted,
      failed: saFailed,
      recentLogs,
      howItWorks: {
        discovery:
          'Each keyword × country × city runs as its own background search job.',
        emails:
          'A company never gets the same campaign email twice. A 2nd campaign can target people who already got campaign #1.',
      },
    });
  } catch (err: any) {
    return jsonOk({
      redis: false,
      error: err.message || 'Background jobs unavailable',
      counts: {
        waiting: 0,
        active: 0,
        delayed: 0,
        completed: 0,
        failed: 0,
        immediate: 0,
        discoverWaiting: 0,
        discoverActive: 0,
        analyzeWaiting: 0,
        analyzeActive: 0,
      },
      waiting: [],
      active: [],
      delayed: [],
      completed: [],
      failed: [],
      recentLogs: [],
      howItWorks: {
        discovery: 'Search is chunked by keyword × country × city.',
        emails: 'Same campaign cannot email the same company twice.',
      },
    });
  }
}
