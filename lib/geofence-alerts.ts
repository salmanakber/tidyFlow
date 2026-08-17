import prisma from '@/lib/prisma';
import { createNotification } from '@/lib/notifications';
import { emitTaskEvent } from '@/lib/realtime';

const lastByKey = new Map<string, { within: boolean | null; notifiedAt: number }>();
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

function stateKey(userId: number, taskId: number): string {
  return `${userId}:${taskId}`;
}

/** Notify managers/owners when a cleaner leaves the property geofence (debounced). */
export async function notifyGeofenceExitIfNeeded(input: {
  userId: number;
  companyId: number;
  taskId: number;
  distance: number;
  withinGeofence: boolean | null;
  cleanerName?: string;
  propertyAddress?: string | null;
  taskTitle?: string | null;
}): Promise<void> {
  const key = stateKey(input.userId, input.taskId);
  const prev = lastByKey.get(key);
  const now = Date.now();

  if (input.withinGeofence !== false) {
    lastByKey.set(key, { within: input.withinGeofence, notifiedAt: prev?.notifiedAt ?? 0 });
    return;
  }

  if (prev?.within === false && prev.notifiedAt && now - prev.notifiedAt < ALERT_COOLDOWN_MS) {
    return;
  }

  const wasInside = prev?.within === true || prev?.within == null;
  if (!wasInside && prev?.notifiedAt && now - prev.notifiedAt < ALERT_COOLDOWN_MS) {
    return;
  }

  lastByKey.set(key, { within: false, notifiedAt: now });

  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { title: true, property: { select: { address: true } } },
  });

  const cleaner =
    input.cleanerName ||
    (await prisma.user.findUnique({
      where: { id: input.userId },
      select: { firstName: true, lastName: true },
    }).then((u) => `${u?.firstName || ''} ${u?.lastName || ''}`.trim())) ||
    'Cleaner';

  const address = input.propertyAddress || task?.property?.address || 'the property';
  const title = input.taskTitle || task?.title || 'Active job';

  const managers = await prisma.user.findMany({
    where: {
      companyId: input.companyId,
      role: { in: ['MANAGER', 'COMPANY_ADMIN', 'OWNER'] },
      isActive: true,
    },
    select: { id: true },
  });

  const message = `${cleaner} left ${address} (${input.distance}m away) during "${title}". Return to site or stop the tracker.`;

  for (const manager of managers) {
    await createNotification({
      userId: manager.id,
      title: 'GPS red flag — cleaner off site',
      message,
      type: 'high_severity_issue',
      metadata: {
        taskId: input.taskId,
        userId: input.userId,
        distance: input.distance,
        geofenceExit: true,
      },
    });
  }

  await emitTaskEvent('task:geofence', input.companyId, input.taskId, {
    userId: input.userId,
    withinGeofence: false,
    distance: input.distance,
    cleanerName: cleaner,
  });
}
