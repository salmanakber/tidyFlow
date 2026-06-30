import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const tasksCompleted = await prisma.task.count({
      where: {
        assignedUserId: tokenUser.userId,
        status: { in: ['APPROVED', 'ARCHIVED'] },
        completedAt: { gte: thirtyDaysAgo },
      },
    });

    const qaScores = await prisma.qAScore.findMany({
      where: {
        task: { assignedUserId: tokenUser.userId },
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const avgQAScore = qaScores.length > 0
      ? qaScores.reduce((sum, s) => sum + s.overallScore, 0) / qaScores.length
      : 0;

    const feedback = await prisma.clientFeedback.findMany({
      where: {
        OR: [
          { cleanerUserId: tokenUser.userId },
          {
            cleanerUserId: null,
            task: {
              OR: [
                { assignedUserId: tokenUser.userId },
                { taskAssignments: { some: { userId: tokenUser.userId } } },
              ],
            },
          },
        ],
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const customerRating = feedback.length > 0
      ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length
      : 0;

    const locationLogs = await prisma.locationLog.findMany({
      where: {
        userId: tokenUser.userId,
        checkType: { in: ['start', 'complete'] },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { withinGeofence: true },
    });

    const onTimeRate =
      locationLogs.length > 0
        ? Math.round(
            (locationLogs.filter((l) => l.withinGeofence).length / locationLogs.length) * 100
          )
        : tasksCompleted > 0
          ? 100
          : 0;

    const aiProfile = await prisma.cleanerAIProfile.findUnique({
      where: { userId: tokenUser.userId },
    });

    return NextResponse.json({
      success: true,
      data: {
        tasksCompleted,
        avgQAScore,
        onTimeRate,
        customerRating,
        aiProfile: aiProfile
          ? {
              qualityScore: aiProfile.qualityScore,
              punctualityScore: aiProfile.punctualityScore,
              reliabilityScore: aiProfile.reliabilityScore,
              clientSatisfaction: aiProfile.clientSatisfaction,
              aiSummary: aiProfile.aiSummary,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Performance stats error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
