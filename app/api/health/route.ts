import { NextResponse } from 'next/server';
import { getSocketIO, getSocketConnectionStats, isCustomServerRunning, isBroadcastBound } from '@/lib/socket-io';

export async function GET() {
  const io = getSocketIO();
  const customServer = isCustomServerRunning();
  const stats = getSocketConnectionStats();

  return NextResponse.json({
    success: true,
    data: {
      ok: true,
      ts: Date.now(),
      socket: io ? 'initialized' : 'not_initialized',
      customServer,
      broadcastBound: isBroadcastBound(),
      connectedClients: stats.connected,
      companyRooms: stats.companyRooms,
      staffOnline: stats.staffOnline,
      hint: !io
        ? customServer
          ? 'Socket module loaded but instance missing — restart with: cd web && npm run dev'
          : 'Start with custom server: cd web && npm run dev (do NOT use next dev)'
        : stats.connected === 0
          ? 'No mobile clients connected — log in on owner/cleaner app and check Metro for [socket] connected'
          : undefined,
    },
  });
}
