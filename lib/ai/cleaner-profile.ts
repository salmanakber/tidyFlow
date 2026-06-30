import prisma from '@/lib/prisma';
import { getAIConfig, isAIEnabled } from './config';
import { aiChat, parseJSONResponse } from './client';

interface ProfileSummary {
  strengths: string[];
  weaknesses: string[];
  preferredTaskTypes: string[];
  aiSummary: string;
}

export async function recalculateCleanerProfile(userId: number, companyId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      cleanerSkills: { include: { skill: true } },
    },
  });

  if (!user) return null;

  const tasks = await prisma.task.findMany({
    where: {
      companyId,
      OR: [
        { assignedUserId: userId },
        { taskAssignments: { some: { userId } } },
      ],
      status: { in: ['APPROVED', 'COMPLETED', 'SUBMITTED'] },
    },
    select: {
      id: true,
      startedAt: true,
      completedAt: true,
      scheduledDate: true,
      property: { select: { propertyType: true, address: true } },
      qaScores: { select: { overallScore: true } },
      clientFeedback: {
        where: {
          OR: [{ cleanerUserId: userId }, { cleanerUserId: null }],
        },
        select: { rating: true, cleanerUserId: true },
      },
    },
    take: 100,
    orderBy: { completedAt: 'desc' },
  });

  const locationLogs = await prisma.locationLog.findMany({
    where: { userId, checkType: { in: ['start', 'complete'] } },
    select: { withinGeofence: true },
    take: 50,
  });

  const photoScores = await prisma.aIPhotoScore.findMany({
    where: { photo: { userId, task: { companyId } } },
    select: { score: true },
    take: 50,
  });

  const tasksCompleted = tasks.length;
  const qaScores = tasks.flatMap((t) => t.qaScores.map((q) => q.overallScore));
  const feedbackRatings = tasks.flatMap((t) =>
    t.clientFeedback
      .filter((f) => f.cleanerUserId === userId || f.cleanerUserId === null)
      .map((f) => f.rating)
  );
  const photoScoreAvg =
    photoScores.length > 0
      ? photoScores.reduce((s, p) => s + p.score, 0) / photoScores.length
      : 0;

  const qualityScore =
    qaScores.length > 0
      ? (qaScores.reduce((a, b) => a + b, 0) / qaScores.length) * 10
      : photoScoreAvg;

  const punctualityScore =
    locationLogs.length > 0
      ? (locationLogs.filter((l) => l.withinGeofence).length / locationLogs.length) * 100
      : 85;

  const clientSatisfaction =
    feedbackRatings.length > 0
      ? (feedbackRatings.reduce((a, b) => a + b, 0) / feedbackRatings.length) * 20
      : 80;

  const completionTimes = tasks
    .filter((t) => t.startedAt && t.completedAt)
    .map((t) => (t.completedAt!.getTime() - t.startedAt!.getTime()) / 60000);

  const avgCompletionMins =
    completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : null;

  const reliabilityScore = Math.min(100, (tasksCompleted / Math.max(tasksCompleted, 10)) * 100);

  let aiSummaryData: ProfileSummary = {
    strengths: [],
    weaknesses: [],
    preferredTaskTypes: [],
    aiSummary: `${user.firstName || 'Cleaner'} has completed ${tasksCompleted} tasks.`,
  };

  const config = await getAIConfig(companyId);
  if (isAIEnabled(config)) {
    try {
      const skills = user.cleanerSkills.map((cs) => cs.skill.name).join(', ') || 'general cleaning';
      const propertyTypes = [...new Set(tasks.map((t) => t.property.propertyType))].join(', ');

      const prompt = `Analyze this cleaner performance data and respond with JSON only:
{
  "strengths": ["..."],
  "weaknesses": ["..."],
  "preferredTaskTypes": ["..."],
  "aiSummary": "2-3 sentence professional summary"
}
Cleaner: ${user.firstName} ${user.lastName}
Skills: ${skills}
Tasks completed: ${tasksCompleted}
Quality score: ${qualityScore.toFixed(1)}
Punctuality: ${punctualityScore.toFixed(1)}%
Client satisfaction: ${clientSatisfaction.toFixed(1)}%
Property types: ${propertyTypes}
Avg completion: ${avgCompletionMins?.toFixed(0) || 'N/A'} minutes`;

      const aiResult = await aiChat(
        [
          { role: 'system', content: 'You are TidyFlow AI workforce intelligence. Respond with JSON only.' },
          { role: 'user', content: prompt },
        ],
        { companyId, jsonMode: true }
      );
      aiSummaryData = parseJSONResponse<ProfileSummary>(aiResult.text);
    } catch (error) {
      console.error('AI profile summary failed:', error);
    }
  }

  return prisma.cleanerAIProfile.upsert({
    where: { userId },
    create: {
      userId,
      companyId,
      qualityScore,
      punctualityScore,
      reliabilityScore,
      clientSatisfaction,
      avgCompletionMins,
      tasksCompleted,
      strengths: JSON.stringify(aiSummaryData.strengths),
      weaknesses: JSON.stringify(aiSummaryData.weaknesses),
      preferredTaskTypes: JSON.stringify(aiSummaryData.preferredTaskTypes),
      aiSummary: aiSummaryData.aiSummary,
    },
    update: {
      qualityScore,
      punctualityScore,
      reliabilityScore,
      clientSatisfaction,
      avgCompletionMins,
      tasksCompleted,
      strengths: JSON.stringify(aiSummaryData.strengths),
      weaknesses: JSON.stringify(aiSummaryData.weaknesses),
      preferredTaskTypes: JSON.stringify(aiSummaryData.preferredTaskTypes),
      aiSummary: aiSummaryData.aiSummary,
      lastCalculatedAt: new Date(),
    },
  });
}

export async function recalculateCompanyProfiles(companyId: number) {
  const cleaners = await prisma.user.findMany({
    where: { companyId, role: 'CLEANER', isActive: true },
    select: { id: true },
  });

  for (const cleaner of cleaners) {
    await recalculateCleanerProfile(cleaner.id, companyId);
  }
}
