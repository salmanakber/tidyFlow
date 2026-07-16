import prisma from '@/lib/prisma';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogCategory =
  | 'api'
  | 'google_places'
  | 'search'
  | 'crawl'
  | 'ai'
  | 'smtp'
  | 'email'
  | 'reply'
  | 'scheduler'
  | 'campaign'
  | 'user'
  | 'job'
  | 'exception';

export interface LogInput {
  level?: LogLevel;
  category: LogCategory;
  action: string;
  message: string;
  details?: unknown;
  entityType?: string;
  entityId?: string | number;
  userId?: number;
  durationMs?: number;
  success?: boolean;
}

export async function saLog(input: LogInput) {
  try {
    await (prisma as any).saSystemLog.create({
      data: {
        level: input.level || 'info',
        category: input.category,
        action: input.action,
        message: input.message,
        details: input.details != null ? JSON.stringify(input.details) : null,
        entityType: input.entityType || null,
        entityId: input.entityId != null ? String(input.entityId) : null,
        userId: input.userId || null,
        durationMs: input.durationMs || null,
        success: input.success !== false,
      },
    });
  } catch (err) {
    console.error('[SalesAgent] Failed to write system log:', err);
  }
}

export async function logAiUsage(opts: {
  provider: string;
  model?: string;
  action: string;
  tokensUsed?: number;
  success?: boolean;
  error?: string;
  latencyMs?: number;
  companyId?: number;
}) {
  try {
    await (prisma as any).saAiUsageLog.create({
      data: {
        provider: opts.provider,
        model: opts.model,
        action: opts.action,
        tokensUsed: opts.tokensUsed,
        success: opts.success !== false,
        error: opts.error,
        latencyMs: opts.latencyMs,
        companyId: opts.companyId,
      },
    });
  } catch (err) {
    console.error('[SalesAgent] Failed to write AI usage log:', err);
  }
}
