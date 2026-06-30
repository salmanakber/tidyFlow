import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { editTaskDuration, getTaskTimeLogs } from '@/lib/task-time-log';

// GET /api/tasks/[id]/time-logs
export async function GET(
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

  try {
    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const task = await prisma.task.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    if (role === UserRole.CLEANER) {
      const logs = await getTaskTimeLogs(id);
      return NextResponse.json({
        success: true,
        data: logs.filter((l) => l.userId === tokenUser.userId),
      });
    }

    if (
      role !== UserRole.OWNER &&
      role !== UserRole.DEVELOPER &&
      role !== UserRole.COMPANY_ADMIN &&
      role !== UserRole.MANAGER
    ) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const logs = await getTaskTimeLogs(id);
    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error('[time-logs GET]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id]/time-logs — manager/owner edits duration
export async function PATCH(
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

  if (
    role !== UserRole.OWNER &&
    role !== UserRole.DEVELOPER &&
    role !== UserRole.COMPANY_ADMIN &&
    role !== UserRole.MANAGER
  ) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) {
      return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const task = await prisma.task.findFirst({
      where: { id, companyId },
      select: { id: true, companyId: true },
    });
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const body = await request.json();
    const { userId, durationMinutes } = body as { userId?: number; durationMinutes?: number };

    if (!userId || durationMinutes == null) {
      return NextResponse.json(
        { success: false, message: 'userId and durationMinutes are required' },
        { status: 400 }
      );
    }

    const updated = await editTaskDuration({
      taskId: id,
      userId: Number(userId),
      companyId: task.companyId,
      durationMinutes: Number(durationMinutes),
      editedBy: tokenUser.userId,
    });

    return NextResponse.json({
      success: true,
      message: 'Duration updated',
      data: {
        id: updated.id,
        durationMinutes: updated.durationMinutes,
        editedDurationMinutes: updated.editedDurationMinutes,
        editedAt: updated.editedAt?.toISOString() ?? null,
      },
    });
  } catch (error: any) {
    console.error('[time-logs PATCH]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 400 }
    );
  }
}
