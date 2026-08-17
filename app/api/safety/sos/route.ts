import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync, requireCompanyScope } from '@/lib/rbac';
import { triggerSOSAlert } from '@/lib/safety';
import { UserRole } from '@prisma/client';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;
  const companyId = requireCompanyScope(tokenUser) || tokenUser.companyId;

  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { latitude, longitude, taskId } = body;

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { success: false, message: 'latitude and longitude are required' },
        { status: 400 }
      );
    }

    const alert = await triggerSOSAlert({
      userId: tokenUser.userId,
      companyId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      taskId: taskId ? Number(taskId) : undefined,
    });

    if (taskId) {
      await prisma.locationLog.create({
        data: {
          taskId: Number(taskId),
          userId: tokenUser.userId,
          latitude: Number(latitude),
          longitude: Number(longitude),
          withinGeofence: false,
          checkType: 'sos',
        },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, data: { alert } }, { status: 201 });
  } catch (error) {
    console.error('SOS POST error:', error);
    return NextResponse.json({ success: false, message: 'Failed to trigger SOS' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);

  if (
    role !== UserRole.MANAGER &&
    role !== UserRole.COMPANY_ADMIN &&
    role !== UserRole.OWNER &&
    role !== UserRole.SUPER_ADMIN &&
    role !== UserRole.DEVELOPER
  ) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const status = request.nextUrl.searchParams.get('status') || 'active';

    const alerts = await prisma.sOSAlert.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        status,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        acknowledged: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const taskIds = alerts.map((a) => a.taskId).filter((id): id is number => id != null);
    const tasks =
      taskIds.length > 0
        ? await prisma.task.findMany({
            where: { id: { in: taskIds } },
            select: {
              id: true,
              title: true,
              property: { select: { address: true } },
            },
          })
        : [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const data = alerts.map((alert) => ({
      ...alert,
      latitude: Number(alert.latitude),
      longitude: Number(alert.longitude),
      task: alert.taskId ? taskMap.get(alert.taskId) ?? null : null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('SOS GET error:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch SOS alerts' }, { status: 500 });
  }
}
