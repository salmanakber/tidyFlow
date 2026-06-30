import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { UserRole } from '@prisma/client';
import {
  getAllStripeSettingsForAdmin,
  setStripeSetting,
  STRIPE_SETTING_KEYS,
} from '@/lib/stripe-settings';
import { encryptSecret } from '@/lib/encrypt';

function isPlatformAdmin(role: any) {
  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.DEVELOPER ||
    role === UserRole.ADMIN_UNIQUE
  );
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth || !isPlatformAdmin(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const settings = await getAllStripeSettingsForAdmin();
  return NextResponse.json({ success: true, data: settings });
}

export async function PATCH(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth || !isPlatformAdmin(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  const updates: Array<{ key: string; value: string; encrypted?: boolean }> = [];

  if (body.stripe_secret_key !== undefined && body.stripe_secret_key !== '••••••••') {
    updates.push({
      key: STRIPE_SETTING_KEYS.secretKey,
      value: encryptSecret(body.stripe_secret_key),
      encrypted: true,
    });
  }
  if (body.stripe_publishable_key !== undefined) {
    updates.push({ key: STRIPE_SETTING_KEYS.publishableKey, value: body.stripe_publishable_key });
  }
  if (body.stripe_price_id_startup !== undefined) {
    updates.push({ key: STRIPE_SETTING_KEYS.priceStartup, value: body.stripe_price_id_startup });
  }
  if (body.stripe_price_id_standard !== undefined) {
    updates.push({ key: STRIPE_SETTING_KEYS.priceStandard, value: body.stripe_price_id_standard });
  }
  if (body.stripe_price_id_premium !== undefined) {
    updates.push({ key: STRIPE_SETTING_KEYS.pricePremium, value: body.stripe_price_id_premium });
  }
  if (body.stripe_base_price_id !== undefined) {
    updates.push({ key: STRIPE_SETTING_KEYS.basePriceId, value: body.stripe_base_price_id });
  }
  if (body.stripe_property_price_id !== undefined) {
    updates.push({ key: STRIPE_SETTING_KEYS.propertyPriceId, value: body.stripe_property_price_id });
  }

  for (const u of updates) {
    await setStripeSetting(u.key, u.value, { encrypted: u.encrypted });
  }

  const settings = await getAllStripeSettingsForAdmin();
  return NextResponse.json({ success: true, data: settings, message: 'Stripe settings saved' });
}
