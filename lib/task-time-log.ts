import prisma from '@/lib/prisma';
import { performLocationCheck } from '@/lib/location-check';
import { assertHoursEditable, assertSubmissionEditable, PayrollLedgerLockedError } from '@/lib/payroll-ledger';

export type WorkSessionRecord = {
  sessionNumber: number;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  totalBreakMinutes: number;
};

type AssignmentTimeFields = {
  startedAt: Date | null;
  endedAt: Date | null;
  durationMinutes: number | null;
  editedDurationMinutes: number | null;
  totalBreakMinutes?: number;
  onBreak?: boolean;
  breakStartedAt?: Date | null;
  workSessions?: unknown;
};

export function parseWorkSessions(raw: unknown): WorkSessionRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const startedAt = typeof o.startedAt === 'string' ? o.startedAt : null;
      const endedAt = typeof o.endedAt === 'string' ? o.endedAt : null;
      const durationMinutes = Number(o.durationMinutes);
      if (!startedAt || !endedAt || !Number.isFinite(durationMinutes) || durationMinutes < 1) {
        return null;
      }
      return {
        sessionNumber: Number(o.sessionNumber) || idx + 1,
        startedAt,
        endedAt,
        durationMinutes: Math.round(durationMinutes),
        totalBreakMinutes: Math.max(0, Number(o.totalBreakMinutes) || 0),
      };
    })
    .filter((s): s is WorkSessionRecord => s != null)
    .sort((a, b) => a.sessionNumber - b.sessionNumber);
}

export function sumWorkSessionMinutes(sessions: WorkSessionRecord[]): number {
  return sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
}

export function computeSessionMinutes(
  startedAt: Date,
  endedAt: Date,
  totalBreakMinutes: number
): number {
  const gross = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
  return Math.max(1, gross - (totalBreakMinutes || 0));
}

function liveSessionMinutes(assignment: AssignmentTimeFields): number {
  if (!assignment.startedAt || assignment.endedAt) return 0;
  const breakMins = assignment.totalBreakMinutes ?? 0;
  let extraBreak = 0;
  if (assignment.onBreak && assignment.breakStartedAt) {
    extraBreak = Math.round((Date.now() - assignment.breakStartedAt.getTime()) / 60000);
  }
  return computeSessionMinutes(
    assignment.startedAt,
    new Date(),
    breakMins + extraBreak
  );
}

export function ensureWorkSessionsFromAssignment(
  assignment: AssignmentTimeFields
): WorkSessionRecord[] {
  const existing = parseWorkSessions(assignment.workSessions);
  if (existing.length > 0) return existing;
  if (!assignment.startedAt || !assignment.endedAt) return [];
  const mins =
    assignment.durationMinutes ??
    computeSessionMinutes(
      assignment.startedAt,
      assignment.endedAt,
      assignment.totalBreakMinutes ?? 0
    );
  if (mins < 1) return [];
  return [
    {
      sessionNumber: 1,
      startedAt: assignment.startedAt.toISOString(),
      endedAt: assignment.endedAt.toISOString(),
      durationMinutes: mins,
      totalBreakMinutes: assignment.totalBreakMinutes ?? 0,
    },
  ];
}

export function getCompletedSessionMinutes(assignment: AssignmentTimeFields): number {
  const sessions = ensureWorkSessionsFromAssignment(assignment);
  return sumWorkSessionMinutes(sessions);
}

export function getEffectiveDurationMinutes(assignment: AssignmentTimeFields): number | null {
  if (assignment.editedDurationMinutes != null) return assignment.editedDurationMinutes;

  const sessions = ensureWorkSessionsFromAssignment(assignment);
  const completedTotal = sumWorkSessionMinutes(sessions);

  if (!assignment.endedAt && assignment.startedAt) {
    const live = liveSessionMinutes(assignment);
    const prior = getCompletedSessionMinutes(assignment);
    const total = prior + live;
    return total > 0 ? total : null;
  }

  if (completedTotal > 0) return completedTotal;
  if (assignment.durationMinutes != null) return assignment.durationMinutes;
  return null;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

async function ensureAssignment(taskId: number, userId: number) {
  let assignment = await prisma.taskAssignment.findUnique({
    where: { taskId_userId: { taskId, userId } },
  });

  if (!assignment) {
    assignment = await prisma.taskAssignment.create({
      data: { taskId, userId },
    });
  }

  return assignment;
}

export async function recordJobStart(input: {
  taskId: number;
  userId: number;
  companyId: number;
  latitude?: number;
  longitude?: number;
  at?: Date;
}) {
  const now = input.at ?? new Date();
  const assignment = await ensureAssignment(input.taskId, input.userId);
  const restarting = !!assignment.endedAt;
  const sessions = ensureWorkSessionsFromAssignment(assignment);
  const priorCompletedMinutes = sumWorkSessionMinutes(sessions);

  let geo: {
    isWithinGeofence: boolean;
    distance: number;
  } | null = null;

  if (input.latitude != null && input.longitude != null) {
    geo = await performLocationCheck({
      taskId: input.taskId,
      userId: input.userId,
      companyId: input.companyId,
      latitude: input.latitude,
      longitude: input.longitude,
      checkType: 'start',
    });
  }

  const updated = await prisma.taskAssignment.update({
    where: { id: assignment.id },
    data: {
      workSessions: sessions,
      startedAt: restarting ? now : (assignment.startedAt ?? now),
      endedAt: null,
      durationMinutes: restarting ? priorCompletedMinutes : assignment.durationMinutes,
      trackerActive: true,
      onBreak: false,
      breakStartedAt: null,
      totalBreakMinutes: restarting ? 0 : assignment.totalBreakMinutes,
      startLatitude: input.latitude ?? assignment.startLatitude,
      startLongitude: input.longitude ?? assignment.startLongitude,
      startWithinGeofence: geo?.isWithinGeofence ?? assignment.startWithinGeofence,
      startDistanceMeters: geo?.distance ?? assignment.startDistanceMeters,
      ...(restarting
        ? {
            endLatitude: null,
            endLongitude: null,
            endWithinGeofence: null,
            endDistanceMeters: null,
          }
        : {}),
    },
  });

  return updated;
}

export async function recordJobEnd(input: {
  taskId: number;
  userId: number;
  companyId: number;
  latitude?: number;
  longitude?: number;
  totalBreakMinutes?: number;
  at?: Date;
}) {
  const now = input.at ?? new Date();
  const assignment = await ensureAssignment(input.taskId, input.userId);
  const startedAt = assignment.startedAt ?? now;
  const breakMins = input.totalBreakMinutes ?? assignment.totalBreakMinutes ?? 0;

  let geo: {
    isWithinGeofence: boolean;
    distance: number;
  } | null = null;

  if (input.latitude != null && input.longitude != null) {
    geo = await performLocationCheck({
      taskId: input.taskId,
      userId: input.userId,
      companyId: input.companyId,
      latitude: input.latitude,
      longitude: input.longitude,
      checkType: 'complete',
    });
  }

  const grossMinutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));
  const sessionMinutes = Math.max(1, grossMinutes - breakMins);

  const existingSessions = ensureWorkSessionsFromAssignment(assignment);
  const sessionRecord: WorkSessionRecord = {
    sessionNumber: existingSessions.length + 1,
    startedAt: startedAt.toISOString(),
    endedAt: now.toISOString(),
    durationMinutes: sessionMinutes,
    totalBreakMinutes: breakMins,
  };
  const workSessions = [...existingSessions, sessionRecord];
  const totalDurationMinutes = sumWorkSessionMinutes(workSessions);

  const updated = await prisma.taskAssignment.update({
    where: { id: assignment.id },
    data: {
      workSessions,
      startedAt,
      endedAt: now,
      trackerActive: false,
      onBreak: false,
      breakStartedAt: null,
      endLatitude: input.latitude ?? assignment.endLatitude,
      endLongitude: input.longitude ?? assignment.endLongitude,
      endWithinGeofence: geo?.isWithinGeofence ?? assignment.endWithinGeofence,
      endDistanceMeters: geo?.distance ?? assignment.endDistanceMeters,
      durationMinutes: totalDurationMinutes,
      totalBreakMinutes: breakMins,
    },
  });

  await syncTaskHoursToWorkingHours({
    userId: input.userId,
    companyId: input.companyId,
    taskId: input.taskId,
    hours: totalDurationMinutes / 60,
    workDate: startedAt,
  });

  await prisma.taskAssignment.update({
    where: { id: updated.id },
    data: { payrollLoggedAt: new Date() },
  });

  return updated;
}

export async function syncTaskHoursToWorkingHours(params: {
  userId: number;
  companyId: number;
  taskId: number;
  hours: number;
  workDate: Date;
}) {
  const date = new Date(params.workDate);
  date.setHours(0, 0, 0, 0);

  await assertHoursEditable(params.userId, date);

  const existing = await prisma.workingHoursSubmission.findUnique({
    where: { userId_date: { userId: params.userId, date } },
    include: { tasks: true },
  });

  if (existing) {
    if (existing.lockedAt || existing.status === 'locked' || existing.status === 'paid') {
      throw new PayrollLedgerLockedError();
    }
    const taskLink = existing.tasks.find((t) => t.taskId === params.taskId);
    if (taskLink) {
      await prisma.workingHoursSubmissionTask.update({
        where: { id: taskLink.id },
        data: { hours: params.hours },
      });
    } else {
      await prisma.workingHoursSubmissionTask.create({
        data: {
          workingHoursSubmissionId: existing.id,
          taskId: params.taskId,
          hours: params.hours,
        },
      });
    }

    const allTasks = await prisma.workingHoursSubmissionTask.findMany({
      where: { workingHoursSubmissionId: existing.id },
    });
    const totalHours = allTasks.reduce((sum, t) => sum + Number(t.hours || 0), 0);

    const wasApproved = existing.status === 'approved';

    await prisma.workingHoursSubmission.update({
      where: { id: existing.id },
      data: {
        hours: totalHours,
        status: 'pending',
        approvedBy: null,
        approvedAt: null,
        description:
          existing.description ||
          (wasApproved
            ? 'Hours updated — awaiting manager re-approval'
            : 'Auto-logged from GPS task completion'),
      },
    });
    return;
  }

  await prisma.workingHoursSubmission.create({
    data: {
      userId: params.userId,
      companyId: params.companyId,
      date,
      hours: params.hours,
      description: 'Auto-logged from GPS task completion',
      status: 'pending',
      tasks: {
        create: [{ taskId: params.taskId, hours: params.hours }],
      },
    },
  });
}

export async function editTaskDuration(input: {
  taskId: number;
  userId: number;
  companyId: number;
  durationMinutes: number;
  editedBy: number;
}) {
  if (input.durationMinutes < 1 || input.durationMinutes > 24 * 60) {
    throw new Error('Duration must be between 1 minute and 24 hours');
  }

  const assignment = await prisma.taskAssignment.findUnique({
    where: { taskId_userId: { taskId: input.taskId, userId: input.userId } },
  });

  if (!assignment?.startedAt) {
    throw new Error('No time log found for this cleaner on this task');
  }

  const updated = await prisma.taskAssignment.update({
    where: { id: assignment.id },
    data: {
      editedDurationMinutes: input.durationMinutes,
      editedBy: input.editedBy,
      editedAt: new Date(),
    },
  });

  await syncTaskHoursToWorkingHours({
    userId: input.userId,
    companyId: input.companyId,
    taskId: input.taskId,
    hours: input.durationMinutes / 60,
    workDate: assignment.startedAt,
  });

  return updated;
}

export async function getTaskTimeLogs(taskId: number) {
  const assignments = await prisma.taskAssignment.findMany({
    where: {
      taskId,
      startedAt: { not: null },
    },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { startedAt: 'asc' },
  });

  const results = [];
  for (const a of assignments) {
    let submission: { id: number; status: string } | null = null;
    if (a.startedAt) {
      const date = new Date(a.startedAt);
      date.setHours(0, 0, 0, 0);
      submission = await prisma.workingHoursSubmission.findUnique({
        where: { userId_date: { userId: a.userId, date } },
        select: { id: true, status: true },
      });
    }

    results.push({
      id: a.id,
      userId: a.userId,
      user: a.user,
      startedAt: a.startedAt?.toISOString() ?? null,
      endedAt: a.endedAt?.toISOString() ?? null,
      startWithinGeofence: a.startWithinGeofence,
      endWithinGeofence: a.endWithinGeofence,
      startDistanceMeters: a.startDistanceMeters != null ? Number(a.startDistanceMeters) : null,
      endDistanceMeters: a.endDistanceMeters != null ? Number(a.endDistanceMeters) : null,
      durationMinutes: a.durationMinutes,
      editedDurationMinutes: a.editedDurationMinutes,
      effectiveDurationMinutes: getEffectiveDurationMinutes(a),
      workSessions: ensureWorkSessionsFromAssignment(a),
      sessionCount: ensureWorkSessionsFromAssignment(a).length,
      editedBy: a.editedBy,
      editedAt: a.editedAt?.toISOString() ?? null,
      payrollLoggedAt: a.payrollLoggedAt?.toISOString() ?? null,
      hoursStatus: a.endedAt ? (submission?.status ?? 'pending') : 'in_progress',
      submissionId: submission?.id ?? null,
    });
  }

  return results;
}

export async function sumTaskHoursForPeriod(
  userId: number,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const assignments = await prisma.taskAssignment.findMany({
    where: {
      userId,
      endedAt: { gte: periodStart, lte: periodEnd },
      OR: [{ durationMinutes: { not: null } }, { editedDurationMinutes: { not: null } }],
    },
    select: {
      durationMinutes: true,
      editedDurationMinutes: true,
      startedAt: true,
      endedAt: true,
      workSessions: true,
      totalBreakMinutes: true,
      onBreak: true,
      breakStartedAt: true,
    },
  });

  const totalMinutes = assignments.reduce(
    (sum, a) => sum + (getEffectiveDurationMinutes(a) ?? 0),
    0
  );

  return totalMinutes / 60;
}

export async function approveWorkingHoursSubmission(input: {
  submissionId: number;
  companyId: number;
  approvedBy: number;
  action: 'approve' | 'reject';
}) {
  const submission = await prisma.workingHoursSubmission.findFirst({
    where: { id: input.submissionId, companyId: input.companyId },
  });

  if (!submission) {
    throw new Error('Working hours submission not found');
  }

  await assertSubmissionEditable(input.submissionId);

  if (submission.status !== 'pending') {
    throw new Error('Only pending submissions can be approved or rejected');
  }

  return prisma.workingHoursSubmission.update({
    where: { id: input.submissionId },
    data: {
      status: input.action === 'approve' ? 'approved' : 'rejected',
      approvedBy: input.approvedBy,
      approvedAt: new Date(),
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      tasks: {
        include: {
          task: {
            select: {
              id: true,
              title: true,
              property: { select: { address: true } },
            },
          },
        },
      },
    },
  });
}

export async function getCleanerHoursSummary(
  userId: number,
  companyId: number,
  options?: { from?: Date; to?: Date }
) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const rangeStart = options?.from ?? weekStart;
  const rangeEnd = options?.to ?? weekEnd;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultHourlyRate: true },
  });
  const hourlyRate = user?.defaultHourlyRate ? Number(user.defaultHourlyRate) : null;

  const assignments = await prisma.taskAssignment.findMany({
    where: {
      userId,
      task: { companyId },
      startedAt: { not: null },
      OR: [
        { endedAt: { gte: rangeStart, lte: rangeEnd } },
        { startedAt: { gte: rangeStart, lte: rangeEnd }, endedAt: null },
      ],
    },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          property: { select: { address: true } },
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  });

  const submissions = await prisma.workingHoursSubmission.findMany({
    where: {
      userId,
      companyId,
      date: { gte: rangeStart, lte: rangeEnd },
      status: { in: ['pending', 'approved'] },
    },
    select: { id: true, date: true, hours: true, status: true },
  });

  const submissionByDate = new Map(
    submissions.map((s) => [s.date.toISOString().split('T')[0], s])
  );

  const mapAssignment = (a: (typeof assignments)[0]) => {
    const sessions = ensureWorkSessionsFromAssignment(a);
    const mins = getEffectiveDurationMinutes(a) ?? 0;
    const dateKey = (a.startedAt ?? new Date()).toISOString().split('T')[0];
    const submission = submissionByDate.get(dateKey);
    return {
      taskId: a.task.id,
      taskTitle: a.task.title,
      propertyAddress: a.task.property?.address ?? null,
      taskStatus: a.task.status,
      startedAt: a.startedAt?.toISOString() ?? null,
      endedAt: a.endedAt?.toISOString() ?? null,
      durationMinutes: mins,
      workSessions: sessions,
      sessionCount: sessions.length,
      hoursStatus: submission?.status ?? (a.endedAt ? 'pending' : 'in_progress'),
      submissionId: submission?.id ?? null,
    };
  };

  const allMapped = assignments.map(mapAssignment);
  const todayMapped = allMapped.filter((a) => {
    if (!a.startedAt) return false;
    const d = new Date(a.startedAt);
    return d >= todayStart && d <= todayEnd;
  });

  const sumMinutes = (items: typeof allMapped, statusFilter?: string) =>
    items.reduce((sum, item) => {
      if (statusFilter && item.hoursStatus !== statusFilter) return sum;
      return sum + item.durationMinutes;
    }, 0);

  const weekApprovedMinutes = sumMinutes(allMapped, 'approved');
  const weekPendingMinutes = sumMinutes(allMapped, 'pending');
  const weekInProgressMinutes = sumMinutes(allMapped, 'in_progress');
  const weekTotalMinutes = weekApprovedMinutes + weekPendingMinutes + weekInProgressMinutes;

  const todayApprovedMinutes = sumMinutes(todayMapped, 'approved');
  const todayPendingMinutes = sumMinutes(todayMapped, 'pending');
  const todayInProgressMinutes = sumMinutes(todayMapped, 'in_progress');
  const todayTotalMinutes = todayApprovedMinutes + todayPendingMinutes + todayInProgressMinutes;

  return {
    hourlyRate,
    today: {
      totalMinutes: todayTotalMinutes,
      approvedMinutes: todayApprovedMinutes,
      pendingMinutes: todayPendingMinutes,
      inProgressMinutes: todayInProgressMinutes,
      estimatedPay: hourlyRate ? (todayApprovedMinutes / 60) * hourlyRate : null,
      tasks: todayMapped,
    },
    week: {
      totalMinutes: weekTotalMinutes,
      approvedMinutes: weekApprovedMinutes,
      pendingMinutes: weekPendingMinutes,
      inProgressMinutes: weekInProgressMinutes,
      estimatedPay: hourlyRate ? (weekApprovedMinutes / 60) * hourlyRate : null,
    },
  };
}
