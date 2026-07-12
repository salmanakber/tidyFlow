import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { requireAuth } from '@/lib/rbac';
import {
  assertTaskChatAccess,
  getCompanyChatStaff,
} from '@/lib/task-chat';

/** Validates task chat access before opening the thread. */
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
    if (access.user.role === UserRole.CLEANER) {
      const staff = await getCompanyChatStaff(access.companyId);
      if (!staff.length) {
        return NextResponse.json(
          { success: false, message: 'No company owner or manager is available for chat' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        mode: 'task',
        taskId,
      },
    });
  } catch (error) {
    console.error('Chat contact GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
