import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { createStripeInstance } from '@/lib/stripe';
import { getStripeSecretKey } from '@/lib/stripe-settings';

/**
 * Tokenize card details from the app's custom payment form.
 * Requires Stripe "raw card data APIs" enabled on the account (test + live).
 * https://support.stripe.com/questions/enabling-access-to-raw-card-data-apis
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!['OWNER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { cardNumber, expMonth, expYear, cvc, cardholderName, email } = body;

    const digits = String(cardNumber || '').replace(/\s+/g, '');
    const month = parseInt(String(expMonth), 10);
    let year = parseInt(String(expYear), 10);
    if (year < 100) year += 2000;

    if (!digits || digits.length < 13) {
      return NextResponse.json({ success: false, message: 'Invalid card number' }, { status: 400 });
    }
    if (!month || month < 1 || month > 12) {
      return NextResponse.json({ success: false, message: 'Invalid expiry month' }, { status: 400 });
    }
    if (!year || year < new Date().getFullYear()) {
      return NextResponse.json({ success: false, message: 'Invalid expiry year' }, { status: 400 });
    }
    if (!cvc || String(cvc).length < 3) {
      return NextResponse.json({ success: false, message: 'Invalid CVC' }, { status: 400 });
    }
    if (!cardholderName?.trim()) {
      return NextResponse.json({ success: false, message: 'Cardholder name required' }, { status: 400 });
    }

    const secretKey = await getStripeSecretKey();
    if (!secretKey) {
      return NextResponse.json(
        { success: false, message: 'Stripe secret key not configured' },
        { status: 500 }
      );
    }

    const stripe = createStripeInstance(secretKey);
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: {
        number: digits,
        exp_month: month,
        exp_year: year,
        cvc: String(cvc),
      },
      billing_details: {
        name: String(cardholderName).trim(),
        email: email ? String(email).trim() : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        paymentMethodId: paymentMethod.id,
        brand: paymentMethod.card?.brand || 'card',
        last4: paymentMethod.card?.last4 || '',
        expMonth: paymentMethod.card?.exp_month,
        expYear: paymentMethod.card?.exp_year,
      },
    });
  } catch (error: any) {
    console.error('Payment method creation error:', error);
    const raw = error?.raw?.message || error?.message || '';
    const needsRawCardApi =
      raw.includes('raw card data') ||
      raw.includes('test tokens') ||
      raw.includes('unsafe');

    const message = needsRawCardApi
      ? 'Stripe raw card API is not enabled on this account. Enable it in Stripe Dashboard (Settings → Integration → Advanced) or contact Stripe support, then retry.'
      : raw || 'Could not process card. Check details and try again.';

    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
