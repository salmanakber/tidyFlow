import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { getCompanyPlan } from '@/lib/subscription';

// GET /api/subscription/pricing - Plan-based flat monthly pricing + usage vs limits
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    let companyId: number | null = null;

    if (role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN) {
      companyId = tokenUser.companyId || null;
    } else {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    if (!companyId) {
      return NextResponse.json({ success: false, message: 'Company ID required' }, { status: 400 });
    }

    const plan = await getCompanyPlan(companyId);
    if (!plan) {
      return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });
    }

    const { company, limits } = plan;

    const [propertyCount, cleanerCount, managerCount] = await Promise.all([
      prisma.property.count({ where: { companyId, isActive: true } }),
      prisma.user.count({ where: { companyId, role: 'CLEANER', isActive: true } }),
      prisma.user.count({
        where: { companyId, role: { in: ['MANAGER', 'COMPANY_ADMIN'] }, isActive: true },
      }),
    ]);

    const adminConfig = await prisma.adminConfiguration.findUnique({
      where: { companyId },
      select: { currency: true },
    });
    const currency = adminConfig?.currency || 'GBP';
    const monthlyPrice = limits.monthlyPrice;

    return NextResponse.json({
      success: true,
      data: {
        company: {
          id: company.id,
          name: company.name,
          planTier: company.planTier,
        },
        limits,
        usage: {
          properties: propertyCount,
          cleaners: cleanerCount,
          managers: managerCount,
        },
        pricing: {
          planTier: limits.tier,
          planLabel: limits.label,
          monthlyPrice,
          currency,
          maxProperties: limits.maxProperties,
          propertiesRemaining: Math.max(0, limits.maxProperties - propertyCount),
          atPropertyLimit: propertyCount >= limits.maxProperties,
          // Legacy fields for older mobile builds
          basePrice: monthlyPrice,
          pricePerUnit: 0,
          propertyCount,
          propertyFee: 0,
          totalAmount: monthlyPrice,
        },
      },
    });
  } catch (error: any) {
    console.error('Error fetching pricing:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch pricing' },
      { status: 500 }
    );
  }
}
