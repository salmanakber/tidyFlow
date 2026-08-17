import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { requireInvoiceFeature } from '@/lib/subscription';
import {
  buildLineItemsFromTask,
  calcInvoiceTotalsForCompany,
  generateClientInvoicePDF,
  generateInvoiceNumber,
  resolveInvoiceRate,
  assertInvoiceRate,
  type InvoiceLineItem,
} from '@/lib/client-invoice';
import { getRequestLocale } from '@/lib/locale';
import { getCompanyCurrency } from '@/lib/company-config';
import { UserRole } from '@prisma/client';

const COMPLETED_STATUSES = ['SUBMITTED', 'QA_REVIEW', 'APPROVED', 'COMPLETED', 'ARCHIVED'];

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser) || auth.tokenUser.companyId;
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const taskId = request.nextUrl.searchParams.get('taskId');
  const invoices = await prisma.clientInvoice.findMany({
    where: {
      companyId,
      ...(taskId ? { taskId: Number(taskId) } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      task: { select: { id: true, title: true, status: true } },
      property: { select: { id: true, address: true } },
    },
  });

  return NextResponse.json({
    success: true,
    data: invoices.map((inv) => ({
      ...inv,
      subtotal: Number(inv.subtotal),
      taxAmount: Number(inv.taxAmount),
      totalAmount: Number(inv.totalAmount),
      taxRate: Number(inv.taxRate),
      lineItems: JSON.parse(inv.lineItems) as InvoiceLineItem[],
      quickbooksSyncStatus: inv.quickbooksSyncStatus,
      quickbooksSyncedAt: inv.quickbooksSyncedAt?.toISOString() ?? null,
      quickbooksDocNumber: inv.quickbooksDocNumber,
      quickbooksSyncError: inv.quickbooksSyncError,
    })),
  });
}

export async function POST(request: NextRequest) {
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

  const limitCheck = await requireInvoiceFeature(companyId);
  if (!limitCheck.allowed) {
    return NextResponse.json({ success: false, message: limitCheck.message }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      taskId,
      taskIds: bodyTaskIds,
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      lineItems: bodyLineItems,
      taxRate = 0,
      notes,
      dueDate,
      useAI = false,
      customAmount,
      locale,
    } = body;

    const taskIdList: number[] = Array.isArray(bodyTaskIds)
      ? bodyTaskIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0)
      : taskId
        ? [Number(taskId)]
        : [];

    if (taskIdList.length === 0) {
      return NextResponse.json({ success: false, message: 'taskId or taskIds required' }, { status: 400 });
    }

    const uniqueTaskIds = [...new Set(taskIdList)];

    const tasks = await prisma.task.findMany({
      where: { id: { in: uniqueTaskIds }, companyId },
      include: { property: true, company: { select: { name: true } } },
    });

    if (tasks.length !== uniqueTaskIds.length) {
      return NextResponse.json({ success: false, message: 'One or more tasks not found' }, { status: 404 });
    }

    for (const task of tasks) {
      if (!COMPLETED_STATUSES.includes(task.status)) {
        return NextResponse.json(
          {
            success: false,
            message: `Invoice can only be created for completed or approved tasks (task #${task.id})`,
          },
          { status: 400 }
        );
      }
    }

    const existingPrimary = await prisma.clientInvoice.findFirst({
      where: { taskId: { in: uniqueTaskIds }, status: { not: 'void' } },
    });
    if (existingPrimary) {
      return NextResponse.json(
        {
          success: false,
          message: 'An invoice already exists for one of these tasks',
          data: { id: existingPrimary.id },
        },
        { status: 409 }
      );
    }

    const existingLinked = await prisma.clientInvoiceTask.findFirst({
      where: {
        taskId: { in: uniqueTaskIds },
        invoice: { status: { not: 'void' } },
      },
      include: { invoice: { select: { id: true } } },
    });
    if (existingLinked) {
      return NextResponse.json(
        {
          success: false,
          message: 'An invoice already exists for one of these tasks',
          data: { id: existingLinked.invoice.id },
        },
        { status: 409 }
      );
    }

    // Multi-task invoices must share the same client identity (email / name / property client).
    if (uniqueTaskIds.length > 1) {
      const clientKeys = new Set(
        tasks.map((t) =>
          (t.property.clientEmail || t.property.clientName || `prop:${t.propertyId}`).trim().toLowerCase()
        )
      );
      if (clientKeys.size > 1) {
        return NextResponse.json(
          {
            success: false,
            message: 'Selected tasks belong to different clients. Group by the same client or property.',
          },
          { status: 400 }
        );
      }
    }

    const primaryTask = tasks[0];
    const plan = await import('@/lib/subscription').then((m) => m.getCompanyPlan(companyId));
    const canUseAI = useAI && plan?.limits.aiInvoiceAssist && uniqueTaskIds.length === 1;
    const requestLocale = getRequestLocale(request, body);

    let lineItems: InvoiceLineItem[] =
      bodyLineItems && Array.isArray(bodyLineItems) && bodyLineItems.length > 0
        ? bodyLineItems
        : [];

    if (lineItems.length === 0) {
      if (uniqueTaskIds.length === 1) {
        const resolvedRate = resolveInvoiceRate(
          primaryTask,
          primaryTask.property,
          customAmount != null ? Number(customAmount) : undefined
        );
        try {
          assertInvoiceRate(resolvedRate);
        } catch (e: any) {
          return NextResponse.json({ success: false, message: e.message }, { status: 400 });
        }
        lineItems = await buildLineItemsFromTask(primaryTask.id, {
          useAI: canUseAI,
          companyId,
          customAmount: customAmount ? Number(customAmount) : undefined,
          locale: requestLocale,
        });
      } else {
        for (const task of tasks) {
          try {
            const resolvedRate = resolveInvoiceRate(task, task.property, undefined);
            assertInvoiceRate(resolvedRate);
          } catch (e: any) {
            return NextResponse.json(
              { success: false, message: `${e.message} (task #${task.id})` },
              { status: 400 }
            );
          }
          const items = await buildLineItemsFromTask(task.id, {
            useAI: false,
            companyId,
            locale: requestLocale,
          });
          for (const item of items) {
            lineItems.push({
              ...item,
              description: `#${task.id} ${task.title}: ${item.description}`,
            });
          }
        }
      }
    }

    const totals = await calcInvoiceTotalsForCompany(companyId, lineItems);
    const { subtotal, taxRate: resolvedTaxRate, taxAmount, totalAmount } =
      Number(taxRate) > 0
        ? {
            subtotal: totals.subtotal,
            taxRate: Number(taxRate),
            taxAmount: Math.round(totals.subtotal * (Number(taxRate) / 100) * 100) / 100,
            totalAmount:
              Math.round((totals.subtotal + totals.subtotal * (Number(taxRate) / 100)) * 100) / 100,
          }
        : totals;
    const invoiceNumber = await generateInvoiceNumber(companyId);
    const currency = await getCompanyCurrency(companyId);

    const name =
      clientName ||
      primaryTask.property.clientName ||
      'Client';
    const email = clientEmail || primaryTask.property.clientEmail || null;
    const phone = clientPhone || primaryTask.property.clientPhone || null;
    const address = clientAddress || primaryTask.property.address;

    const invoice = await prisma.clientInvoice.create({
      data: {
        companyId,
        taskId: uniqueTaskIds.length === 1 ? primaryTask.id : primaryTask.id,
        propertyId: primaryTask.propertyId,
        invoiceNumber,
        clientName: name,
        clientEmail: email,
        clientPhone: phone,
        clientAddress: address,
        lineItems: JSON.stringify(lineItems),
        subtotal,
        taxRate: resolvedTaxRate,
        taxAmount,
        totalAmount,
        currency,
        notes:
          notes ||
          (uniqueTaskIds.length > 1
            ? `Period invoice for ${uniqueTaskIds.length} jobs (#${uniqueTaskIds.join(', #')})`
            : null),
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 14 * 86400000),
        aiGenerated: !!canUseAI,
        createdById: auth.tokenUser.userId,
        status: 'draft',
        invoiceTasks: {
          create: uniqueTaskIds.map((id) => ({ taskId: id })),
        },
      },
      include: {
        company: { select: { name: true } },
        task: { select: { title: true } },
        invoiceTasks: { select: { taskId: true } },
      },
    });

    const pdfUrl = await generateClientInvoicePDF({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      clientAddress: invoice.clientAddress,
      lineItems,
      subtotal,
      taxRate: resolvedTaxRate,
      taxAmount,
      totalAmount,
      currency,
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      company: invoice.company,
      task: invoice.task,
      companyId,
    });

    const updated = await prisma.clientInvoice.update({
      where: { id: invoice.id },
      data: { pdfUrl, status: 'draft' },
    });

    const syncToQuickbooks = body.syncToQuickbooks === true;
    if (syncToQuickbooks) {
      try {
        const { requireQuickBooksFeature } = await import('@/lib/subscription');
        const qbPlan = await requireQuickBooksFeature(companyId);
        if (qbPlan.allowed) {
          const conn = await prisma.quickBooksConnection.findUnique({ where: { companyId } });
          if (conn) {
            const { syncClientInvoiceToQuickBooks } = await import('@/lib/quickbooks');
            await syncClientInvoiceToQuickBooks(companyId, updated.id);
          }
        }
      } catch (e) {
        console.error('QuickBooks sync on create failed:', e);
      }
    }

    const finalInvoice = await prisma.clientInvoice.findUnique({
      where: { id: updated.id },
      include: { invoiceTasks: { select: { taskId: true } } },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...(finalInvoice ?? updated),
          lineItems,
          aiGenerated: !!canUseAI,
          subtotal: Number(updated.subtotal),
          totalAmount: Number(updated.totalAmount),
          taskIds: finalInvoice?.invoiceTasks?.map((l) => l.taskId) ?? uniqueTaskIds,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Client invoice POST error:', error);
    return NextResponse.json({ success: false, message: 'Failed to create invoice' }, { status: 500 });
  }
}
