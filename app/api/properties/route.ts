import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { requireActiveSubscription, checkPlanLimit } from '@/lib/subscription';
import { UserRole } from '@prisma/client';

// GET /api/properties
// List properties. Owner/Developer see all; others see only their company
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  
  if (!(role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN || role === UserRole.CLEANER)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  // Check if user has active subscription/trial (except for super admins and owners)
  const subscriptionCheck = await requireActiveSubscription(tokenUser);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({ 
      success: false, 
      message: subscriptionCheck.message || 'Subscription required' 
    }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const companyIdParam = searchParams.get('companyId');

  const where: any = {};
  if (q) {
    where.OR = [
      { address: { contains: q, mode: 'insensitive' } },
      { postcode: { contains: q, mode: 'insensitive' } },
    ];
  }

  try {
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const skip = (page - 1) * limit;

    const propertyInclude = {
      company: {
        select: {
          id: true,
          name: true,
        },
      },
    };

    if (role === UserRole.OWNER || role === UserRole.MANAGER || role === UserRole.SUPER_ADMIN || role === UserRole.CLEANER) {
      // Allow companyId from query param for SUPER_ADMIN to view different companies
      if (companyIdParam) {
        where.companyId = parseInt(companyIdParam);
      }
      else {
        where.companyId = tokenUser.companyId;
      }
      const [properties, total] = await Promise.all([
        prisma.property.findMany({ 
          where,
          skip,
          take: limit,
          include: propertyInclude,
          orderBy: { id: 'asc' } 
        }),
        prisma.property.count({ where }),
      ]);
      return NextResponse.json({
        success: true,
        data: { properties },
        pagination: { page, limit, total, hasMore: skip + properties.length < total },
      });
    }

    const companyId = requireCompanyScope(tokenUser);
    if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where: { ...where, companyId },
        skip,
        take: limit,
        include: propertyInclude,
        orderBy: { id: 'asc' },
      }),
      prisma.property.count({ where: { ...where, companyId } }),
    ]);

    return NextResponse.json({
      success: true,
      data: { properties },
      pagination: { page, limit, total, hasMore: skip + properties.length < total },
    });
  } catch (error) {
    console.error('Properties GET error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/properties
// Create property. Company Admin/Manager can create within their company. Owner/Developer can create anywhere.
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  // Check permission for creating properties
  const { requirePermission, PERMISSIONS } = await import('@/lib/permissions');
  const permissionCheck = await requirePermission(request, PERMISSIONS.PROPERTIES_CREATE);
  if (!permissionCheck.allowed) {
    // Allow OWNER, DEVELOPER, and SUPER_ADMIN to bypass permission check (they have implicit access)
    if (role !== UserRole.OWNER && role !== UserRole.DEVELOPER && role !== UserRole.SUPER_ADMIN) {
      return NextResponse.json(
        { success: false, message: permissionCheck.message },
        { status: 403 }
      );
    }
  }

  const subscriptionCheck = await requireActiveSubscription(tokenUser);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({ success: false, message: subscriptionCheck.message }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { 
      address, 
      postcode, 
      latitude, 
      longitude, 
      propertyType, 
      notes, 
      companyId: bodyCompanyId,
      unitCount,
      pricePerUnit,
      googleSheetUrl,
      clientName,
      clientEmail,
      clientPhone,
      defaultServiceRate,
    } = body;

    if (!address || !propertyType) {
      return NextResponse.json({ success: false, message: 'Address and propertyType are required' }, { status: 400 });
    }

    let companyId: number | null = null;

    if (role === UserRole.OWNER || role === UserRole.DEVELOPER || role === UserRole.SUPER_ADMIN) {
      console.log('bodyCompanyId', body);
      companyId = bodyCompanyId ?? null;
      if (!companyId) return NextResponse.json({ success: false, message: 'companyId is required' }, { status: 400 });
    } else {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
    }

    const propertyLimit = await checkPlanLimit(companyId, 'properties');
    if (!propertyLimit.allowed) {
      return NextResponse.json({ success: false, message: propertyLimit.message }, { status: 403 });
    }

    // Get default price per unit from admin configuration
    let defaultPricePerUnit = 1.00;
    if (!pricePerUnit) {
      const adminConfig = await prisma.adminConfiguration.findUnique({
        where: { companyId },
      });
      // @ts-ignore - Field exists in schema but types may not be updated
      if (adminConfig && adminConfig.propertyPricePerUnit) {
        // @ts-ignore
        defaultPricePerUnit = Number(adminConfig.propertyPricePerUnit);
      }
    }

    const finalPricePerUnit = pricePerUnit ? Number(pricePerUnit) : defaultPricePerUnit;
    const finalUnitCount = unitCount ? Number(unitCount) : 1;
    const totalPrice = finalPricePerUnit * finalUnitCount;

    const property = await prisma.property.create({
      data: {
        companyId,
        address,
        postcode,
        latitude: latitude !== undefined ? Number(latitude) : undefined,
        longitude: longitude !== undefined ? Number(longitude) : undefined,
        propertyType,
        // @ts-ignore - Fields exist in schema but types may not be updated
        unitCount: finalUnitCount,
        // @ts-ignore
        pricePerUnit: finalPricePerUnit,
        // @ts-ignore
        totalPrice,
        notes,
        // @ts-ignore
        googleSheetUrl: googleSheetUrl || null,
        clientName: clientName || null,
        clientEmail: clientEmail || null,
        clientPhone: clientPhone || null,
        defaultServiceRate: defaultServiceRate ? Number(defaultServiceRate) : null,
      },
    });

    // Update company property count and sync with Stripe billing
    // Count should be sum of unitCount (each unit counts as a property)
    const allProperties = await prisma.property.findMany({
      where: { companyId },
      select: { unitCount: true },
    });
    
    const propertyCount = allProperties.reduce((sum, prop) => {
      // @ts-ignore - Field exists in schema but types may not be updated
      return sum + (prop.unitCount || 1);
    }, 0);
    
    await prisma.company.update({
      where: { id: companyId },
      data: { propertyCount },
    });

    // Track property count for reporting (billing is flat per plan tier, not per property)
    try {
      const billingRecord = await prisma.billingRecord.findFirst({
        where: { companyId, status: { in: ['active', 'trialing'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (billingRecord) {
        await prisma.billingRecord.update({
          where: { id: billingRecord.id },
          data: { propertyCount },
        });
      }
    } catch (error) {
      console.warn('Failed to update billing property count:', error);
    }

    return NextResponse.json({ success: true, data: { property } }, { status: 201 });
  } catch (error) {
    console.error('Properties POST error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
