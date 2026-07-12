import { NextRequest } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { JWTPayload } from '@/lib/auth';
import { requireCompanyScope } from '@/lib/rbac';

/** Company-level staff who participate in task chat — excludes platform / system roles. */
export const COMPANY_CHAT_STAFF_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.MANAGER,
  UserRole.COMPANY_ADMIN,
];

export const PLATFORM_CHAT_EXCLUDED_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.DEVELOPER,
  UserRole.ADMIN_UNIQUE,
  UserRole.SUPER_ADMIN_MANAGER,
];

export const CHAT_ANSWERED_PREFIX = '__CHAT_ANSWERED__:';
export const CHAT_VOICE_PREFIX = '__CHAT_VOICE__:';

export const TASK_STATUS_CHAT_SORT: Record<string, number> = {
  IN_PROGRESS: 0,
  ASSIGNED: 1,
  SUBMITTED: 2,
  QA_REVIEW: 3,
  APPROVED: 4,
  PLANNED: 5,
  DRAFT: 6,
  REJECTED: 7,
  COMPLETED: 8,
  ARCHIVED: 9,
};

export function sortTasksInProgressFirst<T extends { status: string }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const pa = TASK_STATUS_CHAT_SORT[a.status] ?? 50;
    const pb = TASK_STATUS_CHAT_SORT[b.status] ?? 50;
    return pa - pb;
  });
}

export function buildVoiceMessage(payload: {
  url: string;
  durationSec?: number;
  publicId?: string;
}): string {
  return `${CHAT_VOICE_PREFIX}${JSON.stringify(payload)}`;
}

export function parseVoiceMessage(message: string): {
  url: string;
  durationSec?: number;
  publicId?: string;
} | null {
  if (!message.startsWith(CHAT_VOICE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(message.slice(CHAT_VOICE_PREFIX.length));
    if (typeof parsed?.url === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function displayUserName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email;
}

export function isCompanyChatStaff(role: UserRole | string): boolean {
  return COMPANY_CHAT_STAFF_ROLES.includes(role as UserRole);
}

export function isPlatformChatExcluded(role: UserRole | string): boolean {
  return PLATFORM_CHAT_EXCLUDED_ROLES.includes(role as UserRole);
}

export async function assertTaskChatAccess(
  _request: NextRequest,
  tokenUser: JWTPayload,
  taskId: number
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      companyId: true,
      assignedUserId: true,
      taskAssignments: { select: { userId: true } },
    },
  });

  if (!task) {
    return { ok: false as const, status: 404, message: 'Task not found' };
  }

  const user = await prisma.user.findUnique({
    where: { id: tokenUser.userId },
    select: { id: true, companyId: true, role: true, isActive: true },
  });

  if (!user?.isActive) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }

  const role = user.role;

  if (isPlatformChatExcluded(role)) {
    return { ok: false as const, status: 403, message: 'Chat is not available for platform accounts' };
  }

  // Mirror /api/tasks/[id] access — owners skip company scope; staff/cleaners must match company.
  const isOwnerBypass = role === UserRole.OWNER;

  if (!isOwnerBypass) {
    const companyId =
      requireCompanyScope(tokenUser) ?? user.companyId ?? tokenUser.companyId ?? null;

    if (!companyId || companyId !== task.companyId) {
      return { ok: false as const, status: 403, message: 'Forbidden' };
    }
  }

  if (role === UserRole.CLEANER) {
    const assignedIds = new Set(task.taskAssignments.map((ta) => ta.userId));
    if (task.assignedUserId) assignedIds.add(task.assignedUserId);
    if (!assignedIds.has(user.id)) {
      return { ok: false as const, status: 403, message: 'You are not assigned to this task' };
    }
  } else if (!isCompanyChatStaff(role) && role !== UserRole.OWNER) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }

  const companyId = task.companyId;

  return { ok: true as const, task, user, companyId };
}

export async function getCompanyChatStaff(companyId: number) {
  return prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: COMPANY_CHAT_STAFF_ROLES },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
    orderBy: [{ role: 'asc' }, { id: 'asc' }],
  });
}

export async function getTaskCleanerIds(taskId: number): Promise<number[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      assignedUserId: true,
      taskAssignments: { select: { userId: true, user: { select: { role: true } } } },
      assignedUser: { select: { id: true, role: true } },
    },
  });
  if (!task) return [];

  const ids = new Set<number>();
  if (task.assignedUser?.role === UserRole.CLEANER) ids.add(task.assignedUser.id);
  task.taskAssignments.forEach((ta) => {
    if (ta.user?.role === UserRole.CLEANER) ids.add(ta.userId);
  });
  if (task.assignedUserId && task.assignedUser?.role !== UserRole.CLEANER) {
    const u = await prisma.user.findUnique({
      where: { id: task.assignedUserId },
      select: { role: true },
    });
    if (u?.role === UserRole.CLEANER) ids.add(task.assignedUserId);
  }
  return Array.from(ids);
}

type RawChatRow = {
  id: number;
  taskId: number | null;
  senderId: number;
  receiverId: number;
  message: string;
  isRead: boolean;
  createdAt: Date;
  sender: { id: number; firstName: string | null; lastName: string | null; role: UserRole };
  receiver: { id: number; firstName: string | null; lastName: string | null; role: UserRole };
};

export type TaskChatThreadMessage = {
  id: number;
  message: string;
  senderId: number;
  sender: { id: number; firstName: string | null; lastName: string | null; role: UserRole };
  createdAt: string;
  kind: 'user' | 'system' | 'voice';
  answeredBy?: { id: number; name: string };
  isMe: boolean;
  voice?: { url: string; durationSec?: number; publicId?: string };
};

function dedupeKey(row: RawChatRow) {
  const voice = parseVoiceMessage(row.message);
  if (voice) {
    // All recipient copies of a voice broadcast share the same Cloudinary URL.
    return `voice:${row.senderId}|${voice.url}`;
  }
  const sec = Math.floor(new Date(row.createdAt).getTime() / 1000);
  return `${row.senderId}|${row.message}|${sec}`;
}

function parseAnsweredSystem(message: string): { id: number; name: string } | null {
  if (!message.startsWith(CHAT_ANSWERED_PREFIX)) return null;
  const rest = message.slice(CHAT_ANSWERED_PREFIX.length);
  const colon = rest.indexOf(':');
  if (colon <= 0) return null;
  const id = Number(rest.slice(0, colon));
  const name = rest.slice(colon + 1);
  if (!Number.isFinite(id) || !name) return null;
  return { id, name };
}

export function buildTaskThreadMessages(
  rows: RawChatRow[],
  viewerId: number,
  viewerRole: UserRole
): TaskChatThreadMessage[] {
  const userRows = rows.filter((r) => !r.message.startsWith(CHAT_ANSWERED_PREFIX));
  const systemRows = rows.filter((r) => r.message.startsWith(CHAT_ANSWERED_PREFIX));

  const deduped = new Map<string, RawChatRow>();
  for (const row of userRows) {
    const key = dedupeKey(row);
    const existing = deduped.get(key);
    // Keep the lowest id when multiple recipient copies share the same broadcast.
    if (!existing || row.id < existing.id) deduped.set(key, row);
  }

  const chronological = Array.from(deduped.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const answeredByCleanerMessage = new Map<number, { id: number; name: string }>();
  for (let i = 0; i < chronological.length; i++) {
    const msg = chronological[i];
    if (msg.sender.role !== UserRole.CLEANER) continue;
    for (let j = i + 1; j < chronological.length; j++) {
      const next = chronological[j];
      if (next.sender.role === UserRole.CLEANER) break;
      if (isCompanyChatStaff(next.sender.role)) {
        answeredByCleanerMessage.set(msg.id, {
          id: next.sender.id,
          name: displayUserName(next.sender),
        });
        break;
      }
    }
  }

  for (const sys of systemRows) {
    if (sys.receiverId !== viewerId) continue;
    const parsed = parseAnsweredSystem(sys.message);
    if (!parsed) continue;
    const target = chronological.find(
      (m) =>
        m.sender.role === UserRole.CLEANER &&
        new Date(m.createdAt).getTime() <= new Date(sys.createdAt).getTime()
    );
    if (target && !answeredByCleanerMessage.has(target.id)) {
      answeredByCleanerMessage.set(target.id, parsed);
    }
  }

  return chronological.map((row) => {
    const answeredBy = answeredByCleanerMessage.get(row.id);
    const hideAnsweredLabel =
      viewerRole !== UserRole.CLEANER &&
      answeredBy &&
      answeredBy.id === viewerId;

    const voice = parseVoiceMessage(row.message);

    return {
      id: row.id,
      message: voice ? '' : row.message,
      senderId: row.senderId,
      sender: row.sender,
      createdAt: row.createdAt.toISOString(),
      kind: voice ? ('voice' as const) : ('user' as const),
      isMe: row.senderId === viewerId,
      ...(voice ? { voice } : {}),
      ...(answeredBy &&
        isCompanyChatStaff(viewerRole) &&
        !hideAnsweredLabel && {
          answeredBy,
        }),
    };
  });
}

export async function fetchTaskThreadRaw(
  taskId: number,
  viewerId: number,
  viewerRole: UserRole
): Promise<RawChatRow[]> {
  const where =
    isCompanyChatStaff(viewerRole) || viewerRole === UserRole.CLEANER
      ? isCompanyChatStaff(viewerRole)
        ? { taskId }
        : {
            taskId,
            OR: [{ senderId: viewerId }, { receiverId: viewerId }],
          }
      : {
          taskId,
          OR: [{ senderId: viewerId }, { receiverId: viewerId }],
        };

  return prisma.chatMessage.findMany({
    where,
    include: {
      sender: {
        select: { id: true, firstName: true, lastName: true, role: true },
      },
      receiver: {
        select: { id: true, firstName: true, lastName: true, role: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  }) as Promise<RawChatRow[]>;
}

const messageInclude = {
  sender: { select: { id: true, firstName: true, lastName: true, role: true } },
  receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
} as const;

async function broadcastChatRow(
  companyId: number,
  taskId: number,
  userId: number,
  row: Record<string, unknown>
) {
  const { emitRealtimeEvent } = await import('@/lib/realtime');
  await emitRealtimeEvent({
    type: 'chat:message',
    companyId,
    taskId,
    userId,
    payload: { message: row, taskId },
  });
}

/** Send a message (text or voice payload) to all task chat recipients. */
export async function sendTaskThreadMessage(params: {
  taskId: number;
  senderId: number;
  companyId: number;
  messageText: string;
  senderRole: UserRole;
  senderName: string;
}) {
  const { taskId, senderId, companyId, messageText, senderRole, senderName } = params;

  let recipientIds: number[] = [];
  if (senderRole === UserRole.CLEANER) {
    const staff = await getCompanyChatStaff(companyId);
    recipientIds = staff.map((s) => s.id);
  } else if (isCompanyChatStaff(senderRole) || senderRole === UserRole.OWNER) {
    recipientIds = await getTaskCleanerIds(taskId);
  }

  if (!recipientIds.length) {
    return { ok: false as const, status: 400, message: 'No recipients available for this task chat' };
  }

  const created = [];
  for (const rid of recipientIds) {
    const row = await prisma.chatMessage.create({
      data: {
        taskId,
        senderId,
        receiverId: rid,
        message: messageText,
        isRead: false,
      },
      include: messageInclude,
    });
    created.push(row);
    await broadcastChatRow(companyId, taskId, rid, row as unknown as Record<string, unknown>);
  }

  if (isCompanyChatStaff(senderRole) || senderRole === UserRole.OWNER) {
    const otherStaff = await getCompanyChatStaff(companyId);
    const answeredPayload = `${CHAT_ANSWERED_PREFIX}${senderId}:${senderName}`;
    for (const staff of otherStaff) {
      if (staff.id === senderId) continue;
      const sysRow = await prisma.chatMessage.create({
        data: {
          taskId,
          senderId,
          receiverId: staff.id,
          message: answeredPayload,
          isRead: false,
        },
        include: messageInclude,
      });
      await broadcastChatRow(companyId, taskId, staff.id, sysRow as unknown as Record<string, unknown>);
    }
  }

  if (created[0]) {
    await broadcastChatRow(companyId, taskId, senderId, created[0] as unknown as Record<string, unknown>);
  }

  const raw = await fetchTaskThreadRaw(taskId, senderId, senderRole);
  const messages = buildTaskThreadMessages(raw, senderId, senderRole);

  return { ok: true as const, messages, sent: created.length };
}

export async function getChatInboxForUser(tokenUser: JWTPayload) {
  const user = await prisma.user.findUnique({
    where: { id: tokenUser.userId },
    select: { id: true, companyId: true, role: true, isActive: true },
  });

  if (!user?.isActive || isPlatformChatExcluded(user.role)) {
    return { totalUnread: 0, tasks: [] as Array<Record<string, unknown>> };
  }

  const activeStatuses = ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'QA_REVIEW', 'APPROVED', 'PLANNED'];

  let taskWhere: Record<string, unknown> = {
    status: { in: activeStatuses },
  };

  if (user.role === UserRole.CLEANER) {
    taskWhere = {
      status: { in: activeStatuses },
      OR: [
        { assignedUserId: user.id },
        { taskAssignments: { some: { userId: user.id } } },
      ],
    };
  } else if (user.role === UserRole.OWNER) {
    if (user.companyId) {
      taskWhere.companyId = user.companyId;
    }
  } else if (isCompanyChatStaff(user.role)) {
    const companyId = requireCompanyScope(tokenUser) ?? user.companyId ?? tokenUser.companyId;
    if (!companyId) return { totalUnread: 0, tasks: [] };
    taskWhere.companyId = companyId;
  } else {
    return { totalUnread: 0, tasks: [] };
  }

  const tasks = await prisma.task.findMany({
    where: taskWhere,
    select: {
      id: true,
      title: true,
      status: true,
      scheduledDate: true,
      property: { select: { address: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 80,
  });

  const taskIds = tasks.map((t) => t.id);
  if (!taskIds.length) return { totalUnread: 0, tasks: [] };

  const unreadGroups = await prisma.chatMessage.groupBy({
    by: ['taskId'],
    where: {
      taskId: { in: taskIds },
      receiverId: user.id,
      isRead: false,
      NOT: { message: { startsWith: CHAT_ANSWERED_PREFIX } },
    },
    _count: { _all: true },
  });

  const unreadMap = new Map(unreadGroups.map((g) => [g.taskId!, g._count._all]));
  const enriched = tasks.map((t) => ({
    taskId: t.id,
    title: t.title,
    status: t.status,
    scheduledDate: t.scheduledDate?.toISOString() ?? null,
    address: t.property?.address ?? null,
    unreadCount: unreadMap.get(t.id) ?? 0,
  }));

  const sorted = sortTasksInProgressFirst(enriched);
  const totalUnread = sorted.reduce((sum, t) => sum + (t.unreadCount as number), 0);

  return { totalUnread, tasks: sorted };
}
