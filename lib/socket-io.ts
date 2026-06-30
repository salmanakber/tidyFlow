import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifyToken, getJwtVerifyError } from './auth';
import prisma from './prisma';
import type { RealtimeEvent } from './realtime';

import type { CleanerLocationRecord } from './cleaner-tracking';

const CORS_ORIGIN = process.env.REALTIME_CORS_ORIGIN || '*';

type SocketGlobal = typeof globalThis & {
  __tidyflowSocketIO?: SocketIOServer | null;
  __tidyflowCustomServer?: boolean;
  __tidyflowUserSockets?: Map<number, Set<string>>;
  __tidyflowSocketUsers?: Map<string, number>;
  __tidyflowUserCompanyMap?: Map<number, number>;
  /** Bound to the real server io instance — API webpack bundles must call this. */
  __tidyflowBroadcast?: (event: RealtimeEvent) => void;
  __tidyflowBroadcastCleaner?: (record: CleanerLocationRecord) => void;
};

const socketGlobal = globalThis as SocketGlobal;

function userSockets(): Map<number, Set<string>> {
  if (!socketGlobal.__tidyflowUserSockets) {
    socketGlobal.__tidyflowUserSockets = new Map();
  }
  return socketGlobal.__tidyflowUserSockets;
}

function socketUsers(): Map<string, number> {
  if (!socketGlobal.__tidyflowSocketUsers) {
    socketGlobal.__tidyflowSocketUsers = new Map();
  }
  return socketGlobal.__tidyflowSocketUsers;
}

function userCompanyMap(): Map<number, number> {
  if (!socketGlobal.__tidyflowUserCompanyMap) {
    socketGlobal.__tidyflowUserCompanyMap = new Map();
  }
  return socketGlobal.__tidyflowUserCompanyMap;
}

let io: SocketIOServer | null = socketGlobal.__tidyflowSocketIO ?? null;

function activeIo(): SocketIOServer | null {
  return socketGlobal.__tidyflowSocketIO ?? io;
}

function setActiveIo(instance: SocketIOServer | null) {
  io = instance;
  socketGlobal.__tidyflowSocketIO = instance;
}

function trackUserSocket(userId: number, socketId: string) {
  const sockets = userSockets();
  const users = socketUsers();
  if (!sockets.has(userId)) sockets.set(userId, new Set());
  sockets.get(userId)!.add(socketId);
  users.set(socketId, userId);
}

function untrackSocket(socketId: string) {
  const sockets = userSockets();
  const users = socketUsers();
  const companies = userCompanyMap();
  const userId = users.get(socketId);
  if (userId != null) {
    sockets.get(userId)?.delete(socketId);
    if (sockets.get(userId)?.size === 0) {
      sockets.delete(userId);
      companies.delete(userId);
    }
  }
  users.delete(socketId);
}

/** Resolve company for any role — userId differs per person but companyId links owner/manager/cleaner. */
async function resolveSocketCompanyId(
  userId: number,
  hints?: { tokenCompanyId?: number; requestedCompanyId?: number }
): Promise<number | null> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });

  // DB is source of truth — owner, manager, and cleaner share companyId, not userId
  if (dbUser?.companyId) return dbUser.companyId;

  return hints?.tokenCompanyId ?? hints?.requestedCompanyId ?? null;
}

function collectCompanySocketIds(io: SocketIOServer, companyId: number): Set<string> {
  const ids = new Set<string>();
  const room = `company:${companyId}`;
  const sockets = userSockets();
  const companies = userCompanyMap();

  try {
    io.sockets?.adapter?.rooms?.get(room)?.forEach((sid) => ids.add(sid));
  } catch {
    // adapter may be unavailable in webpack bundle — io.to(room) still works
  }

  companies.forEach((cid, uid) => {
    if (cid !== companyId) return;
    sockets.get(uid)?.forEach((sid) => ids.add(sid));
  });

  return ids;
}

function deliverToSockets(
  io: SocketIOServer,
  socketIds: Set<string>,
  event: RealtimeEvent,
  data: Record<string, unknown>
): void {
  for (const sid of Array.from(socketIds)) {
    io.to(sid).emit(event.type, data);
    io.to(sid).emit('realtime', data);
  }
}

function runBroadcast(ioInstance: SocketIOServer, event: RealtimeEvent): void {
  const data = {
    ...event,
    ...(event.payload || {}),
    at: new Date().toISOString(),
  };

  if (event.userId) {
    const sockets = userSockets().get(event.userId);
    if (sockets) {
      deliverToSockets(ioInstance, sockets, event, data);
    }
  }

  if (event.taskId && event.companyId) {
    const taskRoom = `task:${event.companyId}:${event.taskId}`;
    ioInstance.to(taskRoom).emit(event.type, data);
    ioInstance.to(taskRoom).emit('realtime', data);
  }

  if (event.companyId) {
    const companyId = Number(event.companyId);
    const room = `company:${companyId}`;

    ioInstance.to(room).emit(event.type, data);
    ioInstance.to(room).emit('realtime', data);

    if (process.env.NODE_ENV !== 'production') {
      const roomSize = ioInstance.sockets.adapter.rooms.get(room)?.size ?? 0;
      const companies = userCompanyMap();
      const staffOnline = Array.from(companies.entries())
        .filter(([, cid]) => cid === companyId)
        .map(([uid]) => uid);
      const engineCount = ioInstance.engine.clientsCount;
      console.log(
        '[socket] broadcast',
        event.type,
        '→',
        room,
        `(${roomSize} in room, ${engineCount} total connected, staff: [${staffOnline.join(',')}])`
      );
    }
  }
}

function bindBroadcastHandlers(ioInstance: SocketIOServer): void {
  socketGlobal.__tidyflowBroadcast = (event) => {
    try {
      runBroadcast(ioInstance, event);
    } catch (err) {
      console.error('[socket] broadcast failed:', event.type, err);
    }
  };

  socketGlobal.__tidyflowBroadcastCleaner = (record) => {
    try {
      const data = {
        type: 'cleaner:location',
        companyId: record.companyId,
        payload: record,
        at: new Date().toISOString(),
      };
      const room = `company:${record.companyId}`;
      ioInstance.to(room).emit('cleaner:location', data);
      ioInstance.to(room).emit('realtime', data);
    } catch (err) {
      console.error('[socket] cleaner location broadcast failed:', err);
    }
  };
}

/** Broadcast via the custom-server io instance (safe from Next.js API webpack bundles). */
export function broadcastRealtimeEvent(event: RealtimeEvent): void {
  const fn = socketGlobal.__tidyflowBroadcast;
  if (fn) {
    fn(event);
    return;
  }

  const socket = activeIo();
  if (!socket) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[socket] not initialized — skipped', event.type);
    }
    return;
  }

  try {
    runBroadcast(socket, event);
  } catch (err) {
    console.error('[socket] broadcast failed:', event.type, err);
  }
}

export function broadcastCleanerLocation(record: CleanerLocationRecord): void {
  const fn = socketGlobal.__tidyflowBroadcastCleaner;
  if (fn) {
    fn(record);
    return;
  }
  const socket = activeIo();
  if (!socket) return;
  try {
    const data = {
      type: 'cleaner:location',
      companyId: record.companyId,
      payload: record,
      at: new Date().toISOString(),
    };
    const room = `company:${record.companyId}`;
    socket.to(room).emit('cleaner:location', data);
    socket.to(room).emit('realtime', data);
  } catch (err) {
    console.error('[socket] cleaner location broadcast failed:', err);
  }
}

export function getSocketIO(): SocketIOServer | null {
  return activeIo();
}

export function getSocketConnectionStats(): {
  connected: number;
  companyRooms: Record<string, number>;
  staffOnline: Record<string, number[]>;
} {
  const socket = activeIo();
  if (!socket) return { connected: 0, companyRooms: {}, staffOnline: {} };

  const companyRooms: Record<string, number> = {};
  const staffOnline: Record<string, number[]> = {};

  try {
    const rooms = socket.sockets?.adapter?.rooms;
    rooms?.forEach((members, room) => {
      if (room.startsWith('company:')) {
        companyRooms[room] = members.size;
      }
    });
  } catch {
    // ignore adapter read errors in webpack bundle
  }

  userCompanyMap().forEach((companyId, userId) => {
    const key = `company:${companyId}`;
    if (!staffOnline[key]) staffOnline[key] = [];
    staffOnline[key].push(userId);
  });

  return {
    connected: socket.engine?.clientsCount ?? 0,
    companyRooms,
    staffOnline,
  };
}

export function isCustomServerRunning(): boolean {
  return socketGlobal.__tidyflowCustomServer === true;
}

export function isBroadcastBound(): boolean {
  return typeof socketGlobal.__tidyflowBroadcast === 'function';
}

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  socketGlobal.__tidyflowCustomServer = true;

  const existing = activeIo();
  if (existing) {
    bindBroadcastHandlers(existing);
    return existing;
  }

  const instance = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    addTrailingSlash: false,
  });

  setActiveIo(instance);
  bindBroadcastHandlers(instance);

  instance.engine.on('connection_error', (err: Error & { code?: string; context?: unknown }) => {
    console.warn('[socket] engine connection_error', err.code, err.message);
  });

  instance.engine.on('initial_headers', (headers, req) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[socket] handshake initial_headers', req.method, req.url?.slice(0, 80));
    }
  });

  instance.use((socket, next) => {
    const authToken = (socket.handshake.auth?.token as string)?.trim();
    const headerToken = (socket.handshake.headers.authorization?.replace('Bearer ', '') ?? '').trim();
    const token = authToken || headerToken;

    if (process.env.NODE_ENV !== 'production') {
      console.log('[socket] middleware', {
        id: socket.id,
        hasAuthToken: !!authToken,
        hasHeaderToken: !!headerToken,
        transport: socket.conn?.transport?.name,
        address: socket.handshake.address,
      });
    }

    if (!token) {
      console.warn('[socket] middleware REJECT — no token');
      return next(new Error('Authentication required'));
    }

    const user = verifyToken(token, { quiet: true });
    if (!user) {
      const reason = getJwtVerifyError(token) || 'invalid';
      console.warn('[socket] middleware REJECT —', reason, {
        jwtSecretConfigured: !!process.env.JWT_SECRET,
      });
      return next(new Error(reason === 'expired' ? 'Token expired' : 'Invalid or expired token'));
    }

    socket.data.user = user;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[socket] middleware OK', { userId: user.userId, role: user.role, companyId: user.companyId });
    }
    next();
  });

  instance.on('connection', (socket) => {
    const tokenUser = socket.data.user as {
      userId: number;
      companyId?: number;
      role: string;
    };

    const joinCompanyRooms = async (requestedCompanyId?: number) => {
      try {
        const resolved = await resolveSocketCompanyId(tokenUser.userId, {
          tokenCompanyId: tokenUser.companyId,
          requestedCompanyId: requestedCompanyId ? Number(requestedCompanyId) : undefined,
        });

        if (resolved) {
          socket.data.companyId = resolved;
          userCompanyMap().set(tokenUser.userId, resolved);
          socket.join(`company:${resolved}`);
        } else {
          console.warn('[socket] no companyId for user', tokenUser.userId, tokenUser.role);
        }
        return resolved ?? null;
      } catch (err) {
        console.error('[socket] joinCompanyRooms failed', tokenUser.userId, err);
        return null;
      }
    };

    void (async () => {
      const companyId = await joinCompanyRooms();
      console.log('[socket] connected', {
        userId: tokenUser.userId,
        role: tokenUser.role,
        companyId,
      });

      socket.emit('connected', {
        userId: tokenUser.userId,
        companyId,
        role: tokenUser.role,
        socketId: socket.id,
      });
    })();

    socket.join(`user:${tokenUser.userId}`);
    trackUserSocket(tokenUser.userId, socket.id);

    socket.on('register', async (data: { userId?: number; companyId?: number }) => {
      const uid = Number(data?.userId);
      if (!uid || uid !== tokenUser.userId) {
        socket.emit('register:error', { message: 'Invalid user id' });
        return;
      }

      const requestedCompanyId = data.companyId ? Number(data.companyId) : undefined;
      const companyId = await joinCompanyRooms(requestedCompanyId);

      trackUserSocket(uid, socket.id);
      if (companyId) userCompanyMap().set(uid, companyId);
      socket.emit('register:ok', { userId: uid, companyId, role: tokenUser.role });
      const rooms = instance.sockets?.adapter?.rooms;
      const roomSize = companyId && rooms ? rooms.get(`company:${companyId}`)?.size ?? 0 : 0;
      const companies = userCompanyMap();
      console.log('[socket] registered', {
        userId: uid,
        role: tokenUser.role,
        companyId,
        roomSize,
        totalConnected: instance.engine?.clientsCount ?? 0,
        staffInCompany: Array.from(companies.entries())
          .filter(([, cid]) => cid === companyId)
          .map(([id]) => id),
      });
    });

    socket.on('location:ping', async (data: { latitude?: number; longitude?: number; accuracy?: number; taskId?: number }) => {
      const companyId = socket.data.companyId as number | undefined;
      if (tokenUser.role !== 'CLEANER' || !companyId) return;
      const latitude = Number(data?.latitude);
      const longitude = Number(data?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      try {
        const { buildLocationRecord, upsertCleanerLocation } = await import('./cleaner-tracking');
        const { TaskStatus } = await import('@prisma/client');

        const config = await prisma.adminConfiguration.findUnique({
          where: { companyId },
          select: { geofenceRadius: true },
        });

        const dbUser = await prisma.user.findUnique({
          where: { id: tokenUser.userId },
          select: { firstName: true, lastName: true },
        });

        let activeTask = null;
        const taskId = data.taskId != null ? Number(data.taskId) : undefined;
        if (taskId) {
          activeTask = await prisma.task.findFirst({
            where: {
              id: taskId,
              companyId,
              OR: [
                { assignedUserId: tokenUser.userId },
                { taskAssignments: { some: { userId: tokenUser.userId } } },
              ],
            },
            select: {
              id: true,
              title: true,
              property: { select: { address: true, latitude: true, longitude: true } },
            },
          });
        } else {
          activeTask = await prisma.task.findFirst({
            where: {
              companyId,
              status: TaskStatus.IN_PROGRESS,
              OR: [
                { assignedUserId: tokenUser.userId },
                { taskAssignments: { some: { userId: tokenUser.userId } } },
              ],
            },
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              title: true,
              property: { select: { address: true, latitude: true, longitude: true } },
            },
          });
        }

        const record = buildLocationRecord({
          userId: tokenUser.userId,
          companyId,
          latitude,
          longitude,
          accuracy: data.accuracy != null ? Number(data.accuracy) : undefined,
          firstName: dbUser?.firstName,
          lastName: dbUser?.lastName,
          task: activeTask,
          geofenceRadius: config?.geofenceRadius ?? 150,
        });

        upsertCleanerLocation(record);
        broadcastCleanerLocation(record);

        if (activeTask?.id) {
          const { recordTimelinePing } = await import('./task-tracker');
          await recordTimelinePing({
            taskId: activeTask.id,
            userId: tokenUser.userId,
            companyId,
            latitude,
            longitude,
          }).catch(() => {});
        }
      } catch (err) {
        console.error('[socket] location:ping error', err);
      }
    });

    socket.on('join:task', async (data: { taskId?: number; companyId?: number }) => {
      const taskId = Number(data?.taskId);
      if (!taskId) return;

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { companyId: true },
      });
      if (!task) return;

      const globalRoles = ['SUPER_ADMIN', 'OWNER', 'DEVELOPER'];
      const socketCompanyId = socket.data.companyId as number | undefined;
      if (
        socketCompanyId &&
        task.companyId !== socketCompanyId &&
        !globalRoles.includes(tokenUser.role)
      ) {
        return;
      }

      socket.join(`task:${task.companyId}:${taskId}`);
    });

    socket.on('leave:task', async (data: { taskId?: number }) => {
      const taskId = Number(data?.taskId);
      if (!taskId) return;
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { companyId: true },
      });
      if (task) socket.leave(`task:${task.companyId}:${taskId}`);
    });

    socket.on('disconnect', () => untrackSocket(socket.id));
  });

  console.log('[socket] Socket.io attached on /socket.io (same port as Next.js)');
  return instance;
}
