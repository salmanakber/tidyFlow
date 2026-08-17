import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { getGoogleMapsApiKey } from '@/lib/google-maps-key';

export async function GET(request: NextRequest) {
  const auth = requireAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('placeId')?.trim();
  if (!placeId) {
    return NextResponse.json({ success: false, message: 'placeId is required' }, { status: 400 });
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
      place_id: placeId,
      fields: 'geometry,address_components,formatted_address',
      key: apiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
    );
    const data = await response.json();

    if (data.status !== 'OK' || !data.result) {
      console.warn('[places/details]', data.status, data.error_message);
      return NextResponse.json({
        success: false,
        message: data.error_message || 'Place details not found',
      }, { status: 404 });
    }

    const result = data.result;
    let postcode: string | null = null;
    if (result.address_components) {
      const pc = result.address_components.find((c: { types: string[] }) =>
        c.types.includes('postal_code')
      );
      postcode = pc?.long_name || null;
    }

    return NextResponse.json({
      success: true,
      data: {
        formattedAddress: result.formatted_address || null,
        latitude: result.geometry?.location?.lat ?? null,
        longitude: result.geometry?.location?.lng ?? null,
        postcode,
      },
    });
  } catch (error) {
    console.error('[places/details]', error);
    return NextResponse.json({ success: false, message: 'Place details failed' }, { status: 500 });
  }
}
