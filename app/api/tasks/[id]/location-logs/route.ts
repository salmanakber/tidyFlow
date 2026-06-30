import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

// GET /api/tasks/[id]/location-logs
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
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const logs = await prisma.locationLog.findMany({
      where: { taskId: id },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: logs.map((log) => ({
        id: log.id,
        checkType: log.checkType,
        withinGeofence: log.withinGeofence,
        distanceFromProperty:
          log.distanceFromProperty != null ? Number(log.distanceFromProperty) : null,
        latitude: Number(log.latitude),
        longitude: Number(log.longitude),
        createdAt: log.createdAt.toISOString(),
        user: log.user,
      })),
    });
  } catch (error) {
    console.error('[location-logs GET]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
