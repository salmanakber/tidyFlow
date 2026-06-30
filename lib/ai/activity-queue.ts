import prisma from '@/lib/prisma';
import { hashFingerprint } from '@/lib/subscription';

export type AIFeatureKey =
  | 'dashboard'
  | 'task_suggestions'
  | 'insights'
  | 'cleaner_profile'
  | 'photo_analysis'
  | 'assignment';

interface GuardOptions {
  companyId: number;
  feature: AIFeatureKey;
  scopeKey: string;
  getFingerprint: () => Promise<string>;
}

interface CacheRow {
  activityFingerprint: string;
  cachedResult: string | null;
  updatedAt: Date;
}

/** Returns cached result when activity unchanged; otherwise runs fn and stores result. */
export async function withAIActivityGuard<T>(
  options: GuardOptions,
  fn: () => Promise<T>
): Promise<{ data: T; fromCache: boolean }> {
  const fingerprint = await options.getFingerprint();

  const existing = await prisma.aIActivityCache.findUnique({
    where: {
      companyId_feature_scopeKey: {
        companyId: options.companyId,
        feature: options.feature,
        scopeKey: options.scopeKey,
      },
    },
  });

  if (existing && existing.activityFingerprint === fingerprint && existing.cachedResult) {
    try {
      return { data: JSON.parse(existing.cachedResult) as T, fromCache: true };
    } catch {
      /* stale cache — regenerate */
    }
  }

  const data = await fn();
  const cachedResult = JSON.stringify(data);

  await prisma.aIActivityCache.upsert({
    where: {
      companyId_feature_scopeKey: {
        companyId: options.companyId,
        feature: options.feature,
        scopeKey: options.scopeKey,
      },
    },
    create: {
      companyId: options.companyId,
      feature: options.feature,
      scopeKey: options.scopeKey,
      activityFingerprint: fingerprint,
      cachedResult,
      lastActivityAt: new Date(),
    },
    update: {
      activityFingerprint: fingerprint,
      cachedResult,
      lastActivityAt: new Date(),
    },
  });

  return { data, fromCache: false };
}

/** Build fingerprint from company-level activity timestamps */
export async function companyActivityFingerprint(companyId: number): Promise<string> {
  const [taskAgg, photoAgg, feedbackAgg, insightAgg] = await Promise.all([
    prisma.task.aggregate({
      where: { companyId },
      _max: { updatedAt: true },
      _count: true,
    }),
    prisma.photo.count({
      where: { task: { companyId } },
    }),
    prisma.clientFeedback.aggregate({
      where: { task: { companyId } },
      _max: { createdAt: true },
      _count: true,
    }),
    prisma.aIInsight.aggregate({
      where: { companyId },
      _max: { createdAt: true },
      _count: true,
    }),
  ]);

  return hashFingerprint([
    companyId,
    taskAgg._max.updatedAt,
    taskAgg._count,
    photoAgg,
    feedbackAgg._max.createdAt,
    feedbackAgg._count,
    insightAgg._max.createdAt,
    insightAgg._count,
  ]);
}

/** Task-level fingerprint for suggestions / photo scores */
export async function taskActivityFingerprint(taskId: number): Promise<string> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      updatedAt: true,
      status: true,
      _count: { select: { photos: true, checklists: true, clientFeedback: true } },
    },
  });
  if (!task) return hashFingerprint([taskId, 'missing']);

  const photoScores = await prisma.aIPhotoScore.count({
    where: { photo: { taskId } },
  });

  return hashFingerprint([
    taskId,
    task.updatedAt,
    task.status,
    task._count.photos,
    task._count.checklists,
    task._count.clientFeedback,
    photoScores,
  ]);
}

export async function invalidateAIActivityCache(
  companyId: number,
  feature?: AIFeatureKey,
  scopeKey?: string
) {
  await prisma.aIActivityCache.deleteMany({
    where: {
      companyId,
      ...(feature ? { feature } : {}),
      ...(scopeKey ? { scopeKey } : {}),
    },
  });
}

export async function getCachedAIResult<T>(
  companyId: number,
  feature: AIFeatureKey,
  scopeKey: string
): Promise<T | null> {
  const row = await prisma.aIActivityCache.findUnique({
    where: {
      companyId_feature_scopeKey: { companyId, feature, scopeKey },
    },
  });
  if (!row?.cachedResult) return null;
  try {
    return JSON.parse(row.cachedResult) as T;
  } catch {
    return null;
  }
}

export type { CacheRow };
