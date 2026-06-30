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

/** Tasks eligible for client invoicing (no active invoice). Active + completed by default. */
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
      clientInvoices: { none: { status: { not: 'void' } } },
      ...(taskIdParam ? { id: Number(taskIdParam) } : {}),
      ...(orFilters.length ? { OR: orFilters } : {}),
    },
    orderBy: [{ scheduledDate: 'desc' }, { id: 'desc' }],
    take: 80,
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

  return NextResponse.json({ success: true, data: tasks });
}
