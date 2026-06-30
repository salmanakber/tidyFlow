import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { getAIConfig, getGlobalAIConfigurationRow, isAIEnabled, hasAIProviderKeys } from '@/lib/ai';
import { withAIActivityGuard, companyActivityFingerprint } from '@/lib/ai/activity-queue';
import { getCompanyPlan } from '@/lib/subscription';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json(
      { success: false, message: 'Company required' },
      { status: 400 }
    );
  }

  try {
    const { data: dashboardData, fromCache } = await withAIActivityGuard(
      {
        companyId,
        feature: 'dashboard',
        scopeKey: 'summary',
        getFingerprint: () => companyActivityFingerprint(companyId),
      },
      async () => {
    const [globalRow, config, planInfo] = await Promise.all([
      getGlobalAIConfigurationRow(),
      getAIConfig(),
      getCompanyPlan(companyId),
    ]);
    const minScore = config.minPhotoScore ?? 60;

    const [insights, photoAlerts, unassignedTasks, recentPhotoScores, recentTasks] = await Promise.all([
      prisma.aIInsight.findMany({
        where: { companyId, dismissedAt: null },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      prisma.aIPhotoScore.findMany({
        where: {
          score: { lt: minScore },
          photo: { task: { companyId } },
        },
        orderBy: { analyzedAt: 'desc' },
        take: 8,
        include: {
          photo: {
            select: {
              id: true,
              url: true,
              photoType: true,
              task: {
                select: {
                  id: true,
                  title: true,
                  property: { select: { address: true } },
                },
              },
            },
          },
        },
      }),
      prisma.task.findMany({
        where: {
          companyId,
          status: { in: ['DRAFT', 'PLANNED'] },
          assignedUserId: null,
          taskAssignments: { none: {} },
        },
        orderBy: { scheduledDate: 'asc' },
        take: 8,
        include: {
          property: { select: { id: true, address: true } },
        },
      }),
      prisma.aIPhotoScore.findMany({
        where: { photo: { task: { companyId } } },
        orderBy: { analyzedAt: 'desc' },
        take: 12,
        include: {
          photo: {
            select: {
              id: true,
              url: true,
              photoType: true,
              task: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  property: { select: { address: true } },
                },
              },
            },
          },
        },
      }),
      prisma.task.findMany({
        where: {
          companyId,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          property: { select: { address: true } },
        },
      }),
    ]);

    const photoVerification = photoAlerts.map((row) => {
      let flags: string[] = [];
      try {
        flags = row.flags ? JSON.parse(row.flags) : [];
      } catch {
        flags = [];
      }
      return {
        id: row.id,
        photoId: row.photoId,
        score: row.score,
        summary: row.summary,
        flags,
        analyzedAt: row.analyzedAt,
        photoUrl: row.photo.url,
        photoType: row.photo.photoType,
        taskId: row.photo.task.id,
        taskTitle: row.photo.task.title,
        propertyAddress: row.photo.task.property?.address,
      };
    });

    const recentPhotos = recentPhotoScores.map((row) => {
      let flags: string[] = [];
      try {
        flags = row.flags ? JSON.parse(row.flags) : [];
      } catch {
        flags = [];
      }
      return {
        id: row.id,
        photoId: row.photoId,
        score: row.score,
        summary: row.summary,
        flags,
        analyzedAt: row.analyzedAt,
        photoUrl: row.photo.url,
        photoType: row.photo.photoType,
        taskId: row.photo.task.id,
        taskTitle: row.photo.task.title,
        taskStatus: row.photo.task.status,
        propertyAddress: row.photo.task.property?.address,
        reviewStatus: (row as { reviewStatus?: string }).reviewStatus ?? 'pending',
        needsReview: row.score < minScore,
      };
    });

    return {
        companyId,
        aiEnabled: isAIEnabled(config),
        hasProviderKeys: hasAIProviderKeys(config),
        settingsEnabled: config.enabled,
        hasStoredGroqKey: !!globalRow?.groqApiKey?.trim(),
        hasStoredGoogleKey: !!globalRow?.googleApiKey?.trim(),
        groqKeySource: config.groqKeySource,
        googleKeySource: config.googleKeySource,
        minPhotoScore: minScore,
        planTier: planInfo?.company.planTier || 'STANDARD',
        planLabel: planInfo?.limits.label || 'Standard',
        insights,
        photoVerification,
        recentPhotoScores: recentPhotos,
        recentTasks: recentTasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          createdAt: t.createdAt,
          propertyAddress: t.property?.address,
        })),
        unassignedTasks: unassignedTasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          scheduledDate: t.scheduledDate,
          propertyId: t.propertyId,
          propertyAddress: t.property?.address,
        })),
    };
      }
    );

    return NextResponse.json({
      success: true,
      data: dashboardData,
      fromCache,
    });
  } catch (error) {
    console.error('AI dashboard GET error:', error);
    return NextResponse.json({ success: false, message: 'Failed to load AI dashboard' }, { status: 500 });
  }
}
