import prisma from '@/lib/prisma';
import { getEffectiveDurationMinutes } from '@/lib/task-time-log';

export type ProofMapCheckpointKind = 'property' | 'on_site' | 'off_site' | 'start' | 'complete';

export interface ProofMapCheckpoint {
  id: string;
  latitude: number;
  longitude: number;
  kind: ProofMapCheckpointKind;
  label: string;
  recordedAt?: string;
  distanceMeters?: number | null;
}

export interface ProofMapBounds {
  centerLat: number;
  centerLng: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface TaskProofSummary {
  totalWorkMinutes: number;
  cleanerCount: number;
  cleaners: Array<{
    name: string;
    workMinutes: number;
    startedAt: string | null;
    endedAt: string | null;
    startWithinGeofence: boolean | null;
    endWithinGeofence: boolean | null;
    startDistanceMeters: number | null;
    endDistanceMeters: number | null;
  }>;
  gps: {
    checkpointCount: number;
    offSiteCount: number;
    onSiteCount: number;
    startChecks: Array<{
      latitude: number;
      longitude: number;
      withinGeofence: boolean | null;
      distanceMeters: number | null;
      recordedAt: string;
      cleanerName: string;
    }>;
    flaggedCheckpoints: Array<{
      latitude: number;
      longitude: number;
      distanceMeters: number | null;
      recordedAt: string;
      cleanerName: string;
    }>;
    mapCheckpoints: ProofMapCheckpoint[];
    mapBounds: ProofMapBounds | null;
  };
}

const MAX_MAP_POINTS = 48;

function sampleEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  const step = items.length / max;
  for (let i = 0; i < max; i += 1) {
    out.push(items[Math.floor(i * step)]);
  }
  return out;
}

function computeBounds(points: Array<{ latitude: number; longitude: number }>): ProofMapBounds | null {
  if (points.length === 0) return null;
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLng = points[0].longitude;
  let maxLng = points[0].longitude;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  const pad = 0.0015;
  return {
    minLat: minLat - pad,
    maxLat: maxLat + pad,
    minLng: minLng - pad,
    maxLng: maxLng + pad,
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2,
  };
}

/** Build OpenStreetMap embed URL (no API key required). */
export function buildOsmEmbedUrl(bounds: ProofMapBounds, marker?: { latitude: number; longitude: number }) {
  const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
  const markerParam = marker ? `&marker=${marker.latitude}%2C${marker.longitude}` : '';
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik${markerParam}`;
}

/** Read-only GPS + hours summary for client proof links. */
export async function buildTaskProofSummary(taskId: number): Promise<TaskProofSummary> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { property: { select: { latitude: true, longitude: true, address: true } } },
  });

  const [assignments, logs] = await Promise.all([
    prisma.taskAssignment.findMany({
      where: { taskId, startedAt: { not: null } },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { startedAt: 'asc' },
    }),
    prisma.locationLog.findMany({
      where: {
        taskId,
        checkType: { in: ['start', 'complete', 'timeline', 'check'] },
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const cleaners = assignments.map((a) => {
    const name = `${a.user.firstName || ''} ${a.user.lastName || ''}`.trim() || 'Cleaner';
    return {
      name,
      workMinutes: getEffectiveDurationMinutes(a) ?? 0,
      startedAt: a.startedAt?.toISOString() ?? null,
      endedAt: a.endedAt?.toISOString() ?? null,
      startWithinGeofence: a.startWithinGeofence,
      endWithinGeofence: a.endWithinGeofence,
      startDistanceMeters: a.startDistanceMeters != null ? Number(a.startDistanceMeters) : null,
      endDistanceMeters: a.endDistanceMeters != null ? Number(a.endDistanceMeters) : null,
    };
  });

  const timeline = logs.filter((l) => l.checkType === 'timeline');
  const offSiteCount = timeline.filter((l) => l.withinGeofence === false).length;
  const onSiteCount = timeline.filter((l) => l.withinGeofence === true).length;

  const cleanerName = (l: (typeof logs)[0]) =>
    `${l.user.firstName || ''} ${l.user.lastName || ''}`.trim() || 'Cleaner';

  const startChecks = logs
    .filter((l) => l.checkType === 'start' || l.checkType === 'check')
    .slice(0, 5)
    .map((l) => ({
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
      withinGeofence: l.withinGeofence,
      distanceMeters: l.distanceFromProperty != null ? Number(l.distanceFromProperty) : null,
      recordedAt: l.createdAt.toISOString(),
      cleanerName: cleanerName(l),
    }));

  const flaggedCheckpoints = timeline
    .filter((l) => l.withinGeofence === false)
    .slice(-8)
    .map((l) => ({
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
      distanceMeters: l.distanceFromProperty != null ? Number(l.distanceFromProperty) : null,
      recordedAt: l.createdAt.toISOString(),
      cleanerName: cleanerName(l),
    }));

  const mapCheckpoints: ProofMapCheckpoint[] = [];
  if (task?.property?.latitude != null && task.property.longitude != null) {
    mapCheckpoints.push({
      id: 'property',
      latitude: Number(task.property.latitude),
      longitude: Number(task.property.longitude),
      kind: 'property',
      label: task.property.address || 'Property',
    });
  }

  for (const l of logs.filter((x) => x.checkType === 'start')) {
    mapCheckpoints.push({
      id: `start-${l.id}`,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
      kind: 'start',
      label: `${cleanerName(l)} · start`,
      recordedAt: l.createdAt.toISOString(),
      distanceMeters: l.distanceFromProperty != null ? Number(l.distanceFromProperty) : null,
    });
  }

  for (const l of logs.filter((x) => x.checkType === 'complete')) {
    mapCheckpoints.push({
      id: `complete-${l.id}`,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
      kind: 'complete',
      label: `${cleanerName(l)} · end`,
      recordedAt: l.createdAt.toISOString(),
      distanceMeters: l.distanceFromProperty != null ? Number(l.distanceFromProperty) : null,
    });
  }

  const timelineSample = sampleEvenly(timeline, MAX_MAP_POINTS);
  for (const l of timelineSample) {
    mapCheckpoints.push({
      id: `timeline-${l.id}`,
      latitude: Number(l.latitude),
      longitude: Number(l.longitude),
      kind: l.withinGeofence === false ? 'off_site' : 'on_site',
      label: cleanerName(l),
      recordedAt: l.createdAt.toISOString(),
      distanceMeters: l.distanceFromProperty != null ? Number(l.distanceFromProperty) : null,
    });
  }

  const mapBounds = computeBounds(mapCheckpoints);

  return {
    totalWorkMinutes: cleaners.reduce((sum, c) => sum + c.workMinutes, 0),
    cleanerCount: cleaners.length,
    cleaners,
    gps: {
      checkpointCount: timeline.length,
      offSiteCount,
      onSiteCount,
      startChecks,
      flaggedCheckpoints,
      mapCheckpoints,
      mapBounds,
    },
  };
}
