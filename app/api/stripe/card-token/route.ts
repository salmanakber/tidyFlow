import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { createStripeCardToken, stripeCardTokenErrorMessage } from '@/lib/stripe-card-token';

/**
 * Step 1 of checkout: mobile sends card fields → Stripe creates a secure token (PaymentMethod pm_xxx).
 * Step 2: pass paymentMethodId to POST /api/subscription/create
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
    const data = await createStripeCardToken({
      cardNumber: body.cardNumber,
      expMonth: body.expMonth,
      expYear: body.expYear,
      cvc: body.cvc,
      cardholderName: body.cardholderName,
      email: body.email,
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error('Card token creation error:', error);
    const message =
      error instanceof Error && !('raw' in (error as object))
        ? error.message
        : stripeCardTokenErrorMessage(error);

    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
