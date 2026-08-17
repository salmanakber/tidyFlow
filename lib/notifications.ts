import prisma from '@/lib/prisma';
import { emitRealtimeEvent } from '@/lib/realtime';

export interface CreateNotificationInput {
  userId: number;
  title: string;
  message: string;
  type: string;
  metadata?: Record<string, unknown>;
  screenRoute?: string;
  screenParams?: Record<string, unknown>;
}

function buildMetadata(input: CreateNotificationInput): string {
  const meta: Record<string, unknown> = { ...(input.metadata || {}) };
  if (input.screenRoute) meta.screenRoute = input.screenRoute;
  if (input.screenParams) meta.screenParams = input.screenParams;
  return JSON.stringify(meta);
}

export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      message: input.message,
      type: input.type,
      status: 'unread',
      metadata: buildMetadata(input),
    },
  });

  // Push via Expo — one delivery per user (most recently updated device)
  try {
    const tokens = await prisma.deviceToken.findMany({
      where: { userId: input.userId, isActive: true, expoPushToken: { not: null } },
      select: { expoPushToken: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    const seen = new Set<string>();
    const pushTokens: string[] = [];
    for (const row of tokens) {
      const token = row.expoPushToken;
      if (!token || seen.has(token)) continue;
      seen.add(token);
      pushTokens.push(token);
      break; // single active device per user avoids duplicate pushes
    }
    if (pushTokens.length > 0) {
      await sendExpoPush(pushTokens, input.title, input.message, input.metadata);
    }
  } catch (err) {
    console.warn('Push notification failed:', err);
  }

  emitRealtimeEvent({
    type: 'notification:new',
    userId: input.userId,
    payload: {
      notificationId: notification.id,
      title: input.title,
      message: input.message,
      type: input.type,
      screenRoute: input.screenRoute,
      screenParams: input.screenParams,
    },
  }).catch(() => {});

  return notification;
}

async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data: data || {},
  }));

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
}

export async function sendTaskAssignmentNotifications(taskId: number, cleanerIds: number[]) {
  const uniqueIds = Array.from(new Set(cleanerIds.map((id) => Number(id)).filter((id) => id > 0)));
  if (uniqueIds.length === 0) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      scheduledDate: true,
      property: { select: { address: true } },
    },
  });
  if (!task) return;

  const dateStr = task.scheduledDate
    ? new Date(task.scheduledDate).toLocaleDateString('en-GB')
    : 'TBD';

  for (const userId of uniqueIds) {
    await createNotification({
      userId,
      title: 'New Task Assigned',
      message: `You have been assigned "${task.title}" at ${task.property?.address || 'property'} on ${dateStr}.`,
      type: 'task_assignment',
      metadata: { taskId },
      screenRoute: 'TaskDetail',
      screenParams: { taskId },
    });
  }
}

export async function sendTaskUpdatedNotification(
  taskId: number,
  cleanerIds: number[],
  reason: 'assignment' | 'status' | 'update'
) {
  const uniqueIds = Array.from(new Set(cleanerIds.map((id) => Number(id)).filter((id) => id > 0)));
  if (uniqueIds.length === 0) return;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, status: true, property: { select: { address: true } } },
  });
  if (!task) return;

  const titles: Record<string, string> = {
    assignment: 'Task Assignment Updated',
    status: 'Task Status Updated',
    update: 'Task Updated',
  };

  for (const userId of uniqueIds) {
    await createNotification({
      userId,
      title: titles[reason] || 'Task Updated',
      message: `"${task.title}" — ${task.status.replace(/_/g, ' ')}${task.property?.address ? ` · ${task.property.address}` : ''}`,
      type: reason === 'assignment' ? 'task_assignment' : 'task_updated',
      metadata: { taskId, reason },
      screenRoute: 'TaskDetail',
      screenParams: { taskId },
    });
  }
}

/** Notify a cleaner when a manager submits a QA score for their task. */
export async function sendQAResultNotification(
  taskId: number,
  userId: number,
  passed: boolean,
  comments?: string | null
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, property: { select: { address: true } } },
  });
  if (!task) return;

  const location = task.property?.address ? ` at ${task.property.address}` : '';
  const commentSuffix = comments?.trim() ? ` Comment: ${comments.trim().slice(0, 200)}` : '';

  await createNotification({
    userId,
    title: passed ? 'QA Passed' : 'QA Review Complete',
    message: passed
      ? `Your work on "${task.title}"${location} passed QA review.${commentSuffix}`
      : `Your work on "${task.title}"${location} was reviewed. Please check feedback.${commentSuffix}`,
    type: 'qa_result',
    metadata: { taskId, passed, hasComments: !!comments?.trim() },
    screenRoute: 'TaskDetail',
    screenParams: { taskId },
  });
}

export async function notifyManagersClientReview(input: {
  companyId: number;
  taskId: number;
  rating: number;
  propertyAddress?: string;
}) {
  const managers = await prisma.user.findMany({
    where: {
      companyId: input.companyId,
      role: { in: ['MANAGER', 'COMPANY_ADMIN', 'OWNER'] },
      isActive: true,
    },
    select: { id: true },
  });

  const stars = '★'.repeat(input.rating);
  for (const manager of managers) {
    await createNotification({
      userId: manager.id,
      title: input.rating >= 4 ? 'Positive Client Review' : 'Client Feedback Received',
      message: `${stars} (${input.rating}/5) for a completed job${input.propertyAddress ? ` at ${input.propertyAddress}` : ''}.`,
      type: 'qa_result',
      metadata: { taskId: input.taskId, rating: input.rating, source: 'client_review' },
      screenRoute: 'TaskDetail',
      screenParams: { taskId: input.taskId },
    });
  }
}

export async function notifyManagersSheetStatusBlocked(input: {
  companyId: number;
  taskTitle: string;
  requestedStatus: string;
  propertyRef?: string;
  spreadsheetTitle?: string;
}) {
  const managers = await prisma.user.findMany({
    where: {
      companyId: input.companyId,
      role: { in: ['MANAGER', 'COMPANY_ADMIN', 'OWNER'] },
      isActive: true,
    },
    select: { id: true },
  });

  const statusLabel = input.requestedStatus.replace(/_/g, ' ');
  const message = `"${input.taskTitle}" could not be set to ${statusLabel} from Google Sheets — no cleaner is assigned. Add a cleaner email in the Assigned User Email column, then sync again.`;

  for (const manager of managers) {
    await createNotification({
      userId: manager.id,
      title: 'Sheet sync: status blocked',
      message,
      type: 'sheet_sync_warning',
      metadata: {
        taskTitle: input.taskTitle,
        requestedStatus: input.requestedStatus,
        propertyRef: input.propertyRef,
      },
      screenRoute: 'PropertySelection',
    });
  }
}

export async function notifyTaskApproved(input: {
  taskId: number;
  companyId: number;
  approvedByUserId: number;
}) {
  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: {
      title: true,
      assignedUserId: true,
      taskAssignments: { select: { userId: true } },
    },
  });
  if (!task) return;

  const cleanerIds = new Set<number>();
  if (task.assignedUserId) cleanerIds.add(task.assignedUserId);
  task.taskAssignments.forEach((a) => cleanerIds.add(a.userId));

  for (const userId of Array.from(cleanerIds)) {
    await createNotification({
      userId,
      title: 'Task Approved',
      message: `Your task "${task.title}" has been approved. Great work!`,
      type: 'task_completed',
      metadata: { taskId: input.taskId },
      screenRoute: 'TaskDetail',
      screenParams: { taskId: input.taskId },
    });
  }
}

/** Notify company managers (and optionally the actor) for task activity history. */
export async function notifyTaskActivity(input: {
  companyId: number;
  taskId: number;
  title: string;
  message: string;
  type: string;
  actorUserId?: number;
  metadata?: Record<string, unknown>;
  notifyManagers?: boolean;
  notifyActor?: boolean;
}) {
  const userIds = new Set<number>();
  if (input.notifyActor !== false && input.actorUserId) {
    userIds.add(input.actorUserId);
  }

  if (input.notifyManagers !== false) {
    const managers = await prisma.user.findMany({
      where: {
        companyId: input.companyId,
        role: { in: ['MANAGER', 'COMPANY_ADMIN', 'OWNER'] },
        isActive: true,
      },
      select: { id: true },
    });
    for (const m of managers) {
      if (m.id !== input.actorUserId) userIds.add(m.id);
    }
  }

  for (const userId of Array.from(userIds)) {
    await createNotification({
      userId,
      title: input.title,
      message: input.message,
      type: input.type,
      metadata: { taskId: input.taskId, ...input.metadata },
      screenRoute: 'TaskDetail',
      screenParams: { taskId: input.taskId },
    }).catch(() => {});
  }
}
