import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { assertTaskChatAccess } from '@/lib/task-chat';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;
  const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  if (!Number.isFinite(taskId) || taskId <= 0) {
    return NextResponse.json({ success: false, message: 'taskId is required' }, { status: 400 });
  }

  const access = await assertTaskChatAccess(request, tokenUser, taskId);
  if (!access.ok) {
    return NextResponse.json({ success: false, message: access.message }, { status: access.status });
  }

  try {
    const count = await prisma.chatMessage.count({
      where: {
        taskId,
        receiverId: tokenUser.userId,
        isRead: false,
        NOT: { message: { startsWith: '__CHAT_ANSWERED__:' } },
      },
    });

    return NextResponse.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Chat unread GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
