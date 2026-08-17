import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { generateTaskSuggestions } from '@/lib/ai/task-suggestions';
import prisma from '@/lib/prisma';
import { requireAIFeature, logAIUsage } from '@/lib/subscription';
import { withAIActivityGuard, taskActivityFingerprint, companyActivityFingerprint } from '@/lib/ai/activity-queue';
import { getRequestLocale } from '@/lib/locale';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  let companyId = await resolveCompanyIdAsync(request, auth.tokenUser);

  try {
    const body = await request.json();
    const { taskId, propertyId, title, description, scheduledDate } = body;
    const locale = getRequestLocale(request, body);

    if (!taskId && !propertyId) {
      return NextResponse.json(
        { success: false, message: 'taskId or propertyId required' },
        { status: 400 }
      );
    }

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

    const aiCheck = await requireAIFeature(companyId, 'task_suggestions');
    if (!aiCheck.allowed) {
      return NextResponse.json({ success: false, message: aiCheck.message }, { status: 403 });
    }

    const scopeKey = taskId ? `task:${taskId}` : `property:${propertyId}`;
    const { data: suggestions, fromCache } = await withAIActivityGuard(
      {
        companyId,
        feature: 'task_suggestions',
        scopeKey,
        getFingerprint: async () =>
          taskId
            ? taskActivityFingerprint(Number(taskId))
            : companyActivityFingerprint(companyId),
      },
      () =>
        generateTaskSuggestions({
          companyId,
          taskId: taskId ? Number(taskId) : undefined,
          propertyId: propertyId ? Number(propertyId) : undefined,
          title,
          description,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
          locale,
        })
    );

    if (!fromCache) await logAIUsage(companyId, 'task_suggestions');

    if (!suggestions) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: suggestions, fromCache });
  } catch (error) {
    console.error('AI task suggestions error:', error);
    return NextResponse.json({ success: false, message: 'Failed to generate suggestions' }, { status: 500 });
  }
}
