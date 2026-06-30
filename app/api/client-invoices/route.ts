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

    if (!taskId) {
      return NextResponse.json({ success: false, message: 'taskId required' }, { status: 400 });
    }

    const task = await prisma.task.findFirst({
      where: { id: Number(taskId), companyId },
      include: { property: true, company: { select: { name: true } } },
    });

    if (!task) {
      return NextResponse.json({ success: false, message: 'Task not found' }, { status: 404 });
    }

    if (!COMPLETED_STATUSES.includes(task.status)) {
      return NextResponse.json(
        { success: false, message: 'Invoice can only be created for completed or approved tasks' },
        { status: 400 }
      );
    }

    const existing = await prisma.clientInvoice.findFirst({
      where: { taskId: task.id, status: { not: 'void' } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, message: 'An invoice already exists for this task', data: { id: existing.id } },
        { status: 409 }
      );
    }

    const plan = await import('@/lib/subscription').then((m) => m.getCompanyPlan(companyId));
    const canUseAI = useAI && plan?.limits.aiInvoiceAssist;

    const requestLocale = getRequestLocale(request, body);

    const resolvedRate = resolveInvoiceRate(
      task,
      task.property,
      customAmount != null ? Number(customAmount) : undefined
    );
    try {
      assertInvoiceRate(resolvedRate);
    } catch (e: any) {
      return NextResponse.json({ success: false, message: e.message }, { status: 400 });
    }

    let lineItems: InvoiceLineItem[] =
      bodyLineItems && Array.isArray(bodyLineItems) && bodyLineItems.length > 0
        ? bodyLineItems
        : await buildLineItemsFromTask(task.id, {
            useAI: canUseAI,
            companyId,
            customAmount: customAmount ? Number(customAmount) : undefined,
            locale: requestLocale,
          });

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
      task.property.clientName ||
      'Client';
    const email = clientEmail || task.property.clientEmail || null;
    const phone = clientPhone || task.property.clientPhone || null;
    const address = clientAddress || task.property.address;

    const invoice = await prisma.clientInvoice.create({
      data: {
        companyId,
        taskId: task.id,
        propertyId: task.propertyId,
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
        notes: notes || null,
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 14 * 86400000),
        aiGenerated: !!canUseAI,
        createdById: auth.tokenUser.userId,
        status: 'draft',
      },
      include: {
        company: { select: { name: true } },
        task: { select: { title: true } },
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

    return NextResponse.json(
      {
        success: true,
        data: {
          ...updated,
          lineItems,
          aiGenerated: !!canUseAI,
          subtotal: Number(updated.subtotal),
          totalAmount: Number(updated.totalAmount),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Client invoice POST error:', error);
    return NextResponse.json({ success: false, message: 'Failed to create invoice' }, { status: 500 });
  }
}
