import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { emitRealtimeEvent } from '@/lib/realtime';
import {
  assertTaskChatAccess,
  buildTaskThreadMessages,
  displayUserName,
  fetchTaskThreadRaw,
  sendTaskThreadMessage,
} from '@/lib/task-chat';

const messageInclude = {
  sender: { select: { id: true, firstName: true, lastName: true, role: true } },
  receiver: { select: { id: true, firstName: true, lastName: true, role: true } },
} as const;

async function broadcastChatMessage(
  companyId: number,
  taskId: number,
  userId: number,
  message: Record<string, unknown>
) {
  await emitRealtimeEvent({
    type: 'chat:message',
    companyId,
    taskId,
    userId,
    payload: { message, taskId },
  });
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const { searchParams } = new URL(request.url);
  const taskIdParam = searchParams.get('taskId');
  const otherUserId = searchParams.get('otherUserId');

  try {
    if (taskIdParam && !otherUserId) {
      const taskId = Number(taskIdParam);
      const access = await assertTaskChatAccess(request, tokenUser, taskId);
      if (!access.ok) {
        return NextResponse.json({ success: false, message: access.message }, { status: access.status });
      }

      const raw = await fetchTaskThreadRaw(taskId, tokenUser.userId, access.user.role);
      const messages = buildTaskThreadMessages(raw, tokenUser.userId, access.user.role);

      await prisma.chatMessage.updateMany({
        where: {
          taskId,
          receiverId: tokenUser.userId,
          isRead: false,
        },
        data: { isRead: true },
      });

      return NextResponse.json({
        success: true,
        data: {
          mode: 'task',
          taskId,
          messages,
        },
      });
    }

    const where: Record<string, unknown> = {
      OR: [{ senderId: tokenUser.userId }, { receiverId: tokenUser.userId }],
    };

    if (taskIdParam) where.taskId = Number(taskIdParam);
    if (otherUserId) {
      where.OR = [
        { senderId: tokenUser.userId, receiverId: Number(otherUserId) },
        { senderId: Number(otherUserId), receiverId: tokenUser.userId },
      ];
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      include: messageInclude,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const readFilter: Record<string, unknown> = {
      receiverId: tokenUser.userId,
      isRead: false,
    };
    if (taskIdParam) readFilter.taskId = Number(taskIdParam);
    if (otherUserId) readFilter.senderId = Number(otherUserId);
    await prisma.chatMessage.updateMany({
      where: readFilter,
      data: { isRead: true },
    });

    return NextResponse.json({ success: true, data: messages });
  } catch (error) {
    console.error('Chat GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;

  try {
    const body = await request.json();
    const { taskId: taskIdRaw, receiverId, message } = body;
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) {
      return NextResponse.json({ success: false, message: 'Message is required' }, { status: 400 });
    }

    const taskId = taskIdRaw ? Number(taskIdRaw) : null;

    if (taskId && !receiverId) {
      const access = await assertTaskChatAccess(request, tokenUser, taskId);
      if (!access.ok) {
        return NextResponse.json({ success: false, message: access.message }, { status: access.status });
      }

      const sender = await prisma.user.findUnique({
        where: { id: tokenUser.userId },
        select: { id: true, firstName: true, lastName: true, email: true, role: true },
      });
      if (!sender) {
        return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
      }

      const result = await sendTaskThreadMessage({
        taskId,
        senderId: tokenUser.userId,
        companyId: access.companyId,
        messageText: text,
        senderRole: sender.role,
        senderName: displayUserName(sender),
      });

      if (!result.ok) {
        return NextResponse.json({ success: false, message: result.message }, { status: result.status });
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            mode: 'task',
            taskId,
            messages: result.messages,
            sent: result.sent,
          },
        },
        { status: 201 }
      );
    }

    if (!receiverId) {
      return NextResponse.json({ success: false, message: 'receiverId is required' }, { status: 400 });
    }

    const chatMessage = await prisma.chatMessage.create({
      data: {
        taskId: taskId ? Number(taskId) : null,
        senderId: tokenUser.userId,
        receiverId: Number(receiverId),
        message: text,
        isRead: false,
      },
      include: messageInclude,
    });

    let companyId: number | undefined;
    if (taskId) {
      const task = await prisma.task.findUnique({
        where: { id: Number(taskId) },
        select: { companyId: true },
      });
      companyId = task?.companyId;
    }
    if (!companyId) {
      const dbSender = await prisma.user.findUnique({
        where: { id: tokenUser.userId },
        select: { companyId: true },
      });
      companyId = dbSender?.companyId ?? undefined;
    }

    if (companyId) {
      const payload = { message: chatMessage };
      await emitRealtimeEvent({
        type: 'chat:message',
        companyId,
        taskId: taskId ? Number(taskId) : undefined,
        userId: Number(receiverId),
        payload,
      });
      await emitRealtimeEvent({
        type: 'chat:message',
        companyId,
        taskId: taskId ? Number(taskId) : undefined,
        userId: tokenUser.userId,
        payload,
      });
    }

    return NextResponse.json({ success: true, data: chatMessage }, { status: 201 });
  } catch (error) {
    console.error('Chat POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
