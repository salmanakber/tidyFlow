import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope, isManagerPlusRole } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import {
  findActiveRulesForPeriod,
  ruleAppliesToPeriod,
  serializeRule,
  validateRuleInput,
} from '@/lib/payroll-rules';

async function getTargetUser(userId: number, companyId: number) {
  return prisma.user.findFirst({
    where: { id: userId, companyId, isActive: true },
    select: { id: true, companyId: true, firstName: true, lastName: true },
  });
}

/** GET/POST /api/users/[id]/payroll-rules */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

  const { id } = await params;
  const userId = Number(id);
  if (Number.isNaN(userId)) {
    return NextResponse.json({ success: false, message: 'Invalid user id' }, { status: 400 });
  }

  const user = await getTargetUser(userId, companyId);
  if (!user) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const periodStartRaw = searchParams.get('periodStart');
  const periodEndRaw = searchParams.get('periodEnd');

  try {
    let rules;
    if (periodStartRaw && periodEndRaw) {
      const periodStart = new Date(periodStartRaw);
      const periodEnd = new Date(periodEndRaw);
      rules = await findActiveRulesForPeriod(userId, companyId, periodStart, periodEnd);
    } else {
      rules = await prisma.employeePayrollRule.findMany({
        where: { userId, companyId },
        orderBy: [{ status: 'asc' }, { effectiveStart: 'desc' }, { id: 'desc' }],
      });
    }

    return NextResponse.json({
      success: true,
      data: rules.map(serializeRule),
    });
  } catch (error) {
    console.error('Payroll rules GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
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

  const companyId = requireCompanyScope(auth.tokenUser);
  if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

  const { id } = await params;
  const userId = Number(id);
  if (Number.isNaN(userId)) {
    return NextResponse.json({ success: false, message: 'Invalid user id' }, { status: 400 });
  }

  const user = await getTargetUser(userId, companyId);
  if (!user) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });

  try {
    const body = await request.json();
    const err = validateRuleInput(body);
    if (err) return NextResponse.json({ success: false, message: err }, { status: 400 });

    const rule = await prisma.employeePayrollRule.create({
      data: {
        userId,
        companyId,
        name: String(body.name).trim(),
        type: String(body.type),
        amount: Number(body.amount),
        effectiveStart: new Date(String(body.effectiveStart)),
        effectiveEnd: body.effectiveEnd ? new Date(String(body.effectiveEnd)) : null,
        status: body.status ? String(body.status) : 'active',
        description: body.description ? String(body.description) : null,
      },
    });

    return NextResponse.json({ success: true, data: serializeRule(rule) }, { status: 201 });
  } catch (error) {
    console.error('Payroll rules POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
