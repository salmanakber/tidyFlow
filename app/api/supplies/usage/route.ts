import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/rbac';

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { supplyItemId, quantity = 1, taskId, notes } = body;

  const item = await prisma.supplyItem.findUnique({ where: { id: Number(supplyItemId) } });
  if (!item) return NextResponse.json({ success: false, message: 'Supply not found' }, { status: 404 });

  const usage = await prisma.supplyUsage.create({
    data: {
      supplyItemId: item.id,
      userId: auth.tokenUser.userId,
      taskId: taskId ? Number(taskId) : null,
      quantity: Number(quantity),
      notes,
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

  return NextResponse.json({ success: true, data: usage }, { status: 201 });
}
