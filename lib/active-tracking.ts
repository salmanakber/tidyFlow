import prisma from '@/lib/prisma';
import { TaskStatus } from '@prisma/client';
import { getCleanerLocation, getCompanyCleanerLocations } from '@/lib/cleaner-tracking';
import { getEffectiveDurationMinutes } from '@/lib/task-time-log';

function workMinutesFromAssignment( a: {
  startedAt: Date | null;
  endedAt: Date | null;
  totalBreakMinutes: number;
  onBreak: boolean;
  breakStartedAt: Date | null;
  durationMinutes: number | null;
  editedDurationMinutes: number | null;
}): number {
  const effective = getEffectiveDurationMinutes(a);
  if (effective != null) return effective;
  if (!a.startedAt) return 0;
  const end = a.endedAt ?? new Date();
  let breakMins = a.totalBreakMinutes || 0;
  if (a.onBreak && a.breakStartedAt) {
    breakMins += Math.round((Date.now() - a.breakStartedAt.getTime()) / 60000);
  }
  const gross = Math.round((end.getTime() - a.startedAt.getTime()) / 60000);
  return Math.max(0, gross - breakMins);
}

export type ActiveJobGpsRecord = {
  id: number;
  checkType: string;
  withinGeofence: boolean | null;
  distanceMeters: number | null;
  latitude: number;
  longitude: number;
  recordedAt: string;
};

export type ActiveJobCleaner = {
  userId: number;
  name: string;
  trackerActive: boolean;
  onBreak: boolean;
  startedAt: string | null;
  workMinutes: number;
  withinGeofence: boolean | null;
  distanceFromProperty: number | null;
  latitude: number | null;
  longitude: number | null;
  updatedAt: string | null;
  recentGps: ActiveJobGpsRecord[];
};

export type ActiveTrackingJob = {
  taskId: number;
  title: string;
  status: string;
  propertyAddress: string | null;
  propertyLatitude: number | null;
  propertyLongitude: number | null;
  geofenceRadius: number;
  cleaners: ActiveJobCleaner[];
  gpsPingCount: number;
  lastGpsAt: string | null;
  hasOffSiteCleaner: boolean;
};

export async function getCompanyActiveTrackingJobs(companyId: number): Promise<{
  jobs: ActiveTrackingJob[];
  liveCount: number;
  geofenceRadius: number;
}> {
  const config = await prisma.adminConfiguration.findUnique({
    where: { companyId },
    select: { geofenceRadius: true },
  });
  const geofenceRadius = config?.geofenceRadius ?? 150;

  const tasks = await prisma.task.findMany({
    where: {
      companyId,
      OR: [
        { status: TaskStatus.IN_PROGRESS },
        {
          taskAssignments: {
            some: {
              trackerActive: true,
              endedAt: null,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      property: {
        select: { address: true, latitude: true, longitude: true },
      },
      taskAssignments: {
        where: {
          OR: [
            { trackerActive: true, endedAt: null },
            { startedAt: { not: null }, endedAt: null },
          ],
        },
        select: {
          userId: true,
          startedAt: true,
          endedAt: true,
          trackerActive: true,
          onBreak: true,
          breakStartedAt: true,
          totalBreakMinutes: true,
          durationMinutes: true,
          editedDurationMinutes: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });

  const taskIds = tasks.map((t) => t.id);
  const recentLogs =
    taskIds.length > 0
      ? await prisma.locationLog.findMany({
          where: {
            taskId: { in: taskIds },
            checkType: { in: ['start', 'complete', 'timeline', 'check'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        })
      : [];

  const logsByTaskUser = new Map<string, typeof recentLogs>();
  for (const log of recentLogs) {
    const key = `${log.taskId}:${log.userId}`;
    const list = logsByTaskUser.get(key) || [];
    if (list.length < 8) list.push(log);
    logsByTaskUser.set(key, list);
  }

  const jobs: ActiveTrackingJob[] = [];

  for (const task of tasks) {
    const assignments =
      task.taskAssignments.length > 0
        ? task.taskAssignments
        : [];

    if (assignments.length === 0 && task.status !== TaskStatus.IN_PROGRESS) continue;

    const cleaners: ActiveJobCleaner[] = assignments.map((a) => {
      const live = getCleanerLocation(a.userId);
      const name =
        `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim() ||
        a.user?.email ||
        `Cleaner #${a.userId}`;

      const userLogs = logsByTaskUser.get(`${task.id}:${a.userId}`) || [];
      const recentGps: ActiveJobGpsRecord[] = userLogs.map((l) => ({
        id: l.id,
        checkType: l.checkType,
        withinGeofence: l.withinGeofence,
        distanceMeters: l.distanceFromProperty != null ? Number(l.distanceFromProperty) : null,
        latitude: Number(l.latitude),
        longitude: Number(l.longitude),
        recordedAt: l.createdAt.toISOString(),
      }));

      return {
        userId: a.userId,
        name,
        trackerActive: a.trackerActive,
        onBreak: a.onBreak,
        startedAt: a.startedAt?.toISOString() ?? null,
        workMinutes: workMinutesFromAssignment(a),
        withinGeofence: live?.withinGeofence ?? null,
        distanceFromProperty: live?.distanceFromProperty ?? null,
        latitude: live?.latitude ?? null,
        longitude: live?.longitude ?? null,
        updatedAt: live?.updatedAt ?? null,
        recentGps,
      };
    });

    const taskLogs = recentLogs.filter((l) => l.taskId === task.id);
    const lastGps = taskLogs[0]?.createdAt.toISOString() ?? null;

    jobs.push({
      taskId: task.id,
      title: task.title,
      status: task.status,
      propertyAddress: task.property?.address ?? null,
      propertyLatitude:
        task.property?.latitude != null ? Number(task.property.latitude) : null,
      propertyLongitude:
        task.property?.longitude != null ? Number(task.property.longitude) : null,
      geofenceRadius,
      cleaners,
      gpsPingCount: taskLogs.length,
      lastGpsAt: lastGps,
      hasOffSiteCleaner: cleaners.some((c) => c.withinGeofence === false),
    });
  }

  return {
    jobs,
    liveCount: getCompanyCleanerLocations(companyId).length,
    geofenceRadius,
  };
}
