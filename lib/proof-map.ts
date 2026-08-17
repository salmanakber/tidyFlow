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

export function computeProofMapBounds(
  points: Array<{ latitude: number; longitude: number }>
): ProofMapBounds | null {
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
