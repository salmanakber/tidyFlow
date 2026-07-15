import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveAuthenticatedUser, resolveCompanyIdAsync } from '@/lib/rbac';

/** GET /api/supplies/usage?taskId= — usages logged against a job */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const taskId = Number(request.nextUrl.searchParams.get('taskId'));
  if (!taskId || Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'taskId required' }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, companyId },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
  }

  const usages = await prisma.supplyUsage.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    include: {
      supplyItem: { select: { id: true, name: true, unit: true } },
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const data = usages.map((u) => ({
    id: u.id,
    quantity: u.quantity,
    notes: u.notes,
    createdAt: u.createdAt,
    supplyItemId: u.supplyItemId,
    supplyName: u.supplyItem.name,
    unit: u.supplyItem.unit,
    userId: u.userId,
    userName: [u.user.firstName, u.user.lastName].filter(Boolean).join(' ').trim() || 'Team member',
  }));

  const byItem = new Map<
    number,
    { supplyItemId: number; supplyName: string; unit: string; totalQuantity: number }
  >();
  for (const row of data) {
    const prev = byItem.get(row.supplyItemId);
    if (prev) {
      prev.totalQuantity += row.quantity;
    } else {
      byItem.set(row.supplyItemId, {
        supplyItemId: row.supplyItemId,
        supplyName: row.supplyName,
        unit: row.unit,
        totalQuantity: row.quantity,
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      usages: data,
      summary: Array.from(byItem.values()),
      totalLogs: data.length,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { supplyItemId, quantity = 1, taskId, notes } = body;

  const actor = await resolveAuthenticatedUser(auth.tokenUser);
  if (!actor) {
    return NextResponse.json(
      {
        success: false,
        message: 'Your session is out of date. Please sign out and sign in again.',
      },
      { status: 401 }
    );
  }

  const item = await prisma.supplyItem.findUnique({ where: { id: Number(supplyItemId) } });
  if (!item) return NextResponse.json({ success: false, message: 'Supply not found' }, { status: 404 });

  if (actor.companyId != null && item.companyId !== actor.companyId) {
    return NextResponse.json({ success: false, message: 'Supply not found' }, { status: 404 });
  }

  const qty = Math.max(1, Number(quantity) || 1);
  const parsedTaskId = taskId ? Number(taskId) : null;

  const usage = await prisma.supplyUsage.create({
    data: {
      supplyItemId: item.id,
      userId: actor.id,
      taskId: parsedTaskId && Number.isFinite(parsedTaskId) ? parsedTaskId : null,
      quantity: qty,
      notes: notes || null,
    },
  });

  await prisma.supplyItem.update({
    where: { id: item.id },
    data: { currentStock: Math.max(0, item.currentStock - qty) },
  });

  if (parsedTaskId && Number.isFinite(parsedTaskId)) {
    const task = await prisma.task.findUnique({
      where: { id: parsedTaskId },
      select: { companyId: true },
    });
    if (task) {
      const { emitTaskEvent } = await import('@/lib/realtime');
      await emitTaskEvent('task:supply', task.companyId, parsedTaskId, {
        supplyItemId: item.id,
        quantity: qty,
      });
    }
  }

  return NextResponse.json({ success: true, data: usage }, { status: 201 });
}
