import { Queue, QueueOptions } from 'bullmq';

const queueOptions: QueueOptions = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    ...(process.env.REDIS_URL
      ? (() => {
          try {
            const url = new URL(process.env.REDIS_URL);
            return {
              host: url.hostname,
              port: parseInt(url.port) || 6379,
              password: url.password || undefined,
            };
          } catch {
            return {};
          }
        })()
      : {}),
    maxRetriesPerRequest: null,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 500 },
    removeOnFail: { age: 14 * 24 * 3600 },
  },
};

export const automationQueue = new Queue('tidyflow-automation', queueOptions);

export async function enqueuePlanLimitWarning(companyId: number, remaining: number, max: number) {
  const monthKey = new Date().toISOString().slice(0, 7);
  try {
    await automationQueue.add(
      'plan-limit-warning',
      { companyId, remaining, max, monthKey },
      { jobId: `plan-limit-${companyId}-${monthKey}` }
    );
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      console.warn('[Automation] Redis unavailable — plan limit notification skipped');
      return false;
    }
    throw error;
  }
  return true;
}
