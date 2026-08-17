import { NextResponse } from 'next/server';

/**
 * POST /api/auth/clear-admin-session
 * Clears the HTTP-only admin authToken cookie without touching customer local sessions.
 * Used by the standalone customer portal so /admin stays locked.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('authToken', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.delete('authToken');
  return response;
}
