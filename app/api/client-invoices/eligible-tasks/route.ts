import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { TaskStatus, UserRole } from '@prisma/client';

const INVOICE_ELIGIBLE_STATUSES = [
  'ASSIGNED',
  'IN_PROGRESS',
  'SUBMITTED',
  'QA_REVIEW',
  'APPROVED',
  'COMPLETED',
  'ARCHIVED',
];

/** Tasks eligible for client invoicing (no active invoice). Supports period + group filters. */
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

  const q = request.nextUrl.searchParams.get('q')?.trim();
  const taskIdParam = request.nextUrl.searchParams.get('taskId');
  const fromParam = request.nextUrl.searchParams.get('from');
  const toParam = request.nextUrl.searchParams.get('to');
  const propertyIdParam = request.nextUrl.searchParams.get('propertyId');
  const groupBy = request.nextUrl.searchParams.get('groupBy'); // property | client | none

  const fromDate = fromParam ? new Date(fromParam) : null;
  const toDate = toParam ? new Date(toParam) : null;
  if (toDate) toDate.setHours(23, 59, 59, 999);

  const orFilters: any[] = [];
  if (q) {
    if (/^\d+$/.test(q)) {
      orFilters.push({ id: Number(q) });
    }
    orFilters.push(
      { title: { contains: q, mode: 'insensitive' } },
      { uniqueIdentifier: { contains: q, mode: 'insensitive' } },
      { property: { address: { contains: q, mode: 'insensitive' } } },
      { property: { clientName: { contains: q, mode: 'insensitive' } } },
      { property: { clientEmail: { contains: q, mode: 'insensitive' } } },
      { property: { clientPhone: { contains: q, mode: 'insensitive' } } }
    );
  }

  const tasks = await prisma.task.findMany({
    where: {
      companyId,
      status: { in: INVOICE_ELIGIBLE_STATUSES as TaskStatus[] },
      AND: [
        { clientInvoices: { none: { status: { not: 'void' } } } },
        { clientInvoiceLinks: { none: { invoice: { status: { not: 'void' } } } } },
      ],
      ...(taskIdParam ? { id: Number(taskIdParam) } : {}),
      ...(propertyIdParam ? { propertyId: Number(propertyIdParam) } : {}),
      ...(fromDate || toDate
        ? {
            OR: [
              {
                scheduledDate: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              },
              {
                completedAt: {
                  ...(fromDate ? { gte: fromDate } : {}),
                  ...(toDate ? { lte: toDate } : {}),
                },
              },
            ],
          }
        : {}),
      ...(orFilters.length ? { OR: orFilters } : {}),
    },
    orderBy: [{ scheduledDate: 'desc' }, { id: 'desc' }],
    take: groupBy ? 200 : 80,
    select: {
      id: true,
      title: true,
      status: true,
      completedAt: true,
      scheduledDate: true,
      uniqueIdentifier: true,
      budget: true,
      property: {
        select: {
          id: true,
          address: true,
          clientName: true,
          clientEmail: true,
          clientPhone: true,
          defaultServiceRate: true,
        },
      },
    },
  });

  if (groupBy === 'property' || groupBy === 'client') {
    const groups = new Map<
      string,
      {
        key: string;
        label: string;
        clientName: string | null;
        clientEmail: string | null;
        clientPhone: string | null;
        propertyId: number | null;
        address: string | null;
        tasks: typeof tasks;
        estimatedTotal: number;
      }
    >();

    for (const task of tasks) {
      const clientKey =
        (task.property?.clientEmail || task.property?.clientName || task.property?.address || 'unknown')
          .trim()
          .toLowerCase();
      const key =
        groupBy === 'property'
          ? `prop:${task.property?.id ?? 'none'}`
          : `client:${clientKey}`;
      const label =
        groupBy === 'property'
          ? task.property?.address || `Property #${task.property?.id}`
          : task.property?.clientName || task.property?.address || 'Client';

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label,
          clientName: task.property?.clientName || null,
          clientEmail: task.property?.clientEmail || null,
          clientPhone: task.property?.clientPhone || null,
          propertyId: task.property?.id ?? null,
          address: task.property?.address || null,
          tasks: [],
          estimatedTotal: 0,
        });
      }
      const g = groups.get(key)!;
      g.tasks.push(task);
      const rate =
        task.budget != null
          ? Number(task.budget)
          : task.property?.defaultServiceRate != null
            ? Number(task.property.defaultServiceRate)
            : 0;
      g.estimatedTotal += rate;
    }

    return NextResponse.json({
      success: true,
      data: tasks,
      groups: Array.from(groups.values()).map((g) => ({
        ...g,
        taskCount: g.tasks.length,
        taskIds: g.tasks.map((t) => t.id),
      })),
    });
  }

  return NextResponse.json({ success: true, data: tasks });
}
