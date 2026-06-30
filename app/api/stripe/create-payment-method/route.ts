import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';

/** @deprecated Use client-side createPaymentMethod from @stripe/stripe-react-native */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  return NextResponse.json(
    {
      success: false,
      message:
        'Server-side card tokenization is disabled. Use Stripe CardField + createPaymentMethod on the mobile client.',
    },
    { status: 400 }
  );
}
