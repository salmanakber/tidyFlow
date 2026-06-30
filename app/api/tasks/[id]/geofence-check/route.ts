import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { validateGeofence, type Coordinates } from '@/lib/geolocation';

// POST /api/tasks/[id]/geofence-check — preview only, does not persist logs
export async function POST(
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

    const task = await prisma.task.findFirst({
      where: { id, companyId },
      include: {
        property: { select: { latitude: true, longitude: true } },
      },
    });
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    const body = await request.json();
    const { latitude, longitude } = body as { latitude?: number; longitude?: number };

    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { success: false, message: 'latitude and longitude are required' },
        { status: 400 }
      );
    }

    if (task.property?.latitude == null || task.property.longitude == null) {
      return NextResponse.json({
        success: true,
        data: { isWithinGeofence: true, distance: 0, geofenceRadius: 150 },
      });
    }

    const config = await prisma.adminConfiguration.findUnique({
      where: { companyId },
      select: { geofenceRadius: true },
    });

    const userLocation: Coordinates = { latitude: Number(latitude), longitude: Number(longitude) };
    const propertyLocation: Coordinates = {
      latitude: Number(task.property.latitude),
      longitude: Number(task.property.longitude),
    };

    const result = validateGeofence(
      userLocation,
      propertyLocation,
      config?.geofenceRadius ?? 150
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[geofence-check]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
