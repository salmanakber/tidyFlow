import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { getGoogleMapsApiKey } from '@/lib/google-maps-key';
import { normalizeAddressCountryCode, DEFAULT_ADDRESS_COUNTRY } from '@/lib/address-country';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const input = searchParams.get('input')?.trim() || '';
  const countryCode =
    normalizeAddressCountryCode(searchParams.get('countryCode')) || DEFAULT_ADDRESS_COUNTRY;

  if (input.length < 3) {
    return NextResponse.json({ success: true, data: { predictions: [] } });
  }

  const apiKey = await getGoogleMapsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { success: false, message: 'Google Maps API key is not configured on the server' },
      { status: 503 }
    );
  }

  try {
    const params = new URLSearchParams({
      input,
      key: apiKey,
      components: `country:${countryCode.toLowerCase()}`,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
    );
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn('[places/autocomplete]', data.status, data.error_message);
      return NextResponse.json({
        success: false,
        message: data.error_message || `Places autocomplete failed (${data.status})`,
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      data: { predictions: data.predictions || [] },
    });
  } catch (error) {
    console.error('[places/autocomplete]', error);
    return NextResponse.json({ success: false, message: 'Places autocomplete failed' }, { status: 500 });
  }
}
