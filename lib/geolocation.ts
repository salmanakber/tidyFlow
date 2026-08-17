export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Haversine distance in meters between two GPS points */
export function calculateDistance(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function validateGeofence(
  userLocation: Coordinates,
  propertyLocation: Coordinates,
  radiusMeters: number
): { isWithinGeofence: boolean; distance: number; geofenceRadius: number } {
  const distance = calculateDistance(userLocation, propertyLocation);
  return {
    isWithinGeofence: distance <= radiusMeters,
    distance: Math.round(distance),
    geofenceRadius: radiusMeters,
  };
}
