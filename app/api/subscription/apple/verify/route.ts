import { NextRequest, NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth, resolveCompanyIdAsync } from '@/lib/rbac';
import { getPlanLimits } from '@/lib/subscription';
import {
  appleSubscriptionId,
  decodeAppleJwsPayload,
  resolvePlanTierFromAppleProduct,
} from '@/lib/apple-iap';

/**
 * Verify an iOS StoreKit purchase and activate the company subscription.
 * Complements Stripe (multiplatform): App Store IAP is required on iOS;
 * Stripe web remains available for accounts purchased outside the App Store.
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (
    auth.tokenUser.role !== UserRole.OWNER &&
    auth.tokenUser.role !== UserRole.COMPANY_ADMIN &&
    auth.tokenUser.role !== UserRole.DEVELOPER
  ) {
    return NextResponse.json(
      { success: false, message: 'Only the company owner or admin can activate a subscription.' },
      { status: 403 }
    );
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company required' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const productId = String(body.productId || '').trim();
  const transactionId = String(body.transactionId || '').trim();
  const originalTransactionId = String(
    body.originalTransactionId || body.transactionId || ''
  ).trim();
  const purchaseToken = String(body.purchaseToken || '').trim();
  const requestedTier = body.planTier ? String(body.planTier) : null;

  if (!productId || !originalTransactionId) {
    return NextResponse.json(
      { success: false, message: 'productId and transactionId are required.' },
      { status: 400 }
    );
  }

  const tier = resolvePlanTierFromAppleProduct(productId, requestedTier);
  if (!tier) {
    return NextResponse.json(
      { success: false, message: `Unknown App Store product: ${productId}` },
      { status: 400 }
    );
  }

  // Prefer decoding the StoreKit 2 JWS when present
  if (purchaseToken && purchaseToken.split('.').length >= 3) {
    const payload = decodeAppleJwsPayload(purchaseToken);
    if (payload) {
      const jwsProduct = String(payload.productId || payload.product_id || '');
      if (jwsProduct && jwsProduct !== productId) {
        return NextResponse.json(
          { success: false, message: 'Purchase product does not match receipt.' },
          { status: 400 }
        );
      }
      const expiresDate =
        typeof payload.expiresDate === 'number'
          ? payload.expiresDate
          : typeof payload.expires_date_ms === 'string'
            ? Number(payload.expires_date_ms)
            : null;
      if (expiresDate && expiresDate < Date.now()) {
        return NextResponse.json(
          { success: false, message: 'This App Store subscription has expired.' },
          { status: 400 }
        );
      }
    }
  }

  const limits = await getPlanLimits(tier);
  const now = new Date();
  // Prefer Apple period end from JWS when present
  let nextBilling = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
  let isAppleTrialPeriod = false;
  if (purchaseToken && purchaseToken.split('.').length >= 3) {
    const payload = decodeAppleJwsPayload(purchaseToken);
    const expiresDate =
      payload && typeof payload.expiresDate === 'number'
        ? payload.expiresDate
        : payload && typeof payload.expires_date_ms === 'string'
          ? Number(payload.expires_date_ms)
          : null;
    if (expiresDate && expiresDate > Date.now()) {
      nextBilling = new Date(expiresDate);
    }
    const offerType = payload ? String((payload as any).offerDiscountType || (payload as any).offerType || '') : '';
    isAppleTrialPeriod = /free|introductory|trial/i.test(offerType);
  }
  const appleSubId = appleSubscriptionId(originalTransactionId);

  try {
    // Prevent the same Apple subscription from unlocking multiple companies
    const existingOther = await prisma.billingRecord.findFirst({
      where: {
        subscriptionId: appleSubId,
        companyId: { not: companyId },
        status: { in: ['active', 'trialing'] },
      },
    });
    if (existingOther) {
      return NextResponse.json(
        {
          success: false,
          message:
            'This App Store subscription is already linked to another TidyFlow account. Restore purchases from that account or contact support.',
        },
        { status: 409 }
      );
    }

    let billing = await prisma.billingRecord.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    if (billing) {
      billing = await prisma.billingRecord.update({
        where: { id: billing.id },
        data: {
          subscriptionId: appleSubId,
          status: isAppleTrialPeriod ? 'trialing' : 'active',
          amountPaid: limits.monthlyPrice,
          amountDue: 0,
          billingDate: now,
          currentPeriodStart: now,
          nextBillingDate: nextBilling,
          isTrialPeriod: isAppleTrialPeriod,
          trialEndsAt: isAppleTrialPeriod ? nextBilling : null,
          propertyCount: 0,
        },
      });
    } else {
      billing = await prisma.billingRecord.create({
        data: {
          companyId,
          subscriptionId: appleSubId,
          status: isAppleTrialPeriod ? 'trialing' : 'active',
          amountPaid: limits.monthlyPrice,
          amountDue: 0,
          billingDate: now,
          currentPeriodStart: now,
          nextBillingDate: nextBilling,
          isTrialPeriod: isAppleTrialPeriod,
          trialEndsAt: isAppleTrialPeriod ? nextBilling : null,
          propertyCount: 0,
        },
      });
    }

    await prisma.company.update({
      where: { id: companyId },
      data: {
        planTier: tier,
        subscriptionStatus: isAppleTrialPeriod ? 'trialing' : 'active',
        isTrialActive: isAppleTrialPeriod,
        trialEndsAt: isAppleTrialPeriod ? nextBilling : null,
        basePrice: limits.monthlyPrice,
        pendingPlanTier: null,
        pendingPlanEffectiveAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'App Store subscription activated.',
      data: {
        planTier: tier,
        label: limits.label,
        subscriptionId: appleSubId,
        transactionId,
        billingRecordId: billing.id,
        nextBillingDate: nextBilling.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Apple IAP verify error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to activate App Store subscription' },
      { status: 500 }
    );
  }
}
