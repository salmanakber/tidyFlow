import prisma from '@/lib/prisma';
import { performLocationCheck } from '@/lib/location-check';
import { recordJobEnd, recordJobStart, getEffectiveDurationMinutes, ensureWorkSessionsFromAssignment } from '@/lib/task-time-log';
import { emitTaskEvent } from '@/lib/realtime';
import { getCleanerLocation } from '@/lib/cleaner-tracking';
import { ensurePropertyCoordinates } from '@/lib/geocoding';
import { notifyGeofenceExitIfNeeded } from '@/lib/geofence-alerts';

const SLOT_MINUTES = 15;

export type TrackerAction = 'start' | 'break' | 'resume' | 'submit';

function workMinutesFromAssignment(a: {
  startedAt: Date | null;
  endedAt: Date | null;
  totalBreakMinutes: number;
  onBreak: boolean;
  breakStartedAt: Date | null;
}): number {
  if (!a.startedAt) return 0;
  const end = a.endedAt ?? new Date();
  let breakMins = a.totalBreakMinutes || 0;
  if (a.onBreak && a.breakStartedAt) {
    breakMins += Math.round((Date.now() - a.breakStartedAt.getTime()) / 60000);
  }
  const gross = Math.round((end.getTime() - a.startedAt.getTime()) / 60000);
  return Math.max(0, gross - breakMins);
}

async function ensureAssignment(taskId: number, userId: number) {
  let assignment = await prisma.taskAssignment.findUnique({
    where: { taskId_userId: { taskId, userId } },
  });
  if (!assignment) {
    assignment = await prisma.taskAssignment.create({ data: { taskId, userId } });
  }
  return assignment;
}

async function notifyManagers(
  companyId: number,
  title: string,
  message: string,
  taskId: number,
  metadata?: Record<string, unknown> & { userId?: number }
) {
  const { notifyTaskActivity } = await import('@/lib/notifications');
  await notifyTaskActivity({
    companyId,
    taskId,
    title,
    message,
    type: 'task_update',
    actorUserId: metadata?.userId,
    metadata,
    notifyActor: true,
  });
}

export async function handleTrackerAction(input: {
  taskId: number;
  userId: number;
  companyId: number;
  action: TrackerAction;
  latitude?: number;
  longitude?: number;
  cleanerName?: string;
  /** When the action actually happened (used for offline replays to preserve timestamps). */
  occurredAt?: Date;
}) {
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, companyId: input.companyId },
    select: { id: true, title: true, status: true, companyId: true },
  });
  if (!task) throw new Error('Task not found');

  const name = input.cleanerName || 'Cleaner';
  const now = input.occurredAt ?? new Date();

  if (input.action === 'start') {
    await recordJobStart({
      taskId: input.taskId,
      userId: input.userId,
      companyId: input.companyId,
      latitude: input.latitude,
      longitude: input.longitude,
      at: now,
    });

    const updated = await prisma.taskAssignment.findUniqueOrThrow({
      where: { taskId_userId: { taskId: input.taskId, userId: input.userId } },
    });

    if (input.latitude != null && input.longitude != null) {
      await recordTimelinePing({
        taskId: input.taskId,
        userId: input.userId,
        companyId: input.companyId,
        latitude: input.latitude,
        longitude: input.longitude,
      }).catch(() => {});
    }

    if (task.status === 'ASSIGNED') {
      await prisma.task.update({
        where: { id: input.taskId },
        data: { status: 'IN_PROGRESS', startedAt: now },
      });

      await emitTaskEvent('task:status', input.companyId, input.taskId, {
        status: 'IN_PROGRESS',
        userId: input.userId,
      });
      await emitTaskEvent('task:updated', input.companyId, input.taskId, {
        status: 'IN_PROGRESS',
        userId: input.userId,
      });
    }

    await notifyManagers(
      input.companyId,
      'Work tracker started',
      `${name} started the work tracker on "${task.title}".`,
      input.taskId,
      { action: 'start', userId: input.userId }
    );

    await emitTaskEvent('task:tracker', input.companyId, input.taskId, {
      action: 'start',
      userId: input.userId,
      trackerActive: true,
      onBreak: false,
      startedAt: updated.startedAt?.toISOString() ?? null,
      workMinutes: workMinutesFromAssignment({ ...updated, endedAt: null }),
    });

    return updated;
  }

  if (input.action === 'break') {
    const assignment = await ensureAssignment(input.taskId, input.userId);
    if (!assignment.startedAt) throw new Error('Start the tracker before taking a break');
    if (assignment.onBreak) throw new Error('Already on break');

    const updated = await prisma.taskAssignment.update({
      where: { id: assignment.id },
      data: {
        trackerActive: false,
        onBreak: true,
        breakStartedAt: now,
      },
    });

    if (input.latitude != null && input.longitude != null) {
      await performLocationCheck({
        taskId: input.taskId,
        userId: input.userId,
        companyId: input.companyId,
        latitude: input.latitude,
        longitude: input.longitude,
        checkType: 'check',
      }).catch(() => {});
    }

    await notifyManagers(
      input.companyId,
      'Cleaner on break',
      `${name} started a break on "${task.title}".`,
      input.taskId,
      { action: 'break', userId: input.userId }
    );

    await emitTaskEvent('task:tracker', input.companyId, input.taskId, {
      action: 'break',
      userId: input.userId,
      trackerActive: false,
      onBreak: true,
      workMinutes: workMinutesFromAssignment({ ...updated, endedAt: null }),
    });
    await emitTaskEvent('task:updated', input.companyId, input.taskId, {
      action: 'tracker_break',
      userId: input.userId,
    });

    return updated;
  }

  if (input.action === 'resume') {
    const assignment = await ensureAssignment(input.taskId, input.userId);
    if (!assignment.onBreak || !assignment.breakStartedAt) {
      throw new Error('Not currently on break');
    }

    const breakMins = Math.round(
      (now.getTime() - assignment.breakStartedAt.getTime()) / 60000
    );

    const updated = await prisma.taskAssignment.update({
      where: { id: assignment.id },
      data: {
        trackerActive: true,
        onBreak: false,
        breakStartedAt: null,
        totalBreakMinutes: (assignment.totalBreakMinutes || 0) + Math.max(1, breakMins),
      },
    });

    await notifyManagers(
      input.companyId,
      'Cleaner resumed work',
      `${name} resumed work on "${task.title}".`,
      input.taskId,
      { action: 'resume', userId: input.userId }
    );

    await emitTaskEvent('task:tracker', input.companyId, input.taskId, {
      action: 'resume',
      userId: input.userId,
      trackerActive: true,
      onBreak: false,
      workMinutes: workMinutesFromAssignment({ ...updated, endedAt: null }),
    });
    await emitTaskEvent('task:updated', input.companyId, input.taskId, {
      action: 'tracker_resume',
      userId: input.userId,
    });

    return updated;
  }

  if (input.action === 'submit') {
    const assignment = await ensureAssignment(input.taskId, input.userId);
    let totalBreak = assignment.totalBreakMinutes || 0;
    if (assignment.onBreak && assignment.breakStartedAt) {
      totalBreak += Math.round((now.getTime() - assignment.breakStartedAt.getTime()) / 60000);
    }

    await prisma.taskAssignment.update({
      where: { id: assignment.id },
      data: {
        trackerActive: false,
        onBreak: false,
        breakStartedAt: null,
        totalBreakMinutes: totalBreak,
      },
    });

    await recordJobEnd({
      taskId: input.taskId,
      userId: input.userId,
      companyId: input.companyId,
      latitude: input.latitude,
      longitude: input.longitude,
      totalBreakMinutes: totalBreak,
      at: now,
    });

    const ended = await prisma.taskAssignment.findUnique({
      where: { taskId_userId: { taskId: input.taskId, userId: input.userId } },
    });

    await prisma.task.update({
      where: { id: input.taskId },
      data: { status: 'SUBMITTED', completedAt: now },
    });

    await notifyManagers(
      input.companyId,
      'Job submitted',
      `${name} submitted "${task.title}" for review.`,
      input.taskId,
      { action: 'submit', userId: input.userId }
    );

    await emitTaskEvent('task:status', input.companyId, input.taskId, {
      status: 'SUBMITTED',
      userId: input.userId,
    });
    await emitTaskEvent('task:updated', input.companyId, input.taskId, {
      status: 'SUBMITTED',
      userId: input.userId,
    });
    await emitTaskEvent('task:tracker', input.companyId, input.taskId, {
      action: 'submit',
      userId: input.userId,
      trackerActive: false,
      onBreak: false,
      endedAt: ended?.endedAt?.toISOString() ?? null,
      durationMinutes: ended?.durationMinutes ?? null,
    });

    return ended;
  }

  throw new Error('Invalid tracker action');
}

function floorToSlot(date: Date, slotMinutes: number): Date {
  const d = new Date(date);
  const mins = d.getHours() * 60 + d.getMinutes();
  const floored = Math.floor(mins / slotMinutes) * slotMinutes;
  d.setHours(Math.floor(floored / 60), floored % 60, 0, 0);
  return d;
}

export async function getTaskTrackingOverview(taskId: number, companyId: number) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, companyId },
    include: {
      property: { select: { address: true, latitude: true, longitude: true } },
      assignedUser: { select: { id: true, firstName: true, lastName: true } },
      taskAssignments: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!task) return null;

  const assignmentByUser = new Map<number, (typeof task.taskAssignments)[0]>();
  for (const a of task.taskAssignments) {
    assignmentByUser.set(a.userId, a);
  }

  if (task.assignedUserId && !assignmentByUser.has(task.assignedUserId) && task.assignedUser) {
    const ensured = await prisma.taskAssignment.upsert({
      where: { taskId_userId: { taskId, userId: task.assignedUserId } },
      create: { taskId, userId: task.assignedUserId },
      update: {},
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    assignmentByUser.set(task.assignedUserId, ensured);
  }

  const relevantAssignments = Array.from(assignmentByUser.values()).filter((a) => {
    if (a.startedAt != null || a.trackerActive) return true;
    if (a.durationMinutes != null || a.editedDurationMinutes != null) return true;
    return ensureWorkSessionsFromAssignment(a).length > 0;
  });

  const timelineLogs = await prisma.locationLog.findMany({
    where: {
      taskId,
      checkType: { in: ['start', 'complete', 'timeline', 'check'] },
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const cleaners = relevantAssignments.map((a) => {
    const live = getCleanerLocation(a.userId);
    const effectiveMins = getEffectiveDurationMinutes(a);
    const workMinutes =
      effectiveMins ??
      (a.endedAt && a.durationMinutes != null
        ? a.durationMinutes
        : workMinutesFromAssignment({
            startedAt: a.startedAt,
            endedAt: a.endedAt,
            totalBreakMinutes: a.totalBreakMinutes,
            onBreak: a.onBreak,
            breakStartedAt: a.breakStartedAt,
          }));

    const userLogs = timelineLogs.filter((l) => l.userId === a.userId);
    const rangeStart = a.startedAt ? floorToSlot(a.startedAt, SLOT_MINUTES) : null;
    const rangeEnd = a.endedAt ?? new Date();
    const slots: Array<{
      slotStart: string;
      slotEnd: string;
      withinGeofence: boolean | null;
      distanceMeters: number | null;
      latitude: number | null;
      longitude: number | null;
      recordedAt: string | null;
      noData: boolean;
    }> = [];

    if (rangeStart && a.startedAt) {
      let cursor = new Date(rangeStart);
      if (cursor < a.startedAt) cursor = floorToSlot(a.startedAt, SLOT_MINUTES);
      while (cursor < rangeEnd) {
        const slotEnd = new Date(cursor.getTime() + SLOT_MINUTES * 60000);
        const inSlot = userLogs.filter((l) => {
          const t = l.createdAt.getTime();
          return t >= cursor.getTime() && t < slotEnd.getTime();
        });
        const best = inSlot.length > 0 ? inSlot[inSlot.length - 1] : null;
        slots.push({
          slotStart: cursor.toISOString(),
          slotEnd: slotEnd.toISOString(),
          withinGeofence: best?.withinGeofence ?? null,
          distanceMeters: best?.distanceFromProperty != null ? Number(best.distanceFromProperty) : null,
          latitude: best ? Number(best.latitude) : null,
          longitude: best ? Number(best.longitude) : null,
          recordedAt: best?.createdAt.toISOString() ?? null,
          noData: !best,
        });
        cursor = slotEnd;
        if (slots.length > 96) break;
      }

      // Fill the active slot from live GPS when timeline rows are not written yet
      if (!a.endedAt && slots.length > 0) {
        const live = getCleanerLocation(a.userId);
        const lastIdx = slots.length - 1;
        const last = slots[lastIdx];
        const nowMs = Date.now();
        if (
          live &&
          last.noData &&
          nowMs >= new Date(last.slotStart).getTime() &&
          nowMs < new Date(last.slotEnd).getTime()
        ) {
          slots[lastIdx] = {
            ...last,
            latitude: live.latitude,
            longitude: live.longitude,
            withinGeofence: live.withinGeofence ?? null,
            distanceMeters: live.distanceFromProperty ?? null,
            recordedAt: live.updatedAt,
            noData: false,
          };
        }
      }
    }

    return {
      userId: a.userId,
      user: a.user,
      startedAt: a.startedAt?.toISOString() ?? null,
      endedAt: a.endedAt?.toISOString() ?? null,
      trackerActive: a.trackerActive,
      onBreak: a.onBreak,
      breakStartedAt: a.breakStartedAt?.toISOString() ?? null,
      totalBreakMinutes: a.totalBreakMinutes,
      workMinutes,
      durationMinutes: a.durationMinutes,
      effectiveDurationMinutes: getEffectiveDurationMinutes(a),
      workSessions: ensureWorkSessionsFromAssignment(a),
      sessionCount: ensureWorkSessionsFromAssignment(a).length,
      startWithinGeofence: a.startWithinGeofence,
      endWithinGeofence: a.endWithinGeofence,
      live: live
        ? {
            latitude: live.latitude,
            longitude: live.longitude,
            withinGeofence: live.withinGeofence ?? null,
            distanceFromProperty: live.distanceFromProperty ?? null,
            updatedAt: live.updatedAt,
          }
        : null,
      timeline: slots,
      checkIns: userLogs
        .filter((l) => l.checkType === 'start' || l.checkType === 'complete')
        .map((l) => ({
          id: l.id,
          checkType: l.checkType,
          withinGeofence: l.withinGeofence,
          distanceMeters: l.distanceFromProperty != null ? Number(l.distanceFromProperty) : null,
          createdAt: l.createdAt.toISOString(),
          latitude: Number(l.latitude),
          longitude: Number(l.longitude),
        })),
    };
  });

  return {
    taskId: task.id,
    taskStatus: task.status,
    property: task.property,
    cleaners,
  };
}

export async function recordTimelinePing(input: {
  taskId: number;
  userId: number;
  companyId: number;
  latitude: number;
  longitude: number;
  /** Preserve original capture time (offline replay). */
  recordedAt?: Date;
  /** Offline replay — accept pings within the assignment window even after submit. */
  historical?: boolean;
}) {
  const at = input.recordedAt ?? new Date();
  const assignment = await prisma.taskAssignment.findUnique({
    where: { taskId_userId: { taskId: input.taskId, userId: input.userId } },
  });

  if (!assignment?.startedAt) return null;

  if (input.historical) {
    if (at < assignment.startedAt) return null;
    if (assignment.endedAt && at > assignment.endedAt) return null;
  } else if (assignment.endedAt || assignment.onBreak) {
    return null;
  }

  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    include: { property: { select: { id: true, latitude: true, longitude: true, address: true } } },
  });
  if (!task) return null;

  if (task.property?.id && (!task.property.latitude || !task.property.longitude) && task.property.address) {
    const coords = await ensurePropertyCoordinates(task.property.id);
    if (coords) {
      task.property.latitude = coords.latitude as any;
      task.property.longitude = coords.longitude as any;
    }
  }

  const hasPropertyCoords = !!(task.property?.latitude && task.property.longitude);
  let distance: number | null = null;
  let withinGeofence: boolean | null = null;

  if (hasPropertyCoords) {
    const { validateGeofence } = await import('@/lib/geolocation');
    const config = await prisma.adminConfiguration.findUnique({
      where: { companyId: input.companyId },
      select: { geofenceRadius: true },
    });
    const radius = config?.geofenceRadius ?? 150;
    const result = validateGeofence(
      { latitude: input.latitude, longitude: input.longitude },
      {
        latitude: Number(task.property!.latitude),
        longitude: Number(task.property!.longitude),
      },
      radius
    );
    distance = result.distance;
    withinGeofence = result.isWithinGeofence;
  }

  return prisma.locationLog.create({
    data: {
      taskId: input.taskId,
      userId: input.userId,
      latitude: input.latitude,
      longitude: input.longitude,
      distanceFromProperty: distance,
      ...(withinGeofence != null ? { withinGeofence } : {}),
      checkType: 'timeline',
      createdAt: at,
    },
  }).then(async (log) => {
    const isRecent = Date.now() - at.getTime() <= 15 * 60 * 1000;
    if (withinGeofence === false && distance != null && isRecent) {
      const fullTask = await prisma.task.findUnique({
        where: { id: input.taskId },
        select: { title: true, property: { select: { address: true } } },
      });
      const cleaner = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { firstName: true, lastName: true },
      });
      await notifyGeofenceExitIfNeeded({
        userId: input.userId,
        companyId: input.companyId,
        taskId: input.taskId,
        distance,
        withinGeofence,
        cleanerName: `${cleaner?.firstName || ''} ${cleaner?.lastName || ''}`.trim(),
        propertyAddress: fullTask?.property?.address,
        taskTitle: fullTask?.title,
      });
    }
    return log;
  });
}
