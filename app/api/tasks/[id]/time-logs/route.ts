import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope, isManagerPlusRole } from '@/lib/rbac';
import { editTaskDuration, getTaskTimeLogs } from '@/lib/task-time-log';

// GET /api/tasks/[id]/time-logs — per-cleaner work sessions for managers
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

    if (!isManagerPlusRole(auth.tokenUser.role)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const task = await prisma.task.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const data = await getTaskTimeLogs(id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[time-logs GET]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id]/time-logs — manager edits logged duration
export async function PATCH(
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

    if (!isManagerPlusRole(auth.tokenUser.role)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const task = await prisma.task.findFirst({
      where: { id, companyId },
      select: { id: true },
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

    await editTaskDuration({
      taskId: id,
      userId: Number(userId),
      companyId,
      durationMinutes: Number(durationMinutes),
      editedBy: auth.tokenUser.userId,
    });

    const data = await getTaskTimeLogs(id);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[time-logs PATCH]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Internal server error' },
      { status: 400 }
    );
  }
}
