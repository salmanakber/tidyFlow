import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { supplyItemId, quantity = 1, taskId, notes } = body;

  const tokenUserId = Number(auth.tokenUser.userId);
  // Resolve a real User row — JWT userId can go stale after restores/re-imports
  let actor =
    Number.isFinite(tokenUserId) && tokenUserId > 0
      ? await prisma.user.findUnique({
          where: { id: tokenUserId },
          select: { id: true, companyId: true, isActive: true },
        })
      : null;

  if ((!actor || !actor.isActive) && auth.tokenUser.email) {
    actor = await prisma.user.findFirst({
      where: { email: auth.tokenUser.email, isActive: true },
      select: { id: true, companyId: true, isActive: true },
    });
  }

  if (!actor?.isActive) {
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
