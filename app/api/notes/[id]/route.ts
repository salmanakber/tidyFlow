import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { NoteStatus, UserRole } from '@prisma/client';
import { emitTaskEvent } from '@/lib/realtime';
import { notifyTaskActivity } from '@/lib/notifications';

async function getNoteWithAccess(noteId: number, tokenUser: { userId: number; role: UserRole; companyId?: number | null }) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      task: {
        select: {
          id: true,
          title: true,
          companyId: true,
          assignedUserId: true,
          taskAssignments: { select: { userId: true } },
        },
      },
    },
  });

  if (!note) return { error: NextResponse.json({ success: false, message: 'Note not found' }, { status: 404 }) };
  if (!note.task) return { error: NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 }) };

  const role = tokenUser.role as UserRole;
  if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER) {
    const companyId = requireCompanyScope(tokenUser);
    if (!companyId || note.task.companyId !== companyId) {
      return { error: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
    }
    if (role === UserRole.CLEANER) {
      const isAssigned =
        note.task.assignedUserId === tokenUser.userId ||
        note.task.taskAssignments.some((ta) => ta.userId === tokenUser.userId);
      if (!isAssigned && note.userId !== tokenUser.userId) {
        return { error: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
      }
    }
  }

  return { note };
}

// GET /api/notes/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const result = await getNoteWithAccess(id, auth.tokenUser);
  if ('error' in result && result.error) return result.error;

  return NextResponse.json({ success: true, data: result.note });
}

// PATCH /api/notes/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const result = await getNoteWithAccess(id, auth.tokenUser);
  if ('error' in result && result.error) return result.error;
  const { note } = result;

  try {
    const body = await request.json();
    const data: { content?: string; status?: NoteStatus } = {};
    if (body.content != null) data.content = String(body.content).trim();
    if (body.status != null && Object.values(NoteStatus).includes(body.status)) {
      data.status = body.status as NoteStatus;
    }

    const updated = await prisma.note.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const eventType = note!.noteType === 'issue' ? 'task:issue' : 'task:note';
    await emitTaskEvent(eventType, note!.task!.companyId, note!.taskId!, {
      noteId: updated.id,
      noteType: updated.noteType,
      action: 'updated',
      status: updated.status,
    });

    await notifyTaskActivity({
      companyId: note!.task!.companyId,
      taskId: note!.taskId!,
      title: note!.noteType === 'issue' ? 'Issue updated' : 'Note updated',
      message: `A ${note!.noteType} on "${note!.task!.title}" was updated.`,
      type: note!.noteType === 'issue' ? 'task_issue' : 'task_note',
      actorUserId: auth.tokenUser.userId,
      metadata: { noteId: updated.id, status: updated.status },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[notes PATCH]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/notes/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const id = Number(params.id);
  if (Number.isNaN(id)) return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const result = await getNoteWithAccess(id, auth.tokenUser);
  if ('error' in result && result.error) return result.error;
  const { note } = result;

  const role = auth.tokenUser.role as UserRole;
  if (
    role === UserRole.CLEANER &&
    note!.userId !== auth.tokenUser.userId
  ) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    await prisma.note.delete({ where: { id } });

    const eventType = note!.noteType === 'issue' ? 'task:issue' : 'task:note';
    await emitTaskEvent(eventType, note!.task!.companyId, note!.taskId!, {
      noteId: id,
      noteType: note!.noteType,
      action: 'deleted',
    });

    return NextResponse.json({ success: true, message: 'Deleted' });
  } catch (error) {
    console.error('[notes DELETE]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
