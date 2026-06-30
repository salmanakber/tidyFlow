import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { buildLocationRecord, upsertCleanerLocation } from '@/lib/cleaner-tracking';
import { broadcastCleanerLocation } from '@/lib/socket-io';

interface PingInput {
  latitude: number;
  longitude: number;
  accuracy?: number;
  taskId?: number;
  recordedAt?: string;
}

/**
 * Replays a batch of GPS pings captured while the cleaner was offline.
 * Each point is persisted to the location timeline with its original timestamp,
 * so no GPS history is lost. The most recent point also refreshes live tracking.
 */
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
    const pings = (body?.pings || []) as PingInput[];
    if (!Array.isArray(pings) || pings.length === 0) {
      return NextResponse.json({ success: false, message: 'pings array required' }, { status: 400 });
    }

    const valid = pings
      .map((p) => ({
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        accuracy: p.accuracy != null ? Number(p.accuracy) : undefined,
        taskId: p.taskId != null ? Number(p.taskId) : undefined,
        recordedAt: p.recordedAt ? new Date(p.recordedAt) : new Date(),
      }))
      .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    if (valid.length === 0) {
      return NextResponse.json({ success: false, message: 'No valid pings' }, { status: 400 });
    }

    const config = await prisma.adminConfiguration.findUnique({
      where: { companyId: tokenUser.companyId },
      select: { geofenceRadius: true },
    });
    const radius = config?.geofenceRadius ?? 150;

    // Cache property coords per task to avoid repeated lookups.
    const propertyCache = new Map<number, { latitude: number; longitude: number } | null>();
    const getPropertyCoords = async (taskId: number) => {
      if (propertyCache.has(taskId)) return propertyCache.get(taskId)!;
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { property: { select: { latitude: true, longitude: true } } },
      });
      const coords =
        task?.property?.latitude != null && task?.property?.longitude != null
          ? { latitude: Number(task.property.latitude), longitude: Number(task.property.longitude) }
          : null;
      propertyCache.set(taskId, coords);
      return coords;
    };

    const { validateGeofence } = await import('@/lib/geolocation');

    let saved = 0;
    for (const p of valid) {
      // The location timeline is keyed by task. Pings captured without an active task
      // (background heartbeats) were never persisted online either — only live location
      // was updated — so we skip timeline persistence for them.
      if (!p.taskId) continue;

      let distance: number | null = null;
      let withinGeofence: boolean | null = null;

      const coords = await getPropertyCoords(p.taskId);
      if (coords) {
        const result = validateGeofence(
          { latitude: p.latitude, longitude: p.longitude },
          coords,
          radius
        );
        distance = result.distance;
        withinGeofence = result.isWithinGeofence;
      }

      await prisma.locationLog.create({
        data: {
          taskId: p.taskId,
          userId: tokenUser.userId,
          latitude: p.latitude,
          longitude: p.longitude,
          distanceFromProperty: distance,
          ...(withinGeofence != null ? { withinGeofence } : {}),
          checkType: 'timeline',
          createdAt: p.recordedAt,
        },
      });
      saved++;
    }

    // Refresh live tracking with the most recent point.
    const last = valid[valid.length - 1];
    const user = await prisma.user.findUnique({
      where: { id: tokenUser.userId },
      select: { firstName: true, lastName: true },
    });
    let activeTask = null;
    if (last.taskId) {
      activeTask = await prisma.task.findFirst({
        where: { id: last.taskId, companyId: tokenUser.companyId },
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
      latitude: last.latitude,
      longitude: last.longitude,
      accuracy: last.accuracy,
      firstName: user?.firstName,
      lastName: user?.lastName,
      task: activeTask,
      geofenceRadius: radius,
    });
    upsertCleanerLocation(record);
    broadcastCleanerLocation(record);

    return NextResponse.json({ success: true, data: { saved } });
  } catch (error) {
    console.error('[tracking/ping/batch]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
