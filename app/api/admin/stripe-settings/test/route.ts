import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import { validateStripeConfigForAdmin, mapStripeError } from '@/lib/stripe-checkout';
import { stripeKeyMode } from '@/lib/stripe-checkout';
import { getStripeSecretKey } from '@/lib/stripe-settings';

function isPlatformAdmin(role: any) {
  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.DEVELOPER ||
    role === UserRole.ADMIN_UNIQUE
  );
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth || !isPlatformAdmin(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = await validateStripeConfigForAdmin();
    return NextResponse.json({
      success: true,
      data,
      message: data.mixedMode
        ? 'Secret key mode does not match one or more Price IDs.'
        : `Stripe ${data.mode} keys look consistent.`,
    });
  } catch (error) {
    const mapped = mapStripeError(error);
    const secret = await getStripeSecretKey().catch(() => '');
    return NextResponse.json(
      {
        success: false,
        message: mapped.message,
        data: { mode: secret ? stripeKeyMode(secret) : 'unknown' },
      },
      { status: mapped.status }
    );
  }
}
