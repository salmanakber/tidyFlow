import { broadcastRealtimeEvent } from './socket-io';

export type RealtimeEventType =
  | 'task:created'
  | 'task:updated'
  | 'task:status'
  | 'task:photo'
  | 'task:checklist'
  | 'task:note'
  | 'task:issue'
  | 'task:supply'
  | 'property:created'
  | 'property:updated'
  | 'sheet:sync'
  | 'notification:new'
  | 'cleaner:location'
  | 'task:tracker';

export interface RealtimeEvent {
  type: RealtimeEventType;
  /** Required for company-scoped broadcasts — must match task/property company. */
  companyId?: number;
  taskId?: number;
  propertyId?: number;
  userId?: number;
  payload?: Record<string, unknown>;
}

/** In-process emit via Socket.io (same Next.js server port). */
export async function emitRealtimeEvent(event: RealtimeEvent): Promise<void> {
  if (!event.companyId && !event.userId) {
    console.warn('[realtime] skipped event without companyId or userId:', event.type);
    return;
  }
  broadcastRealtimeEvent(event);
}

export async function emitTaskEvent(
  type: RealtimeEventType,
  companyId: number,
  taskId: number,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await emitRealtimeEvent({ type, companyId, taskId, payload });
}

export async function emitPropertyEvent(
  type: 'property:created' | 'property:updated',
  companyId: number,
  propertyId: number,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await emitRealtimeEvent({ type, companyId, propertyId, payload });
}

export async function emitCompanyEvent(
  type: RealtimeEventType,
  companyId: number,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await emitRealtimeEvent({ type, companyId, payload });
}

export interface SheetSyncDelta {
  companyId: number;
  tasksCreated: number[];
  tasksUpdated: number[];
  propertiesCreated: number[];
  propertiesUpdated: number[];
  stats?: Record<string, unknown>;
}

/** Emit per-record socket events after Google Sheet sync (company-scoped). */
export async function emitSheetSyncDelta(delta: SheetSyncDelta): Promise<void> {
  const { companyId, tasksCreated, tasksUpdated, propertiesCreated, propertiesUpdated, stats } =
    delta;

  await emitCompanyEvent('sheet:sync', companyId, {
    ...stats,
    companyId,
    tasksCreated: tasksCreated.length,
    tasksUpdated: tasksUpdated.length,
    propertiesCreated: propertiesCreated.length,
    propertiesUpdated: propertiesUpdated.length,
    source: 'google_sheet',
  });

  for (const taskId of tasksCreated) {
    await emitTaskEvent('task:created', companyId, taskId, { source: 'google_sheet' });
  }
  for (const taskId of tasksUpdated) {
    await emitTaskEvent('task:updated', companyId, taskId, { source: 'google_sheet' });
  }
  for (const propertyId of propertiesCreated) {
    await emitPropertyEvent('property:created', companyId, propertyId, { source: 'google_sheet' });
  }
  for (const propertyId of propertiesUpdated) {
    await emitPropertyEvent('property:updated', companyId, propertyId, { source: 'google_sheet' });
  }
}
