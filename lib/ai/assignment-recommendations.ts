import prisma from '@/lib/prisma';
import { getAIConfig, isAIEnabled } from './config';
import { aiChat, parseJSONResponse } from './client';
import { calculateDistance, type Coordinates } from '@/lib/geolocation';

export interface CleanerRecommendation {
  userId: number;
  name: string;
  score: number;
  reason: string;
  distance?: number;
  qualityScore?: number;
  tasksCompleted?: number;
}

export interface AssignmentRecommendations {
  recommended: CleanerRecommendation | null;
  alternatives: CleanerRecommendation[];
  aiGenerated: boolean;
}

export async function recommendCleanersForProperty(
  propertyId: number,
  companyId: number,
  scheduledDate?: Date,
  managerLat?: number,
  managerLng?: number,
  locale?: string | null
): Promise<AssignmentRecommendations> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { requiredSkills: { include: { skill: true } } },
  });

  if (!property || property.companyId !== companyId) {
    return { recommended: null, alternatives: [], aiGenerated: false };
  }

  return scoreCleanersForContext({
    companyId,
    locale,
    property,
    taskTitle: property.address,
    scheduledDate: scheduledDate || new Date(),
    managerLat,
    managerLng,
  });
}

export async function recommendCleanersForTask(
  taskId: number,
  companyId: number,
  managerLat?: number,
  managerLng?: number,
  locale?: string | null
): Promise<AssignmentRecommendations> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      property: {
        include: { requiredSkills: { include: { skill: true } } },
      },
      taskAssignments: true,
    },
  });

  if (!task || task.companyId !== companyId) {
    return { recommended: null, alternatives: [], aiGenerated: false };
  }

  return scoreCleanersForContext({
    companyId,
    locale,
    property: task.property,
    taskTitle: task.title,
    scheduledDate: task.scheduledDate || new Date(),
    managerLat,
    managerLng,
  });
}

async function scoreCleanersForContext(ctx: {
  companyId: number;
  locale?: string | null;
  property: {
    id: number;
    address: string;
    propertyType: string;
    latitude: number | null;
    longitude: number | null;
    requiredSkills: Array<{ skillId: number; isRequired: boolean; skill: { name: string } }>;
  };
  taskTitle: string;
  scheduledDate: Date;
  managerLat?: number;
  managerLng?: number;
}): Promise<AssignmentRecommendations> {
  const cleaners = await prisma.user.findMany({
    where: { companyId: ctx.companyId, role: 'CLEANER', isActive: true },
    include: {
      cleanerAIProfile: true,
      cleanerSkills: { include: { skill: true } },
      availability: true,
    },
  });

  const scheduledDate = ctx.scheduledDate;
  const dayOfWeek = scheduledDate.getDay();

  const requiredSkillIds = ctx.property.requiredSkills
    .filter((s) => s.isRequired)
    .map((s) => s.skillId);

  const propertyCoords: Coordinates | null =
    ctx.property.latitude && ctx.property.longitude
      ? { latitude: ctx.property.latitude, longitude: ctx.property.longitude }
      : null;

  const scored: CleanerRecommendation[] = [];

  for (const cleaner of cleaners) {
    const profile = cleaner.cleanerAIProfile;
    const cleanerSkillIds = cleaner.cleanerSkills.map((cs) => cs.skillId);
    const hasRequiredSkills =
      requiredSkillIds.length === 0 ||
      requiredSkillIds.every((id) => cleanerSkillIds.includes(id));

    if (!hasRequiredSkills) continue;

    const dayAvailability = cleaner.availability.find((a) => a.dayOfWeek === dayOfWeek);
    if (dayAvailability && !dayAvailability.isAvailable) continue;

    const existingAssignments = await prisma.taskAssignment.count({
      where: {
        userId: cleaner.id,
        task: {
          scheduledDate: {
            gte: new Date(scheduledDate.setHours(0, 0, 0, 0)),
            lte: new Date(scheduledDate.setHours(23, 59, 59, 999)),
          },
          status: { notIn: ['ARCHIVED', 'REJECTED'] },
        },
      },
    });

    if (existingAssignments >= 3) continue;

    let distance: number | undefined;
    if (propertyCoords && ctx.managerLat && ctx.managerLng) {
      distance = Math.round(
        calculateDistance(propertyCoords, {
          latitude: ctx.managerLat,
          longitude: ctx.managerLng,
        })
      );
    }

    const qualityScore = profile?.qualityScore ?? 70;
    const punctuality = profile?.punctualityScore ?? 75;
    const clientSat = profile?.clientSatisfaction ?? 75;
    const workloadPenalty = existingAssignments * 5;

    const score =
      qualityScore * 0.35 +
      punctuality * 0.25 +
      clientSat * 0.25 +
      (profile?.reliabilityScore ?? 70) * 0.15 -
      workloadPenalty;

    const name = `${cleaner.firstName || ''} ${cleaner.lastName || ''}`.trim() || cleaner.email;
    const tasksCompleted = profile?.tasksCompleted ?? 0;

    let reason = `Quality ${qualityScore.toFixed(0)}%, punctuality ${punctuality.toFixed(0)}%`;
    if (tasksCompleted > 0) reason += `, ${tasksCompleted} similar tasks completed`;
    if (distance !== undefined) reason += `, ${(distance / 1000).toFixed(1)}km from property`;

    scored.push({
      userId: cleaner.id,
      name,
      score: Math.round(score),
      reason,
      distance,
      qualityScore,
      tasksCompleted,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  let recommendations: AssignmentRecommendations = {
    recommended: scored[0] || null,
    alternatives: scored.slice(1, 3),
    aiGenerated: false,
  };

  const config = await getAIConfig(ctx.companyId);
  if (isAIEnabled(config) && config.assignmentRecommend && scored.length > 0) {
    try {
      const prompt = `You are TidyFlow AI assignment advisor. Given task and cleaner data, refine recommendations.
Task: ${ctx.taskTitle} at ${ctx.property.address} (${ctx.property.propertyType})
Cleaners (JSON): ${JSON.stringify(scored.slice(0, 5))}

Respond with JSON only:
{
  "recommendedUserId": <number>,
  "reasons": { "<userId>": "<human readable reason>" }
}
Managers always decide. Provide helpful explanations only.`;

      const aiResult = await aiChat(
        [
          { role: 'system', content: 'TidyFlow AI assignment recommendations. JSON only.' },
          { role: 'user', content: prompt },
        ],
        { companyId: ctx.companyId, jsonMode: true, locale: ctx.locale }
      );

      const aiResponse = parseJSONResponse<{
        recommendedUserId: number;
        reasons: Record<string, string>;
      }>(aiResult.text);

      const applyReason = (rec: CleanerRecommendation) => ({
        ...rec,
        reason: aiResponse.reasons[String(rec.userId)] || rec.reason,
      });

      const recommended =
        scored.find((s) => s.userId === aiResponse.recommendedUserId) || scored[0];

      recommendations = {
        recommended: applyReason(recommended),
        alternatives: scored
          .filter((s) => s.userId !== recommended.userId)
          .slice(0, 2)
          .map(applyReason),
        aiGenerated: true,
      };
    } catch (error) {
      console.error('AI assignment refinement failed:', error);
    }
  }

  return recommendations;
}
