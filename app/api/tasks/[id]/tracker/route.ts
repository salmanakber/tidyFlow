import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { getTaskTrackingOverview, handleTrackerAction, type TrackerAction } from '@/lib/task-tracker';

// GET /api/tasks/[id]/tracker — live GPS + hours overview for managers
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  try {
    const companyId = requireCompanyScope(auth.tokenUser);
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const data = await getTaskTrackingOverview(id, companyId);
    if (!data) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[tracker GET]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/tracker — cleaner start / break / resume / submit
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  if (role !== UserRole.CLEANER) {
    return NextResponse.json({ success: false, message: 'Only cleaners can control the work tracker' }, { status: 403 });
  }

  try {
    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const task = await prisma.task.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        checklistAcknowledgedAt: true,
        assignedUserId: true,
        taskAssignments: { select: { userId: true } },
        checklists: { select: { isCompleted: true } },
      },
    });
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const isAssigned =
      task.assignedUserId === tokenUser.userId ||
      task.taskAssignments.some((ta) => ta.userId === tokenUser.userId);
    if (!isAssigned) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action, latitude, longitude } = body as {
      action?: TrackerAction;
      latitude?: number;
      longitude?: number;
    };

    if (!action || !['start', 'break', 'resume', 'submit'].includes(action)) {
      return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
    }

    if (action === 'start' && !task.checklistAcknowledgedAt) {
      const allComplete =
        task.checklists.length === 0 || task.checklists.every((item) => item.isCompleted);
      if (!allComplete) {
        return NextResponse.json(
          { success: false, message: 'Complete and acknowledge the checklist before starting.' },
          { status: 400 }
        );
      }
      await prisma.task.update({
        where: { id },
        data: { checklistAcknowledgedAt: new Date() },
      });
    }

    if (action === 'submit') {
      if (['SUBMITTED', 'APPROVED', 'COMPLETED', 'ARCHIVED'].includes(task.status)) {
        return NextResponse.json(
          { success: false, message: 'This job has already been submitted.' },
          { status: 400 }
        );
      }
      const existing = await prisma.taskAssignment.findUnique({
        where: { taskId_userId: { taskId: id, userId: tokenUser.userId } },
        select: { startedAt: true, endedAt: true },
      });
      if (!existing?.startedAt) {
        return NextResponse.json(
          { success: false, message: 'Start the job before submitting.' },
          { status: 400 }
        );
      }
      if (existing.endedAt) {
        return NextResponse.json(
          { success: false, message: 'This job has already been submitted.' },
          { status: 400 }
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { firstName: true, lastName: true },
    });
    const cleanerName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();

    const result = await handleTrackerAction({
      taskId: id,
      userId: tokenUser.userId,
      companyId,
      action,
      latitude: latitude != null ? Number(latitude) : undefined,
      longitude: longitude != null ? Number(longitude) : undefined,
      cleanerName,
    });

    const refreshedTask = await prisma.task.findUnique({
      where: { id },
      select: { status: true },
    });

    return NextResponse.json({
      success: true,
      message: `Tracker ${action} successful`,
      data: {
        ...result,
        taskStatus: refreshedTask?.status ?? task.status,
      },
    });
  } catch (error: any) {
    console.error('[tracker POST]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 400 }
    );
  }
}
