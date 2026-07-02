import prisma from '@/lib/prisma';
import { validateGeofence, type Coordinates } from '@/lib/geolocation';
import { ensurePropertyCoordinates } from '@/lib/geocoding';
import { notifyGeofenceExitIfNeeded } from '@/lib/geofence-alerts';

export interface LocationCheckInput {
  taskId: number;
  userId: number;
  companyId: number;
  latitude: number;
  longitude: number;
  checkType: 'start' | 'complete' | 'check';
}

export interface LocationCheckResult {
  isWithinGeofence: boolean;
  distance: number;
  geofenceRadius: number;
  flagged: boolean;
}

export async function performLocationCheck(
  input: LocationCheckInput
): Promise<LocationCheckResult> {
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: {
      id: true,
      title: true,
      property: { select: { id: true, latitude: true, longitude: true, address: true } },
    },
  });

  if (!task) {
    return {
      isWithinGeofence: true,
      distance: 0,
      geofenceRadius: 150,
      flagged: false,
    };
  }

  if (task.property?.id && (!task.property.latitude || !task.property.longitude) && task.property.address) {
    const coords = await ensurePropertyCoordinates(task.property.id);
    if (coords) {
      task.property.latitude = coords.latitude as any;
      task.property.longitude = coords.longitude as any;
    }
  }

  const config = await prisma.adminConfiguration.findUnique({
    where: { companyId: input.companyId },
    select: { geofenceRadius: true },
  });

  const geofenceRadius = config?.geofenceRadius ?? 150;
  const hasPropertyCoords = !!(task.property?.latitude && task.property.longitude);

  let validation = {
    isWithinGeofence: true,
    distance: 0,
    geofenceRadius,
  };

  if (hasPropertyCoords) {
    validation = validateGeofence(
      { latitude: input.latitude, longitude: input.longitude },
      {
        latitude: Number(task.property!.latitude),
        longitude: Number(task.property!.longitude),
      },
      geofenceRadius
    );
  }

  await prisma.locationLog.create({
    data: {
      taskId: input.taskId,
      userId: input.userId,
      latitude: input.latitude,
      longitude: input.longitude,
      distanceFromProperty: hasPropertyCoords ? validation.distance : null,
      ...(hasPropertyCoords ? { withinGeofence: validation.isWithinGeofence } : {}),
      checkType: input.checkType,
    },
  });

  const flagged = hasPropertyCoords && !validation.isWithinGeofence;

  if (flagged && task.property) {
    const cleaner = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { firstName: true, lastName: true },
    });
    const cleanerName = `${cleaner?.firstName || ''} ${cleaner?.lastName || ''}`.trim() || 'Cleaner';

    await notifyGeofenceExitIfNeeded({
      userId: input.userId,
      companyId: input.companyId,
      taskId: input.taskId,
      distance: validation.distance,
      withinGeofence: validation.isWithinGeofence,
      cleanerName,
      propertyAddress: task.property.address,
      taskTitle: task.title,
    });
  }

  return {
    isWithinGeofence: validation.isWithinGeofence,
    distance: validation.distance,
    geofenceRadius: validation.geofenceRadius,
    flagged,
  };
}
