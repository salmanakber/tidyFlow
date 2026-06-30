import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getUserFromRequest, getJwtVerifyError } from '@/lib/auth';
import { getSocketConnectionStats, isBroadcastBound, isCustomServerRunning } from '@/lib/socket-io';

/**
 * GET /api/socket-test
 * Diagnose socket auth — same JWT check the socket middleware uses.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const tokenUser = getUserFromRequest(request);
  const decoded = bearer ? verifyToken(bearer, { quiet: true }) : null;
  const verifyError = bearer && !decoded ? getJwtVerifyError(bearer) : null;

  const stats = getSocketConnectionStats();

  return NextResponse.json({
    success: true,
    data: {
      socketReady: isCustomServerRunning() && isBroadcastBound(),
      jwtSecretConfigured: !!process.env.JWT_SECRET,
      tokenPresent: !!bearer,
      tokenValid: !!decoded,
      verifyError,
      userId: decoded?.userId ?? tokenUser?.userId ?? null,
      companyId: decoded?.companyId ?? tokenUser?.companyId ?? null,
      role: decoded?.role ?? tokenUser?.role ?? null,
      connectedClients: stats.connected,
      staffOnline: stats.staffOnline,
      hint: !bearer
        ? 'No Authorization header — mobile must send Bearer token'
        : !decoded
          ? verifyError === 'invalid signature'
            ? 'JWT signature mismatch — restart server with: cd web && npm run dev (must load JWT_SECRET from .env)'
            : `Token invalid (${verifyError || 'unknown'}) — log out and log in again`
          : !isCustomServerRunning()
            ? 'Run: cd web && npm run dev'
            : undefined,
    },
  });
}
