import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole, TaskStatus } from '@prisma/client';
import {
  buildLocationRecord,
  upsertCleanerLocation,
} from '@/lib/cleaner-tracking';
import { broadcastCleanerLocation } from '@/lib/socket-io';

/** Cleaner posts live GPS — managers/owners receive via socket + /tracking/live */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  if (role !== UserRole.CLEANER) {
    return NextResponse.json({ success: false, message: 'Only cleaners can ping location' }, { status: 403 });
  }

  if (!tokenUser.companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = body.accuracy != null ? Number(body.accuracy) : undefined;
    const taskId = body.taskId != null ? Number(body.taskId) : undefined;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ success: false, message: 'Valid latitude and longitude required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { firstName: true, lastName: true, companyId: true },
    });

    const config = await prisma.adminConfiguration.findUnique({
      where: { companyId: tokenUser.companyId },
      select: { geofenceRadius: true },
    });

    let activeTask = null;
    if (taskId) {
      activeTask = await prisma.task.findFirst({
        where: {
          id: taskId,
          companyId: tokenUser.companyId,
          OR: [
            { assignedUserId: tokenUser.userId },
            { taskAssignments: { some: { userId: tokenUser.userId } } },
          ],
        },
        select: {
          id: true,
          title: true,
          property: { select: { address: true, latitude: true, longitude: true } },
        },
      });
    } else {
      activeTask = await prisma.task.findFirst({
        where: {
          companyId: tokenUser.companyId,
          status: TaskStatus.IN_PROGRESS,
          OR: [
            { assignedUserId: tokenUser.userId },
            { taskAssignments: { some: { userId: tokenUser.userId } } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          property: { select: { address: true, latitude: true, longitude: true } },
        },
      });
    }

    const record = buildLocationRecord({
      userId: tokenUser.userId,
      companyId: tokenUser.companyId,
      latitude,
      longitude,
      accuracy,
      firstName: user?.firstName,
      lastName: user?.lastName,
      task: activeTask,
      geofenceRadius: config?.geofenceRadius ?? 150,
    });

    upsertCleanerLocation(record);
    broadcastCleanerLocation(record);

    if (activeTask?.id) {
      const { recordTimelinePing } = await import('@/lib/task-tracker');
      recordTimelinePing({
        taskId: activeTask.id,
        userId: tokenUser.userId,
        companyId: tokenUser.companyId,
        latitude,
        longitude,
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error('[tracking/ping]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
