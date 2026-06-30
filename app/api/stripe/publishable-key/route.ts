import { NextRequest, NextResponse } from 'next/server';
import { getStripePublishableKey } from '@/lib/stripe-settings';

/** Public Stripe publishable key for mobile Payment Sheet / client SDK. */
export async function GET(_request: NextRequest) {
  try {
    const publishableKey = await getStripePublishableKey();
    if (!publishableKey) {
      return NextResponse.json(
        { success: false, message: 'Stripe publishable key not configured' },
        { status: 503 }
      );
    }
    return NextResponse.json({ success: true, data: { publishableKey } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to load Stripe key' },
      { status: 500 }
    );
  }
}
