/**
 * Web consumer of existing tracking read APIs (manager/owner view).
 * Never calls /api/tracking/ping — that remains cleaner-only on mobile.
 */
import { adminGet } from "@/lib/admin-session"

export type LiveCleaner = {
  userId: number
  name: string
  isLive: boolean
  latitude: number | null
  longitude: number | null
  accuracy?: number | null
  updatedAt: string | null
  taskId?: number | null
  taskTitle?: string | null
  propertyAddress?: string | null
  propertyLatitude?: number | null
  propertyLongitude?: number | null
  distanceFromProperty?: number | null
  withinGeofence?: boolean | null
  geofenceRadius?: number
}

export type LocationLog = {
  id: number
  checkType?: string
  withinGeofence?: boolean | null
  distanceFromProperty?: number | null
  latitude?: number
  longitude?: number
  createdAt?: string
  recordedAt?: string
  user?: { id?: number; firstName?: string; lastName?: string; name?: string }
}

export type ActiveJobCleaner = {
  userId: number
  name: string
  trackerActive: boolean
  onBreak?: boolean
  startedAt: string | null
  workMinutes: number
  withinGeofence: boolean | null
  distanceFromProperty: number | null
  latitude: number | null
  longitude: number | null
  updatedAt: string | null
  recentGps?: Array<{
    id: number
    latitude: number
    longitude: number
    recordedAt: string
    withinGeofence?: boolean | null
  }>
}

export type ActiveTrackingJob = {
  taskId: number
  title: string
  status: string
  scheduledDate?: string | null
  propertyAddress: string | null
  propertyLatitude: number | null
  propertyLongitude: number | null
  geofenceRadius: number
  cleaners: ActiveJobCleaner[]
  gpsPingCount: number
  lastGpsAt: string | null
  hasOffSiteCleaner: boolean
}

export async function fetchLiveCleaners(): Promise<LiveCleaner[]> {
  try {
    const res = await adminGet("/api/tracking/live")
    if (res.data?.success) {
      const list = res.data.data?.cleaners
      return Array.isArray(list) ? list : []
    }
  } catch {
    /* ignore */
  }
  return []
}

export async function fetchActiveTrackingJobs(): Promise<{
  jobs: ActiveTrackingJob[]
  liveCount: number
  geofenceRadius: number
}> {
  try {
    const res = await adminGet("/api/tracking/active-jobs")
    if (res.data?.success) {
      const d = res.data.data
      return {
        jobs: Array.isArray(d?.jobs) ? d.jobs : [],
        liveCount: Number(d?.liveCount || 0),
        geofenceRadius: Number(d?.geofenceRadius || 150),
      }
    }
  } catch {
    /* ignore */
  }
  return { jobs: [], liveCount: 0, geofenceRadius: 150 }
}

export async function fetchTaskLocationLogs(taskId: number): Promise<LocationLog[]> {
  try {
    const res = await adminGet(`/api/tasks/${taskId}/location-logs`)
    if (res.data?.success) {
      const raw = res.data.data
      if (Array.isArray(raw)) return raw
      if (Array.isArray(raw?.logs)) return raw.logs
    }
  } catch {
    /* ignore */
  }
  return []
}

export function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

export function osmEmbedUrl(lat: number, lng: number, zoom = 15) {
  const d = 0.02
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`
}
