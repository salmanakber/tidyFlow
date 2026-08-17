import prisma from '@/lib/prisma';
import { createNotification, notifyManagersClientReview } from '@/lib/notifications';
import { recalculateCleanerProfile } from '@/lib/ai/cleaner-profile';
import { invalidateAIActivityCache } from '@/lib/ai/activity-queue';

import { getPublicWebOrigin } from '@/lib/domains';

export function buildReviewLink(token: string): string {
  const baseUrl = getPublicWebOrigin();
  return `${baseUrl}/review/${token}`;
}

export async function getTaskCleanerIds(taskId: number): Promise<number[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      assignedUserId: true,
      taskAssignments: { select: { userId: true } },
    },
  });
  if (!task) return [];

  const ids = new Set<number>();
  if (task.assignedUserId) ids.add(task.assignedUserId);
  for (const a of task.taskAssignments) ids.add(a.userId);
  return Array.from(ids);
}

export async function assignClientReviewToCleaners(input: {
  taskId: number;
  companyId: number;
  rating: number;
  comment?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  isPublic: boolean;
}) {
  const cleanerIds = await getTaskCleanerIds(input.taskId);
  if (cleanerIds.length === 0) return [];

  const created = await prisma.$transaction(
    cleanerIds.map((cleanerUserId) =>
      prisma.clientFeedback.create({
        data: {
          taskId: input.taskId,
          cleanerUserId,
          rating: input.rating,
          comment: input.isPublic
            ? input.comment
            : `[Private client feedback] ${input.comment || ''}`,
          clientName: input.clientName,
          clientEmail: input.clientEmail,
        },
      })
    )
  );

  const stars = '★'.repeat(input.rating);
  for (const cleanerUserId of cleanerIds) {
    await createNotification({
      userId: cleanerUserId,
      title: input.rating >= 4 ? 'Client left a positive review' : 'Client feedback received',
      message: `${stars} (${input.rating}/5) on a job you completed.${input.comment ? ` "${input.comment.slice(0, 80)}"` : ''}`,
      type: 'qa_result',
      metadata: { taskId: input.taskId, rating: input.rating, source: 'client_review' },
      screenRoute: 'ClientFeedback',
      screenParams: { taskId: input.taskId },
    }).catch(() => {});

    recalculateCleanerProfile(cleanerUserId, input.companyId).catch((err) =>
      console.warn('Cleaner profile recalc after review:', err)
    );
  }

  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { property: { select: { address: true } } },
  });

  await notifyManagersClientReview({
    companyId: input.companyId,
    taskId: input.taskId,
    rating: input.rating,
    propertyAddress: task?.property?.address,
  }).catch(() => {});

  invalidateAIActivityCache(input.companyId).catch(() => {});

  return created;
}
