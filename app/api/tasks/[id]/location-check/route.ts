import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { performLocationCheck } from '@/lib/location-check';
import { UserRole } from '@prisma/client';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;
  const taskId = Number(params.id);

  if (Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'Invalid task id' }, { status: 400 });
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, companyId: true, assignedUserId: true },
    });

    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const companyId = requireCompanyScope(tokenUser);
    if (companyId && task.companyId !== companyId) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    const role = tokenUser.role as UserRole;
    if (role === UserRole.CLEANER) {
      const assignment = await prisma.taskAssignment.findFirst({
        where: { taskId, userId: tokenUser.userId },
      });
      if (task.assignedUserId !== tokenUser.userId && !assignment) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { latitude, longitude, checkType = 'check' } = body;

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { success: false, message: 'latitude and longitude required' },
        { status: 400 }
      );
    }

    const result = await performLocationCheck({
      taskId,
      userId: tokenUser.userId,
      companyId: task.companyId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      checkType: checkType as 'start' | 'complete' | 'check',
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Location check error:', error);
    return NextResponse.json({ success: false, message: 'Location check failed' }, { status: 500 });
  }
}
