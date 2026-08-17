import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync, isManagerPlusRole } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/** Company GPS check-in logs — managers see geofence flags */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const flaggedOnly = request.nextUrl.searchParams.get('flagged') === 'true';
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || 50), 100);

  const logs = await prisma.locationLog.findMany({
    where: {
      task: { companyId },
      ...(flaggedOnly ? { withinGeofence: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      task: {
        select: {
          id: true,
          title: true,
          property: { select: { address: true } },
        },
      },
    },
  });

  return NextResponse.json({
    success: true,
    data: logs.map((l) => ({
      id: l.id,
      taskId: l.taskId,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
      distanceFromProperty: l.distanceFromProperty ? Number(l.distanceFromProperty) : null,
      withinGeofence: l.withinGeofence,
      checkType: l.checkType,
      createdAt: l.createdAt,
      user: l.user,
      task: l.task,
    })),
  });
}
