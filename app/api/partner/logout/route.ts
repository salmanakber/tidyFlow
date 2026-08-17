import { NextResponse } from 'next/server';

/** POST /api/partner/logout */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('partnerAuthToken', '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}
