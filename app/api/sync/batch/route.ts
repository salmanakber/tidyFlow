import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';
import { TaskStatus, NoteStatus, NoteSeverity } from '@prisma/client';
import { performLocationCheck } from '@/lib/location-check';

interface SyncAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  occurredAt?: string;
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { tokenUser } = auth;

  try {
    const body = await request.json();
    const { actions } = body as { actions: SyncAction[] };

    if (!Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json({ success: false, message: 'actions array required' }, { status: 400 });
    }

    const results: Array<{ id: string; success: boolean; error?: string }> = [];
    const emittedTasks = new Set<string>();

    for (const action of actions) {
      const occurredAt = action.occurredAt ? new Date(action.occurredAt) : new Date();
      try {
        switch (action.type) {
          case 'task_status': {
            const { taskId, status, latitude, longitude } = action.payload as {
              taskId: number;
              status: TaskStatus;
              latitude?: number;
              longitude?: number;
            };

            const task = await prisma.task.findUnique({ where: { id: Number(taskId) } });
            if (!task) throw new Error('Task not found');

            const data: Record<string, unknown> = { status };
            if (status === TaskStatus.IN_PROGRESS) data.startedAt = occurredAt;
            if (status === TaskStatus.SUBMITTED || status === TaskStatus.COMPLETED) {
              data.completedAt = occurredAt;
            }

            await prisma.task.update({ where: { id: Number(taskId) }, data });

            if (!emittedTasks.has(`status:${taskId}`)) {
              const { emitTaskEvent } = await import('@/lib/realtime');
              await emitTaskEvent('task:status', task.companyId, Number(taskId), { status });
              emittedTasks.add(`status:${taskId}`);
            }

            if (latitude != null && longitude != null) {
              await performLocationCheck({
                taskId: Number(taskId),
                userId: tokenUser.userId,
                companyId: task.companyId,
                latitude: Number(latitude),
                longitude: Number(longitude),
                checkType: status === TaskStatus.IN_PROGRESS ? 'start' : 'complete',
              });
            }
            break;
          }

          case 'checklist': {
            const { itemId, isCompleted } = action.payload as {
              itemId: number;
              isCompleted: boolean;
            };
            await prisma.checklistItem.update({
              where: { id: Number(itemId) },
              data: { isCompleted: Boolean(isCompleted) },
            });
            const item = await prisma.checklistItem.findUnique({
              where: { id: Number(itemId) },
              select: { taskId: true, task: { select: { companyId: true } } },
            });
            if (item?.task) {
              const { emitTaskEvent } = await import('@/lib/realtime');
              await emitTaskEvent('task:checklist', item.task.companyId, item.taskId, {
                itemId: Number(itemId),
                isCompleted: Boolean(isCompleted),
              });
            }
            break;
          }

          case 'checklist_add': {
            const { taskId, title, order = 0 } = action.payload as {
              taskId: number;
              title: string;
              order?: number;
            };
            const created = await prisma.checklistItem.create({
              data: { taskId: Number(taskId), title: String(title), order: Number(order) },
            });
            const task = await prisma.task.findUnique({
              where: { id: Number(taskId) },
              select: { companyId: true },
            });
            if (task) {
              const { emitTaskEvent } = await import('@/lib/realtime');
              await emitTaskEvent('task:checklist', task.companyId, Number(taskId), {
                itemId: created.id,
                title: created.title,
                isCompleted: created.isCompleted,
                added: true,
              });
            }
            break;
          }

          case 'checklist_delete': {
            const { itemId } = action.payload as { itemId: number };
            const existing = await prisma.checklistItem.findUnique({
              where: { id: Number(itemId) },
              select: { id: true, taskId: true, title: true, task: { select: { companyId: true } } },
            });
            if (existing) {
              await prisma.checklistItem.delete({ where: { id: Number(itemId) } });
              if (existing.task) {
                const { emitTaskEvent } = await import('@/lib/realtime');
                await emitTaskEvent('task:checklist', existing.task.companyId, existing.taskId, {
                  itemId: existing.id,
                  deleted: true,
                  title: existing.title,
                });
              }
            }
            break;
          }

          case 'note':
          case 'note_create': {
            const { taskId, content, noteType = 'note', severity = 'LOW', category } = action.payload as {
              taskId: number;
              content: string;
              noteType?: string;
              severity?: string;
              category?: string;
            };
            const note = await prisma.note.create({
              data: {
                taskId: Number(taskId),
                userId: tokenUser.userId,
                content: String(content),
                noteType,
                severity: Object.values(NoteSeverity).includes(severity as NoteSeverity)
                  ? (severity as NoteSeverity)
                  : NoteSeverity.LOW,
                status: NoteStatus.OPEN,
                category: category || null,
                createdAt: occurredAt,
              },
            });
            const task = await prisma.task.findUnique({
              where: { id: Number(taskId) },
              select: { companyId: true },
            });
            if (task) {
              const { emitTaskEvent } = await import('@/lib/realtime');
              const { notifyTaskActivity } = await import('@/lib/notifications');
              const eventType = noteType === 'issue' ? 'task:issue' : 'task:note';
              await emitTaskEvent(eventType, task.companyId, Number(taskId), {
                noteId: note.id,
                noteType,
                action: 'created',
              });
              await notifyTaskActivity({
                companyId: task.companyId,
                taskId: Number(taskId),
                title: noteType === 'issue' ? 'Issue synced' : 'Note synced',
                message: `A ${noteType} was synced for this task.`,
                type: noteType === 'issue' ? 'task_issue' : 'task_note',
                actorUserId: tokenUser.userId,
              }).catch(() => {});
            }
            break;
          }

          case 'note_update': {
            const { noteId, content, status } = action.payload as {
              noteId: number;
              content?: string;
              status?: string;
            };
            const data: { content?: string; status?: NoteStatus } = {};
            if (content != null) data.content = String(content).trim();
            if (status != null && Object.values(NoteStatus).includes(status as NoteStatus)) {
              data.status = status as NoteStatus;
            }
            const updated = await prisma.note.update({ where: { id: Number(noteId) }, data });
            const task = await prisma.task.findUnique({
              where: { id: updated.taskId },
              select: { companyId: true },
            });
            if (task) {
              const { emitTaskEvent } = await import('@/lib/realtime');
              const eventType = updated.noteType === 'issue' ? 'task:issue' : 'task:note';
              await emitTaskEvent(eventType, task.companyId, updated.taskId, {
                noteId: updated.id,
                noteType: updated.noteType,
                action: 'updated',
                status: updated.status,
              });
            }
            break;
          }

          case 'note_delete': {
            const { noteId } = action.payload as { noteId: number };
            const existing = await prisma.note.findUnique({
              where: { id: Number(noteId) },
              select: { id: true, taskId: true, noteType: true, task: { select: { companyId: true } } },
            });
            if (existing) {
              await prisma.note.delete({ where: { id: Number(noteId) } });
              if (existing.task) {
                const { emitTaskEvent } = await import('@/lib/realtime');
                const eventType = existing.noteType === 'issue' ? 'task:issue' : 'task:note';
                await emitTaskEvent(eventType, existing.task.companyId, existing.taskId, {
                  noteId: existing.id,
                  noteType: existing.noteType,
                  action: 'deleted',
                });
              }
            }
            break;
          }

          case 'supply_create': {
            if (!tokenUser.companyId) throw new Error('Company required');
            const { name, unit, currentStock, minStock } = action.payload as {
              name: string;
              unit?: string;
              currentStock?: number;
              minStock?: number;
            };
            if (!name) throw new Error('name required');
            await prisma.supplyItem.create({
              data: {
                companyId: tokenUser.companyId,
                name: String(name).trim(),
                unit: unit || 'units',
                currentStock: currentStock ?? 0,
                minStock: minStock ?? 5,
              },
            });
            break;
          }

          case 'supply_usage': {
            const { supplyItemId, quantity = 1, taskId, notes } = action.payload as {
              supplyItemId: number;
              quantity?: number;
              taskId?: number;
              notes?: string;
            };
            const item = await prisma.supplyItem.findUnique({ where: { id: Number(supplyItemId) } });
            if (!item) throw new Error('Supply not found');
            await prisma.supplyUsage.create({
              data: {
                supplyItemId: item.id,
                userId: tokenUser.userId,
                taskId: taskId ? Number(taskId) : null,
                quantity: Number(quantity),
                notes,
                createdAt: occurredAt,
              },
            });
            await prisma.supplyItem.update({
              where: { id: item.id },
              data: { currentStock: Math.max(0, item.currentStock - Number(quantity)) },
            });
            if (taskId) {
              const task = await prisma.task.findUnique({
                where: { id: Number(taskId) },
                select: { companyId: true },
              });
              if (task) {
                const { emitTaskEvent } = await import('@/lib/realtime');
                await emitTaskEvent('task:supply', task.companyId, Number(taskId), {
                  supplyItemId: item.id,
                  quantity: Number(quantity),
                });
              }
            }
            break;
          }

          case 'timer': {
            if (!tokenUser.companyId) throw new Error('Company required');
            const { taskId, action: trackerAction, latitude, longitude } = action.payload as {
              taskId: number;
              action: 'start' | 'break' | 'resume' | 'submit';
              latitude?: number;
              longitude?: number;
            };
            const user = await prisma.user.findUnique({
              where: { id: tokenUser.userId },
              select: { firstName: true, lastName: true },
            });
            const { handleTrackerAction } = await import('@/lib/task-tracker');
            await handleTrackerAction({
              taskId: Number(taskId),
              userId: tokenUser.userId,
              companyId: tokenUser.companyId,
              action: trackerAction,
              latitude: latitude != null ? Number(latitude) : undefined,
              longitude: longitude != null ? Number(longitude) : undefined,
              cleanerName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
              occurredAt,
            });
            break;
          }

          default:
            throw new Error(`Unsupported action type: ${action.type}`);
        }

        results.push({ id: action.id, success: true });
      } catch (err: any) {
        results.push({ id: action.id, success: false, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      data: { processed: results.length, results },
    });
  } catch (error) {
    console.error('Sync batch error:', error);
    return NextResponse.json({ success: false, message: 'Sync failed' }, { status: 500 });
  }
}
