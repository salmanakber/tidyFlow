import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isManagerPlusRole } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import {
  recalculateAndUpdatePayrollRecord,
  serializeLineItem,
} from '@/lib/payroll-rules';

async function getEditablePayroll(payrollId: number, tokenUser: { userId: number; companyId?: number | null; role: string }) {
  const record = await prisma.payrollRecord.findUnique({
    where: { id: payrollId },
    include: { lineItems: { orderBy: { id: 'asc' } } },
  });
  if (!record) return null;

  const isCompany =
    record.companyId === tokenUser.companyId ||
    ['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(tokenUser.role);

  if (!isCompany) return null;
  return record;
}

/** GET/POST /api/payroll/[id]/line-items */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const payrollId = Number(id);
  if (Number.isNaN(payrollId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const record = await prisma.payrollRecord.findUnique({
    where: { id: payrollId },
    include: { lineItems: { orderBy: { id: 'asc' } } },
  });
  if (!record) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const isOwn = record.userId === auth.tokenUser.userId;
  const isCompany =
    record.companyId === auth.tokenUser.companyId ||
    ['OWNER', 'MANAGER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(auth.tokenUser.role);
  if (!isOwn && !isCompany) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    data: record.lineItems.map(serializeLineItem),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  const { id } = await params;
  const payrollId = Number(id);
  if (Number.isNaN(payrollId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const record = await getEditablePayroll(payrollId, auth.tokenUser);
  if (!record) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  if (record.status !== 'pending') {
    return NextResponse.json(
      { success: false, message: 'Only pending payroll records can be edited' },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    if (!body.name || !body.type || body.amount == null) {
      return NextResponse.json({ success: false, message: 'name, type, and amount are required' }, { status: 400 });
    }
    if (body.type !== 'allowance' && body.type !== 'deduction') {
      return NextResponse.json({ success: false, message: 'type must be allowance or deduction' }, { status: 400 });
    }
    const amount = Number(body.amount);
    if (!amount || amount <= 0 || Number.isNaN(amount)) {
      return NextResponse.json({ success: false, message: 'amount must be positive' }, { status: 400 });
    }

    const item = await prisma.payrollLineItem.create({
      data: {
        payrollRecordId: payrollId,
        sourceRuleId: null,
        name: String(body.name).trim(),
        type: String(body.type),
        amount,
        isRecurring: false,
        description: body.description ? String(body.description) : null,
      },
    });

    const { record: updated, lineItems } = await recalculateAndUpdatePayrollRecord(payrollId);

    return NextResponse.json({
      success: true,
      data: {
        lineItem: serializeLineItem(item),
        payroll: updated,
        lineItems: lineItems.map(serializeLineItem),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Payroll line-items POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
