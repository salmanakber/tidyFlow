#!/usr/bin/env node

/**
 * Unified TidyFlow BullMQ worker — recurring jobs + billing/automation notifications.
 *
 * Usage:
 *   npm run worker
 *   pm2 start workers/recurring-jobs-worker.ts --interpreter tsx
 */

import { initializeRecurringJobsWorker } from '../lib/recurring-jobs-worker';
import { initializeAutomationWorker } from '../lib/automation-worker';
import { recoverRecurringJobs } from '../lib/recurring-jobs-recovery';

process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

async function startWorker() {
  console.log('[Worker] ========================================');
  console.log('[Worker] Starting TidyFlow unified worker');
  console.log('[Worker] ========================================');
  console.log(`[Worker] Node version: ${process.version}`);
  console.log(`[Worker] PID: ${process.pid}`);
  console.log(
    `[Worker] Redis: ${process.env.REDIS_URL || `${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`}`
  );
  console.log('[Worker] Queues: recurring-jobs, tidyflow-automation (billing + compliance alerts)');
  console.log('[Worker] ========================================');

  try {
    console.log('[Worker] Initializing recurring jobs worker...');
    initializeRecurringJobsWorker();
    console.log('[Worker] ✓ Recurring jobs worker ready');

    console.log('[Worker] Initializing automation/billing worker...');
    initializeAutomationWorker();
    console.log('[Worker] ✓ Automation worker ready (billing, trial reminders, compliance expiry pushes)');

    console.log('[Worker] Running recurring job recovery...');
    try {
      await recoverRecurringJobs();
      console.log('[Worker] ✓ Recurring job recovery completed');
    } catch (recoveryError: unknown) {
      const message = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
      if (message.includes('ECONNREFUSED') || message.includes('Redis')) {
        console.error('[Worker] ❌ Recovery failed — Redis unavailable');
        console.error('[Worker] Worker processes will retry when Redis is available');
      } else {
        throw recoveryError;
      }
    }

    console.log('[Worker] ========================================');
    console.log('[Worker] ✓ Unified worker is running');
    console.log('[Worker] ========================================');
  } catch (error: unknown) {
    console.error('[Worker] ❌ Failed to start worker:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ECONNREFUSED') || message.includes('Redis')) {
      process.exit(1);
    }
    process.exit(1);
  }
}

startWorker().catch((error) => {
  console.error('[Worker] Fatal error during startup:', error);
  process.exit(1);
});
