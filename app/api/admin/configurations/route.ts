import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireCompanyScope } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { verifyTurnstileToken } from '@/lib/turnstile';

function isPlatformAdmin(role: UserRole) {
  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.DEVELOPER ||
    role === UserRole.ADMIN_UNIQUE
  );
}

const DEFAULT_CONFIG = {
  photoCountRequirement: 20,
  watermarkEnabled: false,
  geofenceRadius: 150,
  timezone: 'UTC',
  notificationTemplate: null as string | null,
  dataRetentionDays: 365,
  currency: 'GBP',
  subscriptionBasePrice: 55.0,
  propertyPricePerUnit: 1.0,
};

function mapConfig(config: {
  id: number;
  companyId: number;
  photoCountRequirement: number;
  watermarkEnabled: boolean;
  geofenceRadius: number;
  timezone: string;
  notificationTemplate: string | null;
  dataRetentionDays: number;
  currency: string;
  subscriptionBasePrice: unknown;
  propertyPricePerUnit: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: config.id,
    companyId: config.companyId,
    photoCountRequirement: config.photoCountRequirement,
    watermarkEnabled: config.watermarkEnabled,
    geofenceRadius: config.geofenceRadius,
    timezone: config.timezone,
    notificationTemplate: config.notificationTemplate,
    dataRetentionDays: config.dataRetentionDays,
    currency: config.currency,
    subscriptionBasePrice: Number(config.subscriptionBasePrice),
    propertyPricePerUnit: Number(config.propertyPricePerUnit),
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

// GET /api/admin/configurations - Platform defaults or single-company config
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;
  const { searchParams } = new URL(request.url);
  const companyIdParam = searchParams.get('companyId');

  try {
    // Platform admins without companyId get global defaults (template for all companies)
    if (isPlatformAdmin(role) && !companyIdParam) {
      const sample = await prisma.adminConfiguration.findFirst({
        orderBy: { updatedAt: 'desc' },
      });

      if (sample) {
        return NextResponse.json({
          success: true,
          data: {
            ...mapConfig(sample),
            companyId: null,
            applyToAllCompanies: true,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          id: null,
          companyId: null,
          applyToAllCompanies: true,
          ...DEFAULT_CONFIG,
        },
      });
    }

    let companyId: number | null = null;

    if (isPlatformAdmin(role) || role === UserRole.OWNER) {
      if (companyIdParam) {
        companyId = parseInt(companyIdParam, 10);
      } else {
        companyId = tokenUser.companyId || null;
      }
    } else {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    if (!companyId) {
      return NextResponse.json({ success: false, message: 'Company ID required' }, { status: 400 });
    }

    const config = await prisma.adminConfiguration.findUnique({
      where: { companyId },
    });

    if (!config) {
      return NextResponse.json({
        success: true,
        data: {
          id: null,
          companyId,
          ...DEFAULT_CONFIG,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: mapConfig(config),
    });
  } catch (error: unknown) {
    console.error('Error fetching configurations:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch configurations';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

// PATCH /api/admin/configurations - Update all companies (platform) or one company
export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { tokenUser } = auth;
  const role = tokenUser.role as UserRole;

  try {
    const body = await request.json();
    const {
      companyId: bodyCompanyId,
      photoCountRequirement,
      photo_count_requirement,
      watermarkEnabled,
      watermark_enabled,
      geofenceRadius,
      geofence_radius,
      timezone,
      notificationTemplate,
      notification_template,
      dataRetentionDays,
      data_retention_days,
      currency,
      subscriptionBasePrice,
      propertyPricePerUnit,
      turnstileToken,
      applyToAllCompanies,
    } = body;

    const turnstileOk = await verifyTurnstileToken(turnstileToken);
    if (!turnstileOk) {
      return NextResponse.json(
        { success: false, message: 'Security verification failed. Please try again.' },
        { status: 403 }
      );
    }

    const resolvedPhotoCount = photoCountRequirement ?? photo_count_requirement;
    const resolvedWatermark = watermarkEnabled ?? watermark_enabled;
    const resolvedGeofence = geofenceRadius ?? geofence_radius;
    const resolvedNotification = notificationTemplate ?? notification_template;
    const resolvedRetention = dataRetentionDays ?? data_retention_days;

    const updateData: Record<string, unknown> = {};
    if (resolvedPhotoCount !== undefined) updateData.photoCountRequirement = Number(resolvedPhotoCount);
    if (resolvedWatermark !== undefined) updateData.watermarkEnabled = !!resolvedWatermark;
    if (resolvedGeofence !== undefined) updateData.geofenceRadius = Number(resolvedGeofence);
    if (timezone !== undefined) updateData.timezone = String(timezone);
    if (resolvedNotification !== undefined) updateData.notificationTemplate = resolvedNotification;
    if (resolvedRetention !== undefined) updateData.dataRetentionDays = Number(resolvedRetention);
    if (currency !== undefined) updateData.currency = String(currency);
    if (subscriptionBasePrice !== undefined) updateData.subscriptionBasePrice = subscriptionBasePrice;
    if (propertyPricePerUnit !== undefined) updateData.propertyPricePerUnit = propertyPricePerUnit;

    const shouldApplyToAll =
      isPlatformAdmin(role) &&
      applyToAllCompanies !== false &&
      !bodyCompanyId;

    if (shouldApplyToAll) {
      const allCompanies = await prisma.company.findMany({ select: { id: true } });

      if (allCompanies.length === 0) {
        return NextResponse.json({ success: false, message: 'No companies found' }, { status: 400 });
      }

      const results = await prisma.$transaction(
        allCompanies.map((company) =>
          prisma.adminConfiguration.upsert({
            where: { companyId: company.id },
            create: {
              companyId: company.id,
              photoCountRequirement: (resolvedPhotoCount as number) ?? DEFAULT_CONFIG.photoCountRequirement,
              watermarkEnabled:
                resolvedWatermark !== undefined ? !!resolvedWatermark : DEFAULT_CONFIG.watermarkEnabled,
              geofenceRadius: (resolvedGeofence as number) ?? DEFAULT_CONFIG.geofenceRadius,
              timezone: (timezone as string) ?? DEFAULT_CONFIG.timezone,
              notificationTemplate: (resolvedNotification as string | null) ?? DEFAULT_CONFIG.notificationTemplate,
              dataRetentionDays: (resolvedRetention as number) ?? DEFAULT_CONFIG.dataRetentionDays,
              currency: (currency as string) ?? DEFAULT_CONFIG.currency,
              subscriptionBasePrice: subscriptionBasePrice ?? DEFAULT_CONFIG.subscriptionBasePrice,
              propertyPricePerUnit: propertyPricePerUnit ?? DEFAULT_CONFIG.propertyPricePerUnit,
            },
            update: updateData,
          })
        )
      );

      if (subscriptionBasePrice !== undefined) {
        await prisma.company.updateMany({
          data: { basePrice: subscriptionBasePrice },
        });
      }

      return NextResponse.json({
        success: true,
        message: `Configuration applied to ${results.length} companies.`,
        data: {
          ...mapConfig(results[0]),
          companyId: null,
          applyToAllCompanies: true,
          companiesUpdated: results.length,
        },
      });
    }

    let companyId: number | null = null;

    if (isPlatformAdmin(role) || role === UserRole.OWNER) {
      companyId = bodyCompanyId || tokenUser.companyId || null;
    } else {
      companyId = requireCompanyScope(tokenUser);
      if (!companyId) {
        return NextResponse.json({ success: false, message: 'No company scope' }, { status: 403 });
      }
    }

    if (!companyId) {
      return NextResponse.json({ success: false, message: 'Company ID required' }, { status: 400 });
    }

    const config = await prisma.adminConfiguration.upsert({
      where: { companyId },
      create: {
        companyId,
        photoCountRequirement: (resolvedPhotoCount as number) ?? DEFAULT_CONFIG.photoCountRequirement,
        watermarkEnabled:
          resolvedWatermark !== undefined ? !!resolvedWatermark : DEFAULT_CONFIG.watermarkEnabled,
        geofenceRadius: (resolvedGeofence as number) ?? DEFAULT_CONFIG.geofenceRadius,
        timezone: (timezone as string) ?? DEFAULT_CONFIG.timezone,
        notificationTemplate: (resolvedNotification as string | null) ?? DEFAULT_CONFIG.notificationTemplate,
        dataRetentionDays: (resolvedRetention as number) ?? DEFAULT_CONFIG.dataRetentionDays,
        currency: (currency as string) ?? DEFAULT_CONFIG.currency,
        subscriptionBasePrice: subscriptionBasePrice ?? DEFAULT_CONFIG.subscriptionBasePrice,
        propertyPricePerUnit: propertyPricePerUnit ?? DEFAULT_CONFIG.propertyPricePerUnit,
      },
      update: updateData,
    });

    if (subscriptionBasePrice !== undefined) {
      await prisma.company.update({
        where: { id: companyId },
        data: { basePrice: subscriptionBasePrice },
      });
    }

    return NextResponse.json({
      success: true,
      data: mapConfig(config),
    });
  } catch (error: unknown) {
    console.error('Error updating configurations:', error);
    const message = error instanceof Error ? error.message : 'Failed to update configurations';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
