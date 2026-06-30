import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { TaskStatus, UserRole } from '@prisma/client';
import { finalizePhotoReviewsOnTaskApproval } from '@/lib/ai/photo-review';
import { notifyTaskApproved } from '@/lib/notifications';
import { invalidateAIActivityCache } from '@/lib/ai/activity-queue';

// PATCH /api/tasks/[id]/status
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  try {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });

    // Access control
    if (!(role === UserRole.OWNER || role === UserRole.DEVELOPER)) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || task.companyId !== companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
      if (role === UserRole.CLEANER) {
        // Check if cleaner is assigned via assignedUserId (backward compatibility) or taskAssignments
        const taskWithAssignments = await prisma.task.findUnique({
          where: { id },
          select: {
            assignedUserId: true,
            taskAssignments: {
              select: {
                user: {
                  select: { id: true },
                },
              },
            },
          },
        });
        const isAssigned = taskWithAssignments?.assignedUserId === tokenUser.userId || 
          taskWithAssignments?.taskAssignments?.some(ta => ta.user.id === tokenUser.userId);
        if (!isAssigned) {
          return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
        }
      }
    }

    const body = await request.json();
    const { status, latitude, longitude } = body as {
      status?: TaskStatus;
      latitude?: number;
      longitude?: number;
    };
    if (!status || !Object.values(TaskStatus).includes(status)) {
      return NextResponse.json({ success: false, message: 'Invalid status' }, { status: 400 });
    }

    // Cleaners allowed transitions: ASSIGNED->IN_PROGRESS->SUBMITTED
    if (role === UserRole.CLEANER) {
      const allowed = new Set<TaskStatus>([TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED]);
      if (!allowed.has(status)) {
        return NextResponse.json({ success: false, message: 'Insufficient permissions for this transition' }, { status: 403 });
      }
      
      // Require checklist acknowledgment before starting task
      if (status === TaskStatus.IN_PROGRESS && !task.checklistAcknowledgedAt) {
        return NextResponse.json({ 
          success: false, 
          message: 'Checklist must be acknowledged before starting task. Please acknowledge the checklist first.' 
        }, { status: 400 });
      }
    }

    const data: any = { status };
    const reopening =
      status === TaskStatus.IN_PROGRESS &&
      [TaskStatus.SUBMITTED, TaskStatus.APPROVED, TaskStatus.REJECTED, TaskStatus.COMPLETED].includes(
        task.status
      );

    if (status === TaskStatus.IN_PROGRESS && !task.startedAt) data.startedAt = new Date();
    if (reopening) {
      data.completedAt = null;
    }
    if (
      (status === TaskStatus.SUBMITTED || status === TaskStatus.APPROVED || status === TaskStatus.ARCHIVED) &&
      !task.completedAt
    ) {
      data.completedAt = new Date();
    }

    const updated = await prisma.task.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        status: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
        companyId: true,
      },
    });

    if (status === TaskStatus.APPROVED || status === TaskStatus.COMPLETED) {
      finalizePhotoReviewsOnTaskApproval(id, tokenUser.userId).catch((err) =>
        console.warn('Photo review finalize:', err)
      );
      if (status === TaskStatus.APPROVED) {
        notifyTaskApproved({
          taskId: id,
          companyId: task.companyId,
          approvedByUserId: tokenUser.userId,
        }).catch(() => {});
      }
      invalidateAIActivityCache(task.companyId).catch(() => {});
    }

    if (reopening) {
      const assignments = await prisma.taskAssignment.findMany({
        where: { taskId: id },
        select: { userId: true },
      });
      const cleanerIds = assignments.map((a) => a.userId);
      if (task.assignedUserId && !cleanerIds.includes(task.assignedUserId)) {
        cleanerIds.push(task.assignedUserId);
      }
      if (cleanerIds.length > 0) {
        await prisma.taskAssignment.updateMany({
          where: { taskId: id, userId: { in: cleanerIds } },
          data: {
            startedAt: null,
            endedAt: null,
            trackerActive: false,
            onBreak: false,
            breakStartedAt: null,
            totalBreakMinutes: 0,
            durationMinutes: null,
          },
        });
      }
    }

    // GPS verification (non-blocking — flags only; cleaners handled via task-time-log)
    if (latitude != null && longitude != null && role !== UserRole.CLEANER) {
      const { performLocationCheck } = await import('@/lib/location-check');
      const checkType =
        status === TaskStatus.IN_PROGRESS
          ? 'start'
          : status === TaskStatus.SUBMITTED || status === TaskStatus.COMPLETED
            ? 'complete'
            : 'check';

      performLocationCheck({
        taskId: id,
        userId: tokenUser.userId,
        companyId: task.companyId,
        latitude: Number(latitude),
        longitude: Number(longitude),
        checkType,
      }).catch((err) => console.error('GPS check failed:', err));
    }

    // Per-cleaner automated time logs
    if (role === UserRole.CLEANER) {
      const { recordJobStart, recordJobEnd } = await import('@/lib/task-time-log');
      if (status === TaskStatus.IN_PROGRESS) {
        recordJobStart({
          taskId: id,
          userId: tokenUser.userId,
          companyId: task.companyId,
          latitude: latitude != null ? Number(latitude) : undefined,
          longitude: longitude != null ? Number(longitude) : undefined,
        }).catch((err) => console.error('Job start time log failed:', err));
      }
      if (status === TaskStatus.SUBMITTED) {
        recordJobEnd({
          taskId: id,
          userId: tokenUser.userId,
          companyId: task.companyId,
          latitude: latitude != null ? Number(latitude) : undefined,
          longitude: longitude != null ? Number(longitude) : undefined,
        }).catch((err) => console.error('Job end time log failed:', err));
      }
    }

    const { emitTaskEvent } = await import('@/lib/realtime');
    await emitTaskEvent('task:status', task.companyId, id, {
      status: updated.status,
      startedAt: updated.startedAt,
      completedAt: updated.completedAt,
      userId: tokenUser.userId,
    });
    await emitTaskEvent('task:updated', task.companyId, id, {
      status: updated.status,
      userId: tokenUser.userId,
    });

    if (reopening) {
      await emitTaskEvent('task:tracker', task.companyId, id, {
        action: 'reset',
        reopened: true,
      });
    }

    const { notifyTaskActivity } = await import('@/lib/notifications');
    const actor = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { firstName: true, lastName: true, role: true },
    });
    const actorName = `${actor?.firstName || ''} ${actor?.lastName || ''}`.trim() || 'Someone';
    await notifyTaskActivity({
      companyId: task.companyId,
      taskId: id,
      title: 'Task status updated',
      message: `${actorName} changed "${updated.title}" to ${updated.status.replace(/_/g, ' ')}.`,
      type: 'task_updated',
      actorUserId: tokenUser.userId,
      metadata: { status: updated.status },
      notifyManagers: role !== UserRole.CLEANER,
      notifyActor: true,
    }).catch(() => {});

    // Notify assigned cleaners on status changes
    try {
      const assignments = await prisma.taskAssignment.findMany({
        where: { taskId: id },
        select: { userId: true },
      });
      const cleanerIds = [...new Set(assignments.map((a) => a.userId))];
      if (task.assignedUserId) cleanerIds.push(task.assignedUserId);
      const uniqueCleanerIds = [...new Set(cleanerIds)];
      if (uniqueCleanerIds.length > 0) {
        const { sendTaskUpdatedNotification } = await import('@/lib/notifications');
        await sendTaskUpdatedNotification(id, uniqueCleanerIds, 'status');
      }
    } catch (notifyErr) {
      console.warn('Status notification failed:', notifyErr);
    }

    return NextResponse.json({ success: true, data: { task: updated } });
  } catch (error) {
    console.error('Task status PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
