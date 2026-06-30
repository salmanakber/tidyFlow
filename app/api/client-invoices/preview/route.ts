import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { buildLineItemsFromTask, calcInvoiceTotalsForCompany, resolveInvoiceRate, assertInvoiceRate } from '@/lib/client-invoice';
import { getRequestLocale } from '@/lib/locale';
import { UserRole } from '@prisma/client';

/** Preview invoice line items and totals before creating. */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const taskId = Number(request.nextUrl.searchParams.get('taskId'));
  const useAI = request.nextUrl.searchParams.get('useAI') === 'true';
  const customAmount = request.nextUrl.searchParams.get('customAmount');

  if (!taskId) {
    return NextResponse.json({ success: false, message: 'taskId required' }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, companyId },
    include: { property: true },
  });
  if (!task) {
    return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
  }

  const plan = await import('@/lib/subscription').then((m) => m.getCompanyPlan(companyId));
  const canUseAI = useAI && plan?.limits.aiInvoiceAssist;

  const rate = resolveInvoiceRate(
    task,
    task.property,
    customAmount ? Number(customAmount) : undefined
  );
  try {
    assertInvoiceRate(rate);
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 400 });
  }

  const lineItems = await buildLineItemsFromTask(task.id, {
    useAI: canUseAI,
    companyId,
    customAmount: customAmount ? Number(customAmount) : undefined,
    locale: getRequestLocale(request),
  });

  const totals = await calcInvoiceTotalsForCompany(companyId, lineItems);

  return NextResponse.json({
    success: true,
    data: {
      lineItems,
      ...totals,
      aiGenerated: !!canUseAI,
      taskTitle: task.title,
      propertyAddress: task.property.address,
      clientName: task.property.clientName,
    },
  });
}
