import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope, isManagerPlusRole } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { serializeRule, validateRuleInput } from '@/lib/payroll-rules';

/** PATCH/DELETE /api/users/[id]/payroll-rules/[ruleId] */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> },
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

  const { id, ruleId } = await params;
  const userId = Number(id);
  const ruleIdNum = Number(ruleId);
  if (Number.isNaN(userId) || Number.isNaN(ruleIdNum)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const existing = await prisma.employeePayrollRule.findFirst({
    where: { id: ruleIdNum, userId, companyId },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Rule not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const merged = {
      name: body.name ?? existing.name,
      type: body.type ?? existing.type,
      amount: body.amount ?? Number(existing.amount),
      effectiveStart: body.effectiveStart ?? existing.effectiveStart.toISOString(),
      effectiveEnd: body.effectiveEnd !== undefined ? body.effectiveEnd : existing.effectiveEnd?.toISOString() ?? null,
      status: body.status ?? existing.status,
      description: body.description !== undefined ? body.description : existing.description,
    };
    const err = validateRuleInput(merged);
    if (err) return NextResponse.json({ success: false, message: err }, { status: 400 });

    const rule = await prisma.employeePayrollRule.update({
      where: { id: ruleIdNum },
      data: {
        name: String(merged.name).trim(),
        type: String(merged.type),
        amount: Number(merged.amount),
        effectiveStart: new Date(String(merged.effectiveStart)),
        effectiveEnd: merged.effectiveEnd ? new Date(String(merged.effectiveEnd)) : null,
        status: String(merged.status),
        description: merged.description ? String(merged.description) : null,
      },
    });

    return NextResponse.json({ success: true, data: serializeRule(rule) });
  } catch (error) {
    console.error('Payroll rule PATCH error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> },
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!isManagerPlusRole(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

  const { id, ruleId } = await params;
  const userId = Number(id);
  const ruleIdNum = Number(ruleId);
  if (Number.isNaN(userId) || Number.isNaN(ruleIdNum)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const existing = await prisma.employeePayrollRule.findFirst({
    where: { id: ruleIdNum, userId, companyId },
  });
  if (!existing) {
    return NextResponse.json({ success: false, message: 'Rule not found' }, { status: 404 });
  }

  try {
    await prisma.employeePayrollRule.delete({ where: { id: ruleIdNum } });
    return NextResponse.json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    console.error('Payroll rule DELETE error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
