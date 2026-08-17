/**
 * Custom Next.js server — API + Socket.io on the same port (default 3000).
 *
 * IMPORTANT: /socket.io requests must NOT go through Next.js — otherwise the
 * polling/WebSocket handshake gets a 404 HTML page and mobile never connects.
 */
import { loadEnvConfig } from '@next/env';

// Must load .env BEFORE any module reads process.env.JWT_SECRET (auth.ts)
loadEnvConfig(process.cwd());

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { parse } from 'url';
import next from 'next';
import { initSocketIO } from './lib/socket-io';
import { ensurePdfFontsAvailable } from './lib/pdf-fonts';

ensurePdfFontsAvailable();

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function isSocketIoRequest(url?: string | null): boolean {
  return !!url && url.startsWith('/socket.io');
}

app.prepare().then(() => {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '';

    // Let Socket.io engine handle these — Next.js must not consume the request
    if (isSocketIoRequest(url)) {
      return;
    }

    try {
      const parsedUrl = parse(url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Request error:', err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = initSocketIO(server);
  if (!io) {
    console.error('[server] Socket.io failed to initialize');
    process.exit(1);
  }

  server.listen(port, hostname, () => {
    const jwtLoaded = !!process.env.JWT_SECRET;
    console.log(`> TidyFlow ready on http://${hostname}:${port} (REST + Socket.io)`);
    console.log(`> JWT_SECRET: ${jwtLoaded ? 'loaded from .env' : '⚠️  MISSING — socket auth will fail, set JWT_SECRET in web/.env'}`);
    console.log(`> Health: http://${hostname}:${port}/api/health`);
    console.log(`> Socket.io path: /socket.io`);
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
