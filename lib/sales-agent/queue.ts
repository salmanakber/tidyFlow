import { automationQueue } from '@/lib/automation-queue';
import { discoverViaGooglePlaces, discoverViaSearchEngine, discoverMultiLocation } from './discovery';
import { analyzeLeadCompany } from './analyzer';
import { deliverSalesEmail, retryFailedEmail } from './email';
import prisma from '@/lib/prisma';
import { saLog } from './logger';

function isRedisUnavailable(error: unknown) {
  const err = error as { code?: string; message?: string };
  return err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED');
}

/** Enqueue onto tidyflow-automation (same worker as billing/cron). */
async function addJob(name: string, data: Record<string, unknown>, opts: Record<string, unknown> = {}) {
  try {
    await automationQueue.add(name, data, opts as any);
    return true;
  } catch (error) {
    if (isRedisUnavailable(error)) {
      console.warn(`[SalesAgent] Redis unavailable — running ${name} inline`);
      return false;
    }
    throw error;
  }
}

export async function enqueuePlacesDiscovery(payload: Record<string, unknown>) {
  const queued = await addJob('sa-discover-places', payload, {
    jobId: `sa-discover-places-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  if (!queued) await discoverViaGooglePlaces(payload as any);
  return queued;
}

export async function enqueueSearchDiscovery(payload: Record<string, unknown>) {
  const queued = await addJob('sa-discover-search', payload, {
    jobId: `sa-discover-search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  if (!queued) await discoverViaSearchEngine(payload as any);
  return queued;
}

export async function enqueueMultiDiscovery(payload: Record<string, unknown>) {
  const method = (payload.method as string) || 'google_places';
  const keywords = (payload.keywords as string[]) || [];
  const countries = ((payload.countries as string[]) || []).filter(Boolean);
  const cities = ((payload.cities as string[]) || []).filter(Boolean);
  const countryList = countries.length ? countries : [undefined];
  const cityList = cities.length ? cities : [undefined];
  const totalChunks = Math.max(1, keywords.length * countryList.length * cityList.length);

  const { createDiscoveryGroup } = await import('./groups');
  const group = await createDiscoveryGroup({
    method,
    countries,
    cities,
    keywords,
    totalChunks,
    userId: payload.userId as number | undefined,
    status: 'QUEUED',
  });

  // Chunked queue: one Redis job per keyword × country × city (visible in Job queue panel)
  let enqueued = 0;
  let ranInline = 0;

  for (const keyword of keywords) {
    for (const country of countryList) {
      for (const city of cityList) {
        const chunk = {
          keyword,
          country,
          city,
          maxResults: payload.maxResults,
          campaignId: payload.campaignId,
          userId: payload.userId,
          discoveryGroupId: group.id,
          filters: payload.filters,
        };
        const jobName = method === 'search_engine' ? 'sa-discover-search' : 'sa-discover-places';
        const queued = await addJob(jobName, chunk as any, {
          jobId: `${jobName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        });
        if (queued) {
          enqueued++;
        } else {
          // Redis down — run this chunk inline
          if (method === 'search_engine') await discoverViaSearchEngine(chunk as any);
          else await discoverViaGooglePlaces(chunk as any);
          ranInline++;
        }
      }
    }
  }

  if (enqueued > 0) {
    await (prisma as any).saDiscoveryGroup.update({
      where: { id: group.id },
      data: { status: 'RUNNING' },
    });
  }

  return { enqueued, ranInline, chunks: enqueued + ranInline, discoveryGroupId: group.id, group };
}

export async function enqueueAnalyzeLead(companyId: number) {
  const queued = await addJob(
    'sa-analyze-lead',
    { companyId },
    {
      jobId: `sa-analyze-lead-${companyId}-${Date.now()}`,
      // Prefer analyze throughput when mixed with other automation jobs
      priority: 2,
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
    }
  );
  if (!queued) await analyzeLeadCompany(companyId);
  return queued;
}

/** Queue all analyze jobs; if Redis is down, run a small concurrent inline batch (avoid HTTP timeout). */
export async function enqueueBulkAnalyze(companyIds: number[]) {
  const ids = Array.from(new Set(companyIds.map(Number).filter(Boolean)));
  let queued = 0;
  const inlineIds: number[] = [];

  for (const id of ids) {
    const ok = await addJob(
      'sa-analyze-lead',
      { companyId: id },
      {
        jobId: `sa-analyze-lead-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        priority: 2,
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
      }
    );
    if (ok) queued++;
    else inlineIds.push(id);
  }

  let ranInline = 0;
  let inlineErrors = 0;
  // Cap inline work so the API responds; remaining stay for a later retry
  const INLINE_LIMIT = 8;
  const INLINE_CONCURRENCY = 2;
  const toRun = inlineIds.slice(0, INLINE_LIMIT);
  for (let i = 0; i < toRun.length; i += INLINE_CONCURRENCY) {
    const slice = toRun.slice(i, i + INLINE_CONCURRENCY);
    const results = await Promise.allSettled(slice.map((id) => analyzeLeadCompany(id)));
    for (const r of results) {
      if (r.status === 'fulfilled') ranInline++;
      else inlineErrors++;
    }
  }

  return {
    queued,
    ranInline,
    inlineErrors,
    deferredInline: Math.max(0, inlineIds.length - toRun.length),
    total: ids.length,
  };
}

export async function enqueueSendEmail(sentEmailId: number, delayMs = 0) {
  const queued = await addJob(
    'sa-send-email',
    { sentEmailId },
    { jobId: `sa-send-email-${sentEmailId}`, delay: Math.max(0, delayMs) }
  );
  if (!queued) {
    // Redis down: never fire multi-minute delays immediately — leave QUEUED for sweeper
    if (delayMs > 60_000) {
      console.warn(
        `[SalesAgent] Redis unavailable — email ${sentEmailId} stays QUEUED for ${Math.round(delayMs / 1000)}s`
      );
      return false;
    }
    await deliverSalesEmail(sentEmailId);
  }
  return queued;
}

export async function enqueueRetryEmail(sentEmailId: number) {
  const queued = await addJob(
    'sa-retry-email',
    { sentEmailId },
    { jobId: `sa-retry-email-${sentEmailId}-${Date.now()}` }
  );
  if (!queued) await retryFailedEmail(sentEmailId);
  return queued;
}

export async function enqueueSchedulerJob(jobId: number, delayMs = 0) {
  return addJob(
    'sa-run-scheduler-job',
    { jobId },
    { jobId: `sa-scheduler-${jobId}-${Date.now()}`, delay: delayMs }
  );
}

export async function enqueueSyncReplies() {
  const queued = await addJob(
    'sa-sync-replies',
    {},
    { jobId: `sa-sync-replies-${Date.now()}` }
  );
  if (!queued) {
    const { syncRepliesFromInbox } = await import('./reply-sync');
    return syncRepliesFromInbox();
  }
  return queued;
}

export async function ensureReplySyncScheduler() {
  try {
    await automationQueue.add(
      'sa-sync-replies',
      {},
      {
        jobId: 'sa-sync-replies-repeat',
        repeat: { every: 15 * 60 * 1000 },
      }
    );
    return true;
  } catch (error) {
    if (isRedisUnavailable(error)) {
      console.warn('[SalesAgent] Redis unavailable — reply sync scheduler not registered');
      return false;
    }
    throw error;
  }
}

/** Process sales-agent jobs inside automation-worker. */
export async function processSalesAgentAutomationJob(job: { name: string; data: any; id?: string }) {
  await saLog({
    category: 'job',
    action: `job_start_${job.name}`,
    message: `Starting ${job.name}`,
    details: job.data,
  });

  switch (job.name) {
    case 'sa-discover-places':
    case 'sa-discover-search': {
      try {
        return job.name === 'sa-discover-search'
          ? await discoverViaSearchEngine(job.data)
          : await discoverViaGooglePlaces(job.data);
      } catch (err) {
        if (job.data?.discoveryGroupId) {
          const { recordDiscoveryChunkResult } = await import('./groups');
          await recordDiscoveryChunkResult(job.data.discoveryGroupId, {
            created: 0,
            skipped: 0,
            leads: [],
          });
        }
        throw err;
      }
    }
    case 'sa-discover-multi':
      return discoverMultiLocation(job.data);
    case 'sa-analyze-lead': {
      try {
        return await analyzeLeadCompany(job.data.companyId);
      } catch (err: any) {
        try {
          await (prisma as any).saLeadCompany.update({
            where: { id: job.data.companyId },
            data: {
              crawlStatus: 'failed',
              crawlError: String(err?.message || 'Analyze failed').slice(0, 500),
              lastCrawledAt: new Date(),
            },
          });
        } catch {
          /* lead may have been deleted */
        }
        await saLog({
          level: 'warn',
          category: 'ai',
          action: 'analyze_job_soft_fail',
          message: err?.message || 'Analyze failed',
          entityType: 'SaLeadCompany',
          entityId: job.data.companyId,
          success: false,
        });
        return { companyId: job.data.companyId, skipped: true, error: err?.message };
      }
    }
    case 'sa-send-email':
      return deliverSalesEmail(job.data.sentEmailId);
    case 'sa-retry-email':
      return retryFailedEmail(job.data.sentEmailId);
    case 'sa-sync-replies': {
      const { syncRepliesFromInbox } = await import('./reply-sync');
      return syncRepliesFromInbox();
    }
    case 'sa-run-scheduler-job': {
      const schedulerJob = await (prisma as any).saSchedulerJob.findUnique({
        where: { id: job.data.jobId },
      });
      if (!schedulerJob || !schedulerJob.enabled) return { skipped: true };
      const run = await (prisma as any).saSchedulerRun.create({
        data: { jobId: schedulerJob.id, status: 'running' },
      });
      try {
        const config = schedulerJob.config ? JSON.parse(schedulerJob.config) : {};
        let result: unknown = null;
        if (schedulerJob.jobType === 'lead_discovery') {
          result = await discoverMultiLocation({
            method: config.method || 'google_places',
            keywords: config.keywords || (config.keyword ? [config.keyword] : ['cleaning company']),
            countries: config.countries || (config.country ? [config.country] : []),
            cities: config.cities || (config.city ? [config.city] : []),
            maxResults: config.maxResults,
            userId: config.userId,
          });
        } else if (schedulerJob.jobType === 'website_analysis') {
          const leads = await (prisma as any).saLeadCompany.findMany({
            where: { status: 'NEW', hasWebsite: true },
            take: config.limit || 10,
            select: { id: true },
          });
          for (const lead of leads) await analyzeLeadCompany(lead.id);
          result = { analyzed: leads.length };
        } else if (schedulerJob.jobType === 'email_sending') {
          const pending = await (prisma as any).saSentEmail.findMany({
            where: {
              deliveryStatus: { in: ['QUEUED', 'PENDING'] },
              OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
            },
            take: config.limit || 20,
          });
          for (const email of pending) await deliverSalesEmail(email.id);
          result = { sent: pending.length };
        }
        await (prisma as any).saSchedulerRun.update({
          where: { id: run.id },
          data: { status: 'completed', finishedAt: new Date(), result: JSON.stringify(result) },
        });
        await (prisma as any).saSchedulerJob.update({
          where: { id: schedulerJob.id },
          data: { lastRunAt: new Date() },
        });
        return result;
      } catch (err: any) {
        await (prisma as any).saSchedulerRun.update({
          where: { id: run.id },
          data: { status: 'failed', finishedAt: new Date(), error: err.message },
        });
        throw err;
      }
    }
    default:
      return null;
  }
}

/** @deprecated Separate worker removed — jobs run via automation-worker. */
export function initializeSalesAgentWorker() {
  console.warn(
    '[SalesAgent] initializeSalesAgentWorker is a no-op; jobs use tidyflow-automation via automation-worker'
  );
  return null;
}
