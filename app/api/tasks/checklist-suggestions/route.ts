import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { getChecklistSuggestionsForTask } from '@/lib/ai/task-suggestions';

/** GET /api/tasks/checklist-suggestions?taskId=123 */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const taskId = Number(request.nextUrl.searchParams.get('taskId'));
  if (!taskId || Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'taskId required' }, { status: 400 });
  }

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { companyId: true },
    });
    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    if (!(role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN)) {
      const companyId = requireCompanyScope(tokenUser);
      if (!companyId || companyId !== task.companyId) {
        return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
      }
    }

    const suggestions = await getChecklistSuggestionsForTask(task.companyId, taskId);
    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('Checklist suggestions error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
