import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, isManagerPlusRole } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { recalculateAndUpdatePayrollRecord, serializeLineItem } from '@/lib/payroll-rules';

/** PATCH/DELETE /api/payroll/[id]/line-items/[lineItemId] */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineItemId: string }> },
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  const { id, lineItemId } = await params;
  const payrollId = Number(id);
  const lineItemIdNum = Number(lineItemId);
  if (Number.isNaN(payrollId) || Number.isNaN(lineItemIdNum)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const record = await prisma.payrollRecord.findUnique({ where: { id: payrollId } });
  if (!record || record.companyId !== auth.tokenUser.companyId) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  if (record.status !== 'pending') {
    return NextResponse.json({ success: false, message: 'Only pending payroll can be edited' }, { status: 400 });
  }

  const existing = await prisma.payrollLineItem.findFirst({
    where: { id: lineItemIdNum, payrollRecordId: payrollId },
  });
  if (!existing) return NextResponse.json({ success: false, message: 'Line item not found' }, { status: 404 });

  if (existing.isRecurring) {
    return NextResponse.json(
      { success: false, message: 'Recurring rule snapshots cannot be edited — add a one-time adjustment instead' },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    const item = await prisma.payrollLineItem.update({
      where: { id: lineItemIdNum },
      data: {
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.type != null ? { type: String(body.type) } : {}),
        ...(body.amount != null ? { amount: Number(body.amount) } : {}),
        ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
      },
    });

    const { record: updated, lineItems } = await recalculateAndUpdatePayrollRecord(payrollId);

    return NextResponse.json({
      success: true,
      data: { lineItem: serializeLineItem(item), payroll: updated, lineItems: lineItems.map(serializeLineItem) },
    });
  } catch (error) {
    console.error('Payroll line-item PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineItemId: string }> },
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  const { id, lineItemId } = await params;
  const payrollId = Number(id);
  const lineItemIdNum = Number(lineItemId);
  if (Number.isNaN(payrollId) || Number.isNaN(lineItemIdNum)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const record = await prisma.payrollRecord.findUnique({ where: { id: payrollId } });
  if (!record || record.companyId !== auth.tokenUser.companyId) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  if (record.status !== 'pending') {
    return NextResponse.json({ success: false, message: 'Only pending payroll can be edited' }, { status: 400 });
  }

  const existing = await prisma.payrollLineItem.findFirst({
    where: { id: lineItemIdNum, payrollRecordId: payrollId },
  });
  if (!existing) return NextResponse.json({ success: false, message: 'Line item not found' }, { status: 404 });

  if (existing.isRecurring) {
    return NextResponse.json(
      { success: false, message: 'Recurring rule snapshots cannot be removed from payroll history' },
      { status: 400 },
    );
  }

  try {
    await prisma.payrollLineItem.delete({ where: { id: lineItemIdNum } });
    const { record: updated, lineItems } = await recalculateAndUpdatePayrollRecord(payrollId);
    return NextResponse.json({
      success: true,
      data: { payroll: updated, lineItems: lineItems.map(serializeLineItem) },
    });
  } catch (error) {
    console.error('Payroll line-item DELETE error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
