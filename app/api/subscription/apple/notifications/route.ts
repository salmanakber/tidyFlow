import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  appleSubscriptionId,
  decodeAppleJwsPayload,
  resolvePlanTierFromAppleProduct,
} from '@/lib/apple-iap';
import { getPlanLimits } from '@/lib/subscription';

/**
 * App Store Server Notifications V2 webhook.
 * Configure in App Store Connect → App → App Store Server Notifications
 * URL: https://api.tidyflowapp.com/api/subscription/apple/notifications
 *
 * Keeps Apple-billed company subscriptions in sync (renew / expire / refund).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const signedPayload = String(body.signedPayload || '');
    if (!signedPayload) {
      return NextResponse.json({ success: false, message: 'Missing signedPayload' }, { status: 400 });
    }

    const notification = decodeAppleJwsPayload(signedPayload);
    if (!notification) {
      return NextResponse.json({ success: false, message: 'Invalid notification payload' }, { status: 400 });
    }

    const notificationType = String(notification.notificationType || '');
    const data = (notification.data || {}) as Record<string, unknown>;
    const signedTransactionInfo = String(data.signedTransactionInfo || '');
    const tx = signedTransactionInfo ? decodeAppleJwsPayload(signedTransactionInfo) : null;

    const originalTransactionId = String(
      tx?.originalTransactionId || tx?.original_transaction_id || ''
    );
    const productId = String(tx?.productId || tx?.product_id || '');

    if (!originalTransactionId) {
      // Acknowledge so Apple does not retry forever
      return NextResponse.json({ success: true, ignored: true });
    }

    const appleSubId = appleSubscriptionId(originalTransactionId);
    const billing = await prisma.billingRecord.findFirst({
      where: { subscriptionId: appleSubId },
      orderBy: { createdAt: 'desc' },
    });

    if (!billing) {
      return NextResponse.json({ success: true, unmatched: true });
    }

    const expireTypes = new Set([
      'EXPIRED',
      'REVOKE',
      'REFUND',
      'GRACE_PERIOD_EXPIRED',
    ]);
    const activeTypes = new Set([
      'SUBSCRIBED',
      'DID_RENEW',
      'OFFER_REDEEMED',
      'DID_CHANGE_RENEWAL_STATUS',
      'DID_CHANGE_RENEWAL_PREF',
    ]);

    if (expireTypes.has(notificationType)) {
      await prisma.billingRecord.update({
        where: { id: billing.id },
        data: { status: 'canceled' },
      });
      await prisma.company.update({
        where: { id: billing.companyId },
        data: { subscriptionStatus: 'canceled', isTrialActive: false },
      });
    } else if (activeTypes.has(notificationType) || notificationType === 'DID_FAIL_TO_RENEW') {
      const tier = resolvePlanTierFromAppleProduct(productId);
      const limits = tier ? await getPlanLimits(tier) : null;
      const expiresMs =
        typeof tx?.expiresDate === 'number'
          ? tx.expiresDate
          : typeof tx?.expires_date_ms === 'string'
            ? Number(tx.expires_date_ms)
            : null;
      const nextBilling = expiresMs ? new Date(expiresMs) : undefined;

      await prisma.billingRecord.update({
        where: { id: billing.id },
        data: {
          status: notificationType === 'DID_FAIL_TO_RENEW' ? 'past_due' : 'active',
          ...(nextBilling ? { nextBillingDate: nextBilling } : {}),
          ...(limits ? { amountPaid: limits.monthlyPrice } : {}),
        },
      });

      await prisma.company.update({
        where: { id: billing.companyId },
        data: {
          subscriptionStatus:
            notificationType === 'DID_FAIL_TO_RENEW' ? 'past_due' : 'active',
          ...(tier ? { planTier: tier, basePrice: limits!.monthlyPrice } : {}),
          isTrialActive: false,
        },
      });
    }

    return NextResponse.json({ success: true, notificationType });
  } catch (error: any) {
    console.error('Apple ASN webhook error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Webhook failed' },
      { status: 500 }
    );
  }
}
