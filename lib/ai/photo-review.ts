import prisma from '@/lib/prisma';
import { getAIConfig } from '@/lib/ai/config';

/** Auto-resolve pending photo QA when a manager approves the task */
export async function finalizePhotoReviewsOnTaskApproval(
  taskId: number,
  reviewerUserId: number
) {
  const config = await getAIConfig();
  const minScore = config.minPhotoScore ?? 60;

  const photos = await prisma.photo.findMany({
    where: { taskId },
    select: {
      id: true,
      aiPhotoScore: {
        select: { id: true, score: true, reviewStatus: true },
      },
    },
  });

  const now = new Date();
  let approved = 0;
  let keptPending = 0;

  for (const photo of photos) {
    if (!photo.aiPhotoScore) continue;
    if (photo.aiPhotoScore.reviewStatus !== 'pending') continue;

    if (photo.aiPhotoScore.score >= minScore) {
      await prisma.aIPhotoScore.update({
        where: { id: photo.aiPhotoScore.id },
        data: {
          reviewStatus: 'approved',
          reviewedBy: reviewerUserId,
          reviewedAt: now,
          reviewNote: 'Auto-approved when task was approved',
        },
      });
      approved++;
    } else {
      keptPending++;
    }
  }

  return { approved, keptPending, total: photos.length };
}
