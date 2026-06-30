import prisma from '@/lib/prisma';
import { validateGeofence, type Coordinates } from '@/lib/geolocation';
import { createNotification } from '@/lib/notifications';

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
    include: {
      property: { select: { latitude: true, longitude: true, address: true } },
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

  const config = await prisma.adminConfiguration.findUnique({
    where: { companyId: input.companyId },
    select: { geofenceRadius: true },
  });

  const geofenceRadius = config?.geofenceRadius ?? 150;
  const hasPropertyCoords = !!(task?.property?.latitude && task.property.longitude);

  let validation = {
    isWithinGeofence: true,
    distance: 0,
    geofenceRadius,
  };

  if (hasPropertyCoords) {
    const userLocation: Coordinates = {
      latitude: input.latitude,
      longitude: input.longitude,
    };
    const propertyLocation: Coordinates = {
      latitude: Number(task!.property!.latitude),
      longitude: Number(task!.property!.longitude),
    };
    validation = validateGeofence(userLocation, propertyLocation, geofenceRadius);
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

  if (flagged && task?.property) {
    const managers = await prisma.user.findMany({
      where: {
        companyId: input.companyId,
        role: { in: ['MANAGER', 'COMPANY_ADMIN', 'OWNER'] },
        isActive: true,
      },
      select: { id: true },
    });

    const cleaner = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { firstName: true, lastName: true },
    });

    const cleanerName = `${cleaner?.firstName || ''} ${cleaner?.lastName || ''}`.trim() || 'Cleaner';

    for (const manager of managers) {
      await createNotification({
        userId: manager.id,
        title: 'GPS Verification Flag',
        message: `${cleanerName} was ${validation.distance}m from ${task.property.address} during ${input.checkType}. Task was not blocked.`,
        type: 'high_severity_issue',
        metadata: { taskId: input.taskId, distance: validation.distance, checkType: input.checkType },
      });
    }
  }

  return {
    isWithinGeofence: validation.isWithinGeofence,
    distance: validation.distance,
    geofenceRadius: validation.geofenceRadius,
    flagged,
  };
}
