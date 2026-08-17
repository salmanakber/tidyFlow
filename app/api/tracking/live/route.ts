import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { getCompanyCleanerLocations } from '@/lib/cleaner-tracking';

/** Live cleaner positions for owner/manager map */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const role = auth.tokenUser.role as UserRole;
  const allowed: UserRole[] = [
    UserRole.MANAGER,
    UserRole.COMPANY_ADMIN,
    UserRole.OWNER,
    UserRole.SUPER_ADMIN,
    UserRole.DEVELOPER,
  ];
  if (!allowed.includes(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const cleaners = getCompanyCleanerLocations(companyId);

  const assignedCleaners = await prisma.user.findMany({
    where: { companyId, role: UserRole.CLEANER, isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });

  const liveByUser = new Map(cleaners.map((c) => [c.userId, c]));

  const data = assignedCleaners.map((cleaner) => {
    const live = liveByUser.get(cleaner.id);
    return {
      userId: cleaner.id,
      name: `${cleaner.firstName || ''} ${cleaner.lastName || ''}`.trim() || cleaner.email,
      isLive: !!live,
      latitude: live?.latitude ?? null,
      longitude: live?.longitude ?? null,
      accuracy: live?.accuracy ?? null,
      updatedAt: live?.updatedAt ?? null,
      taskId: live?.taskId ?? null,
      taskTitle: live?.taskTitle ?? null,
      propertyAddress: live?.propertyAddress ?? null,
      propertyLatitude: live?.propertyLatitude ?? null,
      propertyLongitude: live?.propertyLongitude ?? null,
      distanceFromProperty: live?.distanceFromProperty ?? null,
      withinGeofence: live?.withinGeofence ?? null,
      geofenceRadius: live?.geofenceRadius ?? 150,
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      cleaners: data,
      liveCount: cleaners.length,
      updatedAt: new Date().toISOString(),
    },
  });
}
