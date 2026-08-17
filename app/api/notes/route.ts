import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import type { JWTPayload } from '@/lib/auth';
import { NoteSeverity, NoteStatus, UserRole } from '@prisma/client';
import { emitTaskEvent } from '@/lib/realtime';
import { notifyTaskActivity } from '@/lib/notifications';

async function assertTaskAccess(taskId: number, tokenUser: JWTPayload) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      companyId: true,
      assignedUserId: true,
      taskAssignments: { select: { userId: true } },
    },
  });
  if (!task) return { error: NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 }) };

  const role = tokenUser.role as UserRole;
  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
    const companyId = requireCompanyScope(tokenUser);
    if (!companyId || task.companyId !== companyId) {
      return { error: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
    }
    if (role === UserRole.CLEANER) {
      const isAssigned =
        task.assignedUserId === tokenUser.userId ||
        task.taskAssignments.some((ta) => ta.userId === tokenUser.userId);
      if (!isAssigned) {
        return { error: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
      }
    }
  }

  return { task };
}

// GET /api/notes?taskId=&noteType=
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const taskId = Number(searchParams.get('taskId'));
  const noteType = searchParams.get('noteType') || undefined;

  if (!taskId || Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'taskId is required' }, { status: 400 });
  }

  const access = await assertTaskAccess(taskId, auth.tokenUser);
  if ('error' in access && access.error) return access.error;

  try {
    const notes = await prisma.note.findMany({
      where: {
        taskId,
        ...(noteType ? { noteType } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: notes });
  } catch (error) {
    console.error('[notes GET]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/notes
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { taskId, content, noteType = 'note', severity = 'LOW', category } = body as {
      taskId?: number;
      content?: string;
      noteType?: string;
      severity?: string;
      category?: string;
    };

    if (!taskId || !content?.trim()) {
      return NextResponse.json({ success: false, message: 'taskId and content are required' }, { status: 400 });
    }

    const access = await assertTaskAccess(Number(taskId), auth.tokenUser);
    if ('error' in access && access.error) return access.error;
    const { task } = access;

    const note = await prisma.note.create({
      data: {
        taskId: Number(taskId),
        userId: auth.tokenUser.userId,
        content: content.trim(),
        noteType,
        severity: Object.values(NoteSeverity).includes(severity as NoteSeverity)
          ? (severity as NoteSeverity)
          : NoteSeverity.LOW,
        status: NoteStatus.OPEN,
        category: category || null,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const eventType = noteType === 'issue' ? 'task:issue' : 'task:note';
    await emitTaskEvent(eventType, task!.companyId, Number(taskId), {
      noteId: note.id,
      noteType,
      severity: note.severity,
      action: 'created',
    });

    const actor = note.user;
    const actorName = `${actor?.firstName || ''} ${actor?.lastName || ''}`.trim() || 'Someone';
    const isIssue = noteType === 'issue';

    await notifyTaskActivity({
      companyId: task!.companyId,
      taskId: Number(taskId),
      title: isIssue ? 'New issue reported' : 'New note added',
      message: isIssue
        ? `${actorName} reported an issue on "${task!.title}": ${content.trim().slice(0, 120)}`
        : `${actorName} added a note on "${task!.title}".`,
      type: isIssue ? 'task_issue' : 'task_note',
      actorUserId: auth.tokenUser.userId,
      metadata: { noteId: note.id, noteType, severity: note.severity },
    });

    return NextResponse.json({ success: true, data: note }, { status: 201 });
  } catch (error) {
    console.error('[notes POST]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
