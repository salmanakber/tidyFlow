import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { requireSupplyForecast, logAIUsage } from '@/lib/subscription';
import { buildPackingListForTask } from '@/lib/supply-forecast';

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

  const gate = await requireSupplyForecast(companyId);
  if (!gate.allowed) {
    return NextResponse.json({ success: false, message: gate.message, upgradeRequired: true }, { status: 403 });
  }

  const packingList = await buildPackingListForTask(companyId, taskId);
  if (!packingList) {
    return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
  }

  await logAIUsage(companyId, 'supply_packing_list');

  return NextResponse.json({ success: true, data: packingList });
}
