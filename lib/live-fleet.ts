/**
 * Live fleet helpers — web read-only. Never pings.
 */
import type { LiveCleaner, ActiveTrackingJob, ActiveJobCleaner } from "@/lib/ops-tracking"

export type SignalState = "live" | "stale" | "offline" | "unknown"

export const STALE_MS = 3 * 60 * 1000
export const OFFLINE_MS = 10 * 60 * 1000

export function signalFromUpdatedAt(iso?: string | null, isLiveFlag?: boolean): SignalState {
  if (!iso) return isLiveFlag ? "live" : "offline"
  const age = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(age) || age < 0) return "unknown"
  if (age <= STALE_MS) return "live"
  if (age <= OFFLINE_MS) return "stale"
  return "offline"
}

export function ageLabel(iso?: string | null): string {
  if (!iso) return "No signal"
  const age = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(age) || age < 0) return "—"
  if (age < 15_000) return "just now"
  if (age < 60_000) return `${Math.round(age / 1000)}s ago`
  if (age < 3600_000) return `${Math.round(age / 60_000)}m ago`
  return `${Math.round(age / 3600_000)}h ago`
}

/** Merge socket cleaner:location into live list (parity with mobile). */
export function mergeCleanerLocationUpdate(
  cleaners: LiveCleaner[],
  payload: any
): LiveCleaner[] {
  const userId = Number(payload?.userId)
  if (!userId) return cleaners

  const next = [...cleaners]
  const idx = next.findIndex((c) => c.userId === userId)
  const name =
    `${payload.firstName || ""} ${payload.lastName || ""}`.trim() ||
    next[idx]?.name ||
    `Cleaner #${userId}`

  const updated: LiveCleaner = {
    userId,
    name,
    isLive: true,
    latitude: payload.latitude != null ? Number(payload.latitude) : next[idx]?.latitude ?? null,
    longitude: payload.longitude != null ? Number(payload.longitude) : next[idx]?.longitude ?? null,
    accuracy: payload.accuracy ?? next[idx]?.accuracy ?? null,
    updatedAt: payload.updatedAt || new Date().toISOString(),
    taskId: payload.taskId ?? next[idx]?.taskId ?? null,
    taskTitle: payload.taskTitle ?? next[idx]?.taskTitle ?? null,
    propertyAddress: payload.propertyAddress ?? next[idx]?.propertyAddress ?? null,
    propertyLatitude: payload.propertyLatitude ?? next[idx]?.propertyLatitude ?? null,
    propertyLongitude: payload.propertyLongitude ?? next[idx]?.propertyLongitude ?? null,
    distanceFromProperty:
      payload.distanceFromProperty ?? next[idx]?.distanceFromProperty ?? null,
    withinGeofence: payload.withinGeofence ?? next[idx]?.withinGeofence ?? null,
    geofenceRadius: payload.geofenceRadius ?? next[idx]?.geofenceRadius ?? 150,
  }

  if (idx >= 0) next[idx] = { ...next[idx], ...updated }
  else next.push(updated)
  return next
}

export type FleetExceptionKind =
  | "sos"
  | "offsite"
  | "no_gps"
  | "stale"
  | "late"
  | "break"

export type FleetException = {
  id: string
  kind: FleetExceptionKind
  urgency: "critical" | "high" | "medium"
  title: string
  detail: string
  taskId?: number | null
  userId?: number | null
  lat?: number | null
  lng?: number | null
  at?: string | null
}

export type CoverageHealth = {
  activeJobs: number
  withLiveGps: number
  stale: number
  noGps: number
  offSite: number
  onBreak: number
  coveragePct: number
}

export function computeCoverage(jobs: ActiveTrackingJob[]): CoverageHealth {
  let withLiveGps = 0
  let stale = 0
  let noGps = 0
  let offSite = 0
  let onBreak = 0
  let trackedCleaners = 0

  for (const j of jobs) {
    for (const c of j.cleaners || []) {
      trackedCleaners += 1
      if (c.onBreak) onBreak += 1
      if (c.withinGeofence === false) offSite += 1
      if (c.latitude == null || c.longitude == null) {
        noGps += 1
        continue
      }
      const sig = signalFromUpdatedAt(c.updatedAt, c.trackerActive)
      if (sig === "live") withLiveGps += 1
      else if (sig === "stale") stale += 1
      else noGps += 1
    }
  }

  const denom = Math.max(1, trackedCleaners)
  return {
    activeJobs: jobs.length,
    withLiveGps,
    stale,
    noGps,
    offSite,
    onBreak,
    coveragePct: Math.round((withLiveGps / denom) * 100),
  }
}

export function buildExceptions(opts: {
  sos: any[]
  live: LiveCleaner[]
  jobs: ActiveTrackingJob[]
}): FleetException[] {
  const out: FleetException[] = []

  for (const a of opts.sos) {
    const status = String(a.status || "").toLowerCase()
    if (!["active", "open", "acknowledged"].includes(status)) continue
    const name =
      [a.user?.firstName, a.user?.lastName].filter(Boolean).join(" ") ||
      a.cleanerName ||
      "Cleaner"
    out.push({
      id: `sos-${a.id}`,
      kind: "sos",
      urgency: "critical",
      title: `SOS · ${name}`,
      detail: a.task?.title || a.notes || "Emergency alert — respond now",
      taskId: a.taskId ?? a.task?.id ?? null,
      userId: a.userId ?? a.user?.id ?? null,
      lat: a.latitude != null ? Number(a.latitude) : null,
      lng: a.longitude != null ? Number(a.longitude) : null,
      at: a.createdAt || a.triggeredAt || null,
    })
  }

  for (const j of opts.jobs) {
    for (const c of j.cleaners || []) {
      const sv = scheduleVsReality(c, j.scheduledDate)
      if (sv.late) {
        out.push({
          id: `late-${j.taskId}-${c.userId}`,
          kind: "late",
          urgency: "high",
          title: `${c.name} late`,
          detail: `${sv.label} · ${j.title || `Job #${j.taskId}`}`,
          taskId: j.taskId,
          userId: c.userId,
          lat: c.latitude,
          lng: c.longitude,
          at: c.startedAt || c.updatedAt,
        })
      }
      if (c.withinGeofence === false) {
        out.push({
          id: `off-${j.taskId}-${c.userId}`,
          kind: "offsite",
          urgency: "critical",
          title: `${c.name} off-site`,
          detail: `${j.title || `Job #${j.taskId}`} · ${
            c.distanceFromProperty != null ? `${Math.round(c.distanceFromProperty)}m out` : "Outside geofence"
          }`,
          taskId: j.taskId,
          userId: c.userId,
          lat: c.latitude,
          lng: c.longitude,
          at: c.updatedAt,
        })
      }
      if (c.latitude == null || c.longitude == null) {
        if (c.trackerActive || j.status === "IN_PROGRESS") {
          out.push({
            id: `nogps-${j.taskId}-${c.userId}`,
            kind: "no_gps",
            urgency: "high",
            title: `${c.name} · no GPS`,
            detail: `Active on ${j.title || `Job #${j.taskId}`} — last known unavailable`,
            taskId: j.taskId,
            userId: c.userId,
            at: c.updatedAt,
          })
        }
      } else {
        const sig = signalFromUpdatedAt(c.updatedAt, c.trackerActive)
        if (sig === "stale" || sig === "offline") {
          out.push({
            id: `stale-${j.taskId}-${c.userId}`,
            kind: "stale",
            urgency: sig === "offline" ? "high" : "medium",
            title: `${c.name} · ${sig} signal`,
            detail: `Last known ${ageLabel(c.updatedAt)} · ${j.propertyAddress || j.title}`,
            taskId: j.taskId,
            userId: c.userId,
            lat: c.latitude,
            lng: c.longitude,
            at: c.updatedAt,
          })
        }
      }
      if (c.onBreak) {
        out.push({
          id: `break-${j.taskId}-${c.userId}`,
          kind: "break",
          urgency: "medium",
          title: `${c.name} on break`,
          detail: j.title || `Job #${j.taskId}`,
          taskId: j.taskId,
          userId: c.userId,
          lat: c.latitude,
          lng: c.longitude,
          at: c.updatedAt,
        })
      }
    }
  }

  const order = { critical: 0, high: 1, medium: 2 }
  return out.sort((a, b) => order[a.urgency] - order[b.urgency])
}

export type IncidentEvent = {
  id: string
  at: string
  kind: string
  label: string
  detail?: string
  warn?: boolean
}

export function buildIncidentTimeline(opts: {
  sos: any[]
  jobs: ActiveTrackingJob[]
  live: LiveCleaner[]
}): IncidentEvent[] {
  const events: IncidentEvent[] = []

  for (const a of opts.sos.slice(0, 20)) {
    events.push({
      id: `sos-e-${a.id}`,
      at: a.createdAt || a.triggeredAt || new Date().toISOString(),
      kind: "sos",
      label: `SOS ${String(a.status || "active")}`,
      detail:
        [a.user?.firstName, a.user?.lastName].filter(Boolean).join(" ") ||
        a.cleanerName ||
        undefined,
      warn: true,
    })
  }

  for (const j of opts.jobs) {
    for (const c of j.cleaners || []) {
      for (const g of (c.recentGps || []).slice(0, 8)) {
        const off = g.withinGeofence === false
        events.push({
          id: `gps-${g.id}`,
          at: g.recordedAt,
          kind: off ? "geofence_exit" : "gps",
          label: off ? "Left geofence" : "GPS ping",
          detail: `${c.name} · ${j.title || `#${j.taskId}`}`,
          warn: off,
        })
      }
      if (c.startedAt) {
        events.push({
          id: `start-${j.taskId}-${c.userId}`,
          at: c.startedAt,
          kind: "start",
          label: "Work started",
          detail: `${c.name} · ${j.title || `#${j.taskId}`}`,
        })
      }
    }
  }

  return events
    .filter((e) => e.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 40)
}

export function scheduleVsReality(
  c: ActiveJobCleaner,
  scheduledDate?: string | null
): {
  label: string
  late: boolean
} {
  if (!c.startedAt) {
    if (scheduledDate && new Date(scheduledDate).getTime() < Date.now() - 15 * 60 * 1000) {
      return { label: "Late to start", late: true }
    }
    return { label: "Not started", late: false }
  }
  const mins = c.workMinutes || 0
  if (scheduledDate) {
    const skew = Math.round(
      (new Date(c.startedAt).getTime() - new Date(scheduledDate).getTime()) / 60000
    )
    if (skew > 15) return { label: `Started +${skew}m late · ${mins}m on site`, late: true }
    if (skew < -10) return { label: `Started ${Math.abs(skew)}m early · ${mins}m`, late: false }
  }
  return { label: `On site ${mins}m`, late: false }
}

export type FleetFilter =
  | "all"
  | "offsite"
  | "stale"
  | "nogps"
  | "sos"
  | "break"
