import { calculateDistance, type Coordinates } from '@/lib/geolocation';

export interface CleanerLocationRecord {
  userId: number;
  companyId: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  taskId?: number;
  taskTitle?: string;
  propertyAddress?: string;
  propertyLatitude?: number;
  propertyLongitude?: number;
  distanceFromProperty?: number;
  withinGeofence?: boolean;
  geofenceRadius?: number;
  updatedAt: string;
  firstName?: string;
  lastName?: string;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const store = new Map<number, CleanerLocationRecord>();

export function upsertCleanerLocation(record: CleanerLocationRecord): CleanerLocationRecord {
  store.set(record.userId, record);
  return record;
}

export function getCleanerLocation(userId: number): CleanerLocationRecord | null {
  const record = store.get(userId);
  if (!record) return null;
  if (Date.now() - new Date(record.updatedAt).getTime() > TTL_MS) {
    store.delete(userId);
    return null;
  }
  return record;
}

export function getCompanyCleanerLocations(companyId: number): CleanerLocationRecord[] {
  const now = Date.now();
  const results: CleanerLocationRecord[] = [];
  for (const [userId, record] of Array.from(store.entries())) {
    if (record.companyId !== companyId) continue;
    if (now - new Date(record.updatedAt).getTime() > TTL_MS) {
      store.delete(userId);
      continue;
    }
    results.push(record);
  }
  return results.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function buildLocationRecord(input: {
  userId: number;
  companyId: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  firstName?: string | null;
  lastName?: string | null;
  task?: {
    id: number;
    title: string;
    property?: {
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
  } | null;
  geofenceRadius?: number;
}): CleanerLocationRecord {
  const cleanerLocation: Coordinates = {
    latitude: input.latitude,
    longitude: input.longitude,
  };

  let distanceFromProperty: number | undefined;
  let withinGeofence: boolean | undefined;
  const radius = input.geofenceRadius ?? 150;
  const property = input.task?.property;

  if (property?.latitude != null && property.longitude != null) {
    const propertyLocation: Coordinates = {
      latitude: Number(property.latitude),
      longitude: Number(property.longitude),
    };
    distanceFromProperty = Math.round(
      calculateDistance(cleanerLocation, propertyLocation)
    );
    withinGeofence = distanceFromProperty <= radius;
  }

  return {
    userId: input.userId,
    companyId: input.companyId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    taskId: input.task?.id,
    taskTitle: input.task?.title,
    propertyAddress: property?.address ?? undefined,
    propertyLatitude: property?.latitude != null ? Number(property.latitude) : undefined,
    propertyLongitude: property?.longitude != null ? Number(property.longitude) : undefined,
    distanceFromProperty,
    withinGeofence,
    geofenceRadius: radius,
    updatedAt: new Date().toISOString(),
    firstName: input.firstName ?? undefined,
    lastName: input.lastName ?? undefined,
  };
}
