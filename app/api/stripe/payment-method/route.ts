import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';

/**
 * @deprecated Tokenize cards on the mobile client with @stripe/stripe-react-native
 * (CardField + createPaymentMethod). Stripe blocks raw card numbers on the server
 * unless raw card data APIs are explicitly enabled on the account.
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = auth.tokenUser.role as UserRole;
  if (!['OWNER', 'COMPANY_ADMIN', 'DEVELOPER', 'SUPER_ADMIN'].includes(role)) {
    return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
  }

  return NextResponse.json(
    {
      success: false,
      message:
        'Use the Stripe mobile SDK to create a payment method on the device (CardField + createPaymentMethod), then pass paymentMethodId to /api/subscription/create.',
    },
    { status: 400 }
  );
}
