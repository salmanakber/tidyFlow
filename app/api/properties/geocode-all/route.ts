import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isManagerPlusRole, resolveCompanyIdAsync } from '@/lib/rbac';
import { requireActiveSubscription } from '@/lib/subscription';
import {
  countPropertiesNeedingGeocode,
  geocodeAllPropertiesForCompany,
} from '@/lib/geocoding';

/** GET /api/properties/geocode-all — preview how many properties need geocoding */
export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (!isManagerPlusRole(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const subscriptionCheck = await requireActiveSubscription(auth.tokenUser);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({ success: false, message: subscriptionCheck.message }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company scope required' }, { status: 400 });
  }

  try {
    const counts = await countPropertiesNeedingGeocode(companyId);
    return NextResponse.json({ success: true, data: counts });
  } catch (error) {
    console.error('[properties/geocode-all GET]', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/properties/geocode-all — bulk geocode properties missing lat/lng */
export async function POST(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (!isManagerPlusRole(auth.tokenUser.role)) {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const subscriptionCheck = await requireActiveSubscription(auth.tokenUser);
  if (!subscriptionCheck.allowed) {
    return NextResponse.json({ success: false, message: subscriptionCheck.message }, { status: 403 });
  }

  const companyId = await resolveCompanyIdAsync(request, auth.tokenUser);
  if (!companyId) {
    return NextResponse.json({ success: false, message: 'Company scope required' }, { status: 400 });
  }

  try {
    const result = await geocodeAllPropertiesForCompany(companyId);
    return NextResponse.json({
      success: true,
      message: `Geocoded ${result.geocoded} propert${result.geocoded === 1 ? 'y' : 'ies'}`,
      data: result,
    });
  } catch (error) {
    console.error('[properties/geocode-all POST]', error);
    return NextResponse.json({ success: false, message: 'Geocoding failed' }, { status: 500 });
  }
}
