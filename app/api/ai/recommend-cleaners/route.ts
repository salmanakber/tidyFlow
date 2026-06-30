import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { recommendCleanersForTask, recommendCleanersForProperty } from '@/lib/ai';
import prisma from '@/lib/prisma';
import { requireAIFeature, logAIUsage } from '@/lib/subscription';
import { withAIActivityGuard, taskActivityFingerprint } from '@/lib/ai/activity-queue';
import { getRequestLocale } from '@/lib/locale';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { taskId, propertyId, scheduledDate, latitude, longitude } = body;
    const locale = getRequestLocale(request, body);

    let companyId = await resolveCompanyIdAsync(request, auth.tokenUser);

    if (!companyId && taskId) {
      const task = await prisma.task.findUnique({
        where: { id: Number(taskId) },
        select: { companyId: true },
      });
      companyId = task?.companyId ?? null;
    }

    if (!companyId && propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: Number(propertyId) },
        select: { companyId: true },
      });
      companyId = property?.companyId ?? null;
    }

    if (!companyId) {
      return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
    }

    if (!taskId && !propertyId) {
      return NextResponse.json(
        { success: false, message: 'taskId or propertyId required' },
        { status: 400 }
      );
    }

    const aiCheck = await requireAIFeature(companyId, 'assignment');
    if (!aiCheck.allowed) {
      return NextResponse.json({ success: false, message: aiCheck.message }, { status: 403 });
    }

    const scopeKey = taskId ? `task:${taskId}` : `property:${propertyId}`;
    const { data: recommendations, fromCache } = await withAIActivityGuard(
      {
        companyId,
        feature: 'assignment',
        scopeKey,
        getFingerprint: async () =>
          taskId
            ? taskActivityFingerprint(Number(taskId))
            : `property:${propertyId}:${scheduledDate || ''}`,
      },
      async () => {
        if (taskId) {
          return recommendCleanersForTask(
            Number(taskId),
            companyId,
            latitude ? Number(latitude) : undefined,
            longitude ? Number(longitude) : undefined,
            locale
          );
        }
        return recommendCleanersForProperty(
          Number(propertyId),
          companyId,
          scheduledDate ? new Date(scheduledDate) : undefined,
          latitude ? Number(latitude) : undefined,
          longitude ? Number(longitude) : undefined,
          locale
        );
      }
    );

    if (!fromCache) await logAIUsage(companyId, 'assignment');

    return NextResponse.json({ success: true, data: recommendations, fromCache });
  } catch (error) {
    console.error('AI recommend error:', error);
    return NextResponse.json({ success: false, message: 'Recommendation failed' }, { status: 500 });
  }
}
