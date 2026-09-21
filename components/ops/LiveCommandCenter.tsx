"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  OpsPageHeader,
  OpsKpi,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsCard,
  OpsSkeleton,
} from "@/components/ops/OpsChrome"
import { OpsDrawer, OpsSecondaryButton, OpsField, opsFieldCls } from "@/components/ops/OpsForm"
import { OpsPrimaryButton } from "@/components/ops/OpsChrome"
import LiveFleetMap, {
  type FleetMapMarker,
  type FleetMapGeofence,
  type FleetMapTrail,
} from "@/components/ops/LiveFleetMap"
import {
  fetchLiveCleaners,
  fetchActiveTrackingJobs,
  fetchTaskLocationLogs,
  mapsUrl,
  type LiveCleaner,
  type ActiveTrackingJob,
} from "@/lib/ops-tracking"
import {
  mergeCleanerLocationUpdate,
  computeCoverage,
  buildExceptions,
  buildIncidentTimeline,
  signalFromUpdatedAt,
  ageLabel,
  scheduleVsReality,
  type FleetFilter,
  type FleetException,
} from "@/lib/live-fleet"
import { useOpsRealtime } from "@/hooks/useOpsRealtime"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import { adminGet, adminPatch } from "@/lib/admin-session"
import { getAiLiveAlerts, type AiLiveAlert } from "@/lib/ops-ai"
import {
  Crosshair,
  Radio,
  ShieldAlert,
  MapPin,
  Clock3,
  Phone,
  ExternalLink,
  Sparkles,
  Play,
  Pause,
  X,
  AlertTriangle,
  Wifi,
  WifiOff,
  Users,
  Focus,
  MessageSquare,
} from "lucide-react"

type ViewTab = "fleet" | "exceptions" | "sos" | "playback" | "timeline"

function asSosList(data: any): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.alerts)) return data.alerts
  if (Array.isArray(data?.items)) return data.items
  return []
}

function personName(u: any) {
  if (!u) return "—"
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || u.name || "—"
}

/**
 * Full fleet command center — realtime map, triage, SOS, playback, AI alerts.
 * Web read-only (no GPS ping). Uses company AI config for smart alerts.
 */
export default function LiveCommandCenter({
  initialTab = "fleet",
}: {
  initialTab?: ViewTab
}) {
  const { href: wsHref } = useCompanyWorkspace()
  const [live, setLive] = useState<LiveCleaner[]>([])
  const [jobs, setJobs] = useState<ActiveTrackingJob[]>([])
  const [sos, setSos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [tab, setTab] = useState<ViewTab>(initialTab)
  const [filter, setFilter] = useState<FleetFilter>("all")
  const [focusedJobIds, setFocusedJobIds] = useState<number[]>([])
  const [selected, setSelected] = useState<FleetMapMarker | null>(null)
  const [actionOpen, setActionOpen] = useState(false)
  const [sosBusy, setSosBusy] = useState<number | null>(null)
  const [sosNotes, setSosNotes] = useState("")
  const [focusLatLng, setFocusLatLng] = useState<{ lat: number; lng: number } | null>(null)
  const [playbackJobId, setPlaybackJobId] = useState<number | null>(null)
  const [playbackLogs, setPlaybackLogs] = useState<
    Array<{ lat: number; lng: number; at: string; within?: boolean | null }>
  >([])
  const [playbackIdx, setPlaybackIdx] = useState(0)
  const [playbackPlaying, setPlaybackPlaying] = useState(false)
  const [aiAlerts, setAiAlerts] = useState<AiLiveAlert[]>([])
  const [aiGenerated, setAiGenerated] = useState(false)
  const softRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSos = useCallback(async () => {
    try {
      const res = await adminGet("/api/safety/sos", { params: { status: "active" } })
      if (res.data?.success !== false) setSos(asSosList(res.data?.data))
      else setSos([])
    } catch {
      setSos([])
    }
  }, [])

  const loadTracking = useCallback(async () => {
    const [liveList, active] = await Promise.all([
      fetchLiveCleaners(),
      fetchActiveTrackingJobs(),
    ])
    setLive(liveList)
    setJobs(active.jobs)
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      await Promise.all([loadTracking(), loadSos()])
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load fleet")
    } finally {
      setLoading(false)
    }
  }, [loadTracking, loadSos])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  // Soft poll as backup when socket offline
  useEffect(() => {
    const id = setInterval(() => {
      loadTracking().catch(() => undefined)
      loadSos().catch(() => undefined)
    }, 45000)
    return () => clearInterval(id)
  }, [loadTracking, loadSos])

  const scheduleSoftRefetch = useCallback(() => {
    if (softRefetchTimer.current) clearTimeout(softRefetchTimer.current)
    softRefetchTimer.current = setTimeout(() => {
      loadTracking().catch(() => undefined)
      loadSos().catch(() => undefined)
    }, 2500)
  }, [loadTracking, loadSos])

  const { status: socketStatus } = useOpsRealtime((eventName, payload) => {
    if (eventName === "cleaner:location" && payload) {
      setLive((prev) => mergeCleanerLocationUpdate(prev, payload))
      // Also patch active job cleaner coords when present
      const uid = Number(payload.userId)
      const tid = payload.taskId != null ? Number(payload.taskId) : null
      if (uid && (payload.latitude != null || payload.longitude != null)) {
        setJobs((prev) =>
          prev.map((j) => {
            if (tid && j.taskId !== tid) return j
            return {
              ...j,
              cleaners: (j.cleaners || []).map((c) =>
                c.userId === uid
                  ? {
                      ...c,
                      latitude: payload.latitude ?? c.latitude,
                      longitude: payload.longitude ?? c.longitude,
                      updatedAt: payload.updatedAt || new Date().toISOString(),
                      withinGeofence: payload.withinGeofence ?? c.withinGeofence,
                      distanceFromProperty:
                        payload.distanceFromProperty ?? c.distanceFromProperty,
                      trackerActive: true,
                    }
                  : c
              ),
              hasOffSiteCleaner:
                payload.withinGeofence === false
                  ? true
                  : j.hasOffSiteCleaner,
            }
          })
        )
      }
      return
    }
    if (eventName === "safety:sos") {
      void loadSos()
      try {
        if (typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification("TidyFlow SOS", {
              body: payload?.cleanerName
                ? `${payload.cleanerName} triggered SOS`
                : "Emergency alert",
            })
          } else if (Notification.permission === "default") {
            Notification.requestPermission().catch(() => undefined)
          }
        }
      } catch {
        /* ignore */
      }
      return
    }
    scheduleSoftRefetch()
  }, true)

  const coverage = useMemo(() => computeCoverage(jobs), [jobs])
  const exceptions = useMemo(
    () => buildExceptions({ sos, live, jobs }),
    [sos, live, jobs]
  )
  const timeline = useMemo(
    () => buildIncidentTimeline({ sos, jobs, live }),
    [sos, jobs, live]
  )

  // AI smart alerts (company AI config)
  useEffect(() => {
    if (loading) return
    let cancelled = false
    const t = setTimeout(() => {
      void getAiLiveAlerts({
        coveragePct: coverage.coveragePct,
        offSite: coverage.offSite,
        stale: coverage.stale,
        noGps: coverage.noGps,
        sosCount: exceptions.filter((e) => e.kind === "sos").length,
        exceptions: exceptions.slice(0, 10).map((e) => ({
          kind: e.kind,
          title: e.title,
          detail: e.detail,
        })),
      }).then((res) => {
        if (cancelled) return
        setAiAlerts(res.alerts)
        setAiGenerated(res.aiGenerated)
      })
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [
    loading,
    coverage.coveragePct,
    coverage.offSite,
    coverage.stale,
    coverage.noGps,
    exceptions.length,
  ])

  const filteredExceptions = useMemo(() => {
    if (filter === "all") return exceptions
    if (filter === "offsite") return exceptions.filter((e) => e.kind === "offsite")
    if (filter === "stale") return exceptions.filter((e) => e.kind === "stale")
    if (filter === "nogps") return exceptions.filter((e) => e.kind === "no_gps")
    if (filter === "sos") return exceptions.filter((e) => e.kind === "sos")
    if (filter === "break") return exceptions.filter((e) => e.kind === "break")
    return exceptions
  }, [exceptions, filter])

  const visibleJobs = useMemo(() => {
    if (focusedJobIds.length === 0) return jobs
    return jobs.filter((j) => focusedJobIds.includes(j.taskId))
  }, [jobs, focusedJobIds])

  const mapData = useMemo(() => {
    const markers: FleetMapMarker[] = []
    const geofences: FleetMapGeofence[] = []
    const trails: FleetMapTrail[] = []

    for (const a of sos) {
      if (a.latitude == null || a.longitude == null) continue
      markers.push({
        id: `sos-${a.id}`,
        lat: Number(a.latitude),
        lng: Number(a.longitude),
        label: `SOS · ${personName(a.user) || a.cleanerName || "Alert"}`,
        sub: String(a.status || "active"),
        kind: "sos",
        warn: true,
        signal: "live",
        meta: { sosId: a.id, taskId: a.taskId },
      })
    }

    for (const j of visibleJobs) {
      if (j.propertyLatitude != null && j.propertyLongitude != null) {
        geofences.push({
          id: `geo-${j.taskId}`,
          lat: Number(j.propertyLatitude),
          lng: Number(j.propertyLongitude),
          radiusM: j.geofenceRadius || 150,
          label: j.propertyAddress || j.title,
          warn: j.hasOffSiteCleaner,
        })
        markers.push({
          id: `prop-${j.taskId}`,
          lat: Number(j.propertyLatitude),
          lng: Number(j.propertyLongitude),
          label: j.propertyAddress || j.title || `Job #${j.taskId}`,
          sub: j.status,
          kind: "property",
          meta: { taskId: j.taskId },
        })
      }
      for (const c of j.cleaners || []) {
        if (c.recentGps && c.recentGps.length > 1) {
          trails.push({
            id: `trail-${j.taskId}-${c.userId}`,
            warn: c.withinGeofence === false,
            points: c.recentGps.map((g) => ({
              lat: Number(g.latitude),
              lng: Number(g.longitude),
              at: g.recordedAt,
            })),
          })
        }
        if (c.latitude == null || c.longitude == null) continue
        const sig = signalFromUpdatedAt(c.updatedAt, c.trackerActive)
        markers.push({
          id: `c-${j.taskId}-${c.userId}`,
          lat: Number(c.latitude),
          lng: Number(c.longitude),
          label: c.name,
          sub: [
            sig.toUpperCase(),
            ageLabel(c.updatedAt),
            c.onBreak ? "Break" : null,
            c.withinGeofence === false ? "Off-site" : c.withinGeofence ? "On-site" : null,
            scheduleVsReality(c, j.scheduledDate).label,
          ]
            .filter(Boolean)
            .join(" · "),
          kind: "cleaner",
          warn: c.withinGeofence === false || scheduleVsReality(c, j.scheduledDate).late,
          signal: sig,
          meta: { taskId: j.taskId, userId: c.userId, name: c.name },
        })
      }
    }

    // Live cleaners not yet on a visible job card
    for (const c of live) {
      if (c.latitude == null || c.longitude == null) continue
      if (focusedJobIds.length && c.taskId && !focusedJobIds.includes(c.taskId)) continue
      const already = markers.some(
        (m) => m.meta?.userId === c.userId || m.id === `c-${c.taskId}-${c.userId}`
      )
      if (already) continue
      const sig = signalFromUpdatedAt(c.updatedAt, c.isLive)
      markers.push({
        id: `live-${c.userId}`,
        lat: Number(c.latitude),
        lng: Number(c.longitude),
        label: c.name,
        sub: [sig.toUpperCase(), ageLabel(c.updatedAt), c.taskTitle].filter(Boolean).join(" · "),
        kind: "cleaner",
        warn: c.withinGeofence === false,
        signal: sig,
        meta: { taskId: c.taskId, userId: c.userId, name: c.name },
      })
    }

    // Playback trail override
    if (tab === "playback" && playbackLogs.length > 1) {
      trails.length = 0
      trails.push({
        id: "playback",
        points: playbackLogs,
        color: "#0ea5e9",
      })
    }

    return { markers, geofences, trails }
  }, [visibleJobs, live, sos, focusedJobIds, tab, playbackLogs])

  // Playback animation
  useEffect(() => {
    if (!playbackPlaying || playbackLogs.length < 2) return
    const id = setInterval(() => {
      setPlaybackIdx((i) => {
        if (i >= playbackLogs.length - 1) {
          setPlaybackPlaying(false)
          return i
        }
        return i + 1
      })
    }, 700)
    return () => clearInterval(id)
  }, [playbackPlaying, playbackLogs.length])

  useEffect(() => {
    if (tab !== "playback" || playbackLogs.length === 0) return
    const p = playbackLogs[Math.min(playbackIdx, playbackLogs.length - 1)]
    if (p) setFocusLatLng({ lat: p.lat, lng: p.lng })
  }, [playbackIdx, playbackLogs, tab])

  const startPlayback = async (taskId: number) => {
    setTab("playback")
    setPlaybackJobId(taskId)
    setPlaybackPlaying(false)
    setPlaybackIdx(0)
    const logs = await fetchTaskLocationLogs(taskId)
    const pts = logs
      .filter((l) => l.latitude != null && l.longitude != null)
      .map((l) => ({
        lat: Number(l.latitude),
        lng: Number(l.longitude),
        at: l.recordedAt || l.createdAt || new Date().toISOString(),
        within: l.withinGeofence,
      }))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    setPlaybackLogs(pts)
    if (pts[0]) setFocusLatLng({ lat: pts[0].lat, lng: pts[0].lng })
    if (!pts.length) setToast("No GPS history for this job yet")
  }

  const toggleJobFocus = (taskId: number) => {
    setFocusedJobIds((prev) => {
      if (prev.includes(taskId)) return prev.filter((id) => id !== taskId)
      // Allow up to 2 for split compare
      if (prev.length >= 2) return [prev[1], taskId]
      return [...prev, taskId]
    })
    const j = jobs.find((x) => x.taskId === taskId)
    if (j?.propertyLatitude != null && j.propertyLongitude != null) {
      setFocusLatLng({
        lat: Number(j.propertyLatitude),
        lng: Number(j.propertyLongitude),
      })
    }
  }

  const openException = (e: FleetException) => {
    if (e.lat != null && e.lng != null) {
      setFocusLatLng({ lat: e.lat, lng: e.lng })
    }
    if (e.taskId) {
      setFocusedJobIds((prev) =>
        prev.includes(e.taskId!) ? prev : [...prev.slice(-1), e.taskId!]
      )
    }
    setSelected({
      id: e.id,
      lat: e.lat || 0,
      lng: e.lng || 0,
      label: e.title,
      sub: e.detail,
      kind: e.kind === "sos" ? "sos" : "cleaner",
      warn: e.urgency === "critical",
      meta: { taskId: e.taskId, userId: e.userId, sosId: e.id.startsWith("sos-") ? Number(e.id.replace("sos-", "")) : undefined },
    })
    setActionOpen(true)
  }

  const resolveSos = async (id: number, status: "acknowledged" | "resolved") => {
    try {
      setSosBusy(id)
      const res = await adminPatch(`/api/safety/sos/${id}`, {
        status,
        notes: sosNotes || undefined,
      })
      if (res.data?.success !== false) {
        setToast(status === "resolved" ? "SOS resolved" : "SOS acknowledged")
        setSosNotes("")
        setActionOpen(false)
        await loadSos()
      } else setError(res.data?.message || "SOS update failed")
    } catch (e: any) {
      setError(e?.response?.data?.message || "SOS update failed")
    } finally {
      setSosBusy(null)
    }
  }

  if (loading && live.length === 0 && jobs.length === 0) {
    return (
      <div className="space-y-4 p-1">
        <OpsSkeleton rows={3} cols={4} />
        <OpsSkeleton rows={8} cols={4} />
      </div>
    )
  }

  const sosActive = exceptions.filter((e) => e.kind === "sos").length

  return (
    <div className="space-y-4">
      <OpsPageHeader
        eyebrow="Fleet command"
        title="Live monitor"
        subtitle="Realtime GPS · geofence · exceptions · SOS — last known when signal drops"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${
                socketStatus === "live"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : socketStatus === "connecting"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {socketStatus === "live" ? <Wifi size={11} /> : <WifiOff size={11} />}
              {socketStatus === "live" ? "SOCKET LIVE" : socketStatus === "connecting" ? "CONNECTING" : "POLLING"}
            </span>
            <OpsRefreshButton onClick={load} loading={loading} />
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      {/* Coverage health */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <OpsKpi label="Coverage" value={`${coverage.coveragePct}%`} hint="Live GPS on active" />
        <OpsKpi label="Active jobs" value={coverage.activeJobs} />
        <OpsKpi label="Live GPS" value={coverage.withLiveGps} />
        <OpsKpi label="Stale" value={coverage.stale} hint=">3 min" />
        <OpsKpi label="Off-site" value={coverage.offSite} hint={coverage.offSite ? "Outside fence" : undefined} />
        <OpsKpi label="SOS" value={sosActive} hint={sosActive ? "Respond now" : "Clear"} />
      </div>

      {/* AI smart alerts */}
      {aiAlerts.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white dark:border-amber-900/40 dark:from-amber-950/20 dark:to-navy-950">
          <div className="flex items-center justify-between gap-2 border-b border-amber-100 px-4 py-2 dark:border-navy-800">
            <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <Sparkles size={12} />
              {aiGenerated ? "AI ops alerts · your config" : "Ops alerts"}
            </p>
          </div>
          <ul className="divide-y divide-amber-100 dark:divide-navy-800">
            {aiAlerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-navy-900 dark:text-white">{a.title}</p>
                  <p className="text-xs text-slate-500">{a.detail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (a.action === "resolve_sos") setTab("sos")
                    else setTab("exceptions")
                  }}
                  className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-bold uppercase text-white hover:bg-amber-700"
                >
                  Review
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-control-border bg-white p-1 dark:border-navy-800 dark:bg-navy-950">
        {(
          [
            ["fleet", "Fleet map"],
            ["exceptions", `Exceptions (${exceptions.length})`],
            ["sos", `SOS (${sosActive})`],
            ["playback", "Playback"],
            ["timeline", "Timeline"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              tab === id
                ? "bg-navy-950 text-amber-300"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-navy-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <div className="space-y-3">
          {(tab === "fleet" || tab === "playback" || tab === "exceptions") && (
            <OpsCard padding={false}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-control-border px-4 py-2.5 dark:border-navy-800">
                <div className="flex items-center gap-2">
                  <Crosshair size={15} className="text-amber-600" />
                  <p className="text-sm font-bold text-navy-900 dark:text-white">
                    {tab === "playback" ? "Playback map" : "Live fleet map"}
                  </p>
                </div>
                {focusedJobIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFocusedJobIds([])}
                    className="text-[11px] font-bold text-amber-700"
                  >
                    Clear focus ({focusedJobIds.length})
                  </button>
                )}
              </div>
              <div className="p-3">
                <LiveFleetMap
                  markers={mapData.markers}
                  geofences={mapData.geofences}
                  trails={mapData.trails}
                  height={tab === "playback" ? 420 : 460}
                  focusLatLng={focusLatLng}
                  playbackIndex={tab === "playback" ? playbackIdx : null}
                  onMarkerClick={(m) => {
                    setSelected(m)
                    setActionOpen(true)
                    setFocusLatLng({ lat: m.lat, lng: m.lng })
                  }}
                  emptyMessage="No cleaners sharing GPS yet — positions appear when mobile tracking is on"
                />
                <p className="mt-2 font-mono text-[9px] text-slate-400">
                  Read-only · mobile owns pings · stale pins show last known location
                </p>
              </div>
            </OpsCard>
          )}

          {tab === "playback" && (
            <OpsCard>
              <p className="mb-2 font-mono text-[10px] font-bold uppercase text-slate-400">
                Job playback
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {jobs.map((j) => (
                  <button
                    key={j.taskId}
                    type="button"
                    onClick={() => void startPlayback(j.taskId)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                      playbackJobId === j.taskId
                        ? "border-navy-950 bg-navy-950 text-amber-300"
                        : "border-slate-200 dark:border-navy-700"
                    }`}
                  >
                    #{j.taskId} {j.title?.slice(0, 24)}
                  </button>
                ))}
                {jobs.length === 0 && (
                  <p className="text-xs text-slate-400">No active jobs — open a completed job from Jobs to load history later</p>
                )}
              </div>
              {playbackLogs.length > 0 && (
                <div className="space-y-2">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, playbackLogs.length - 1)}
                    value={playbackIdx}
                    onChange={(e) => {
                      setPlaybackPlaying(false)
                      setPlaybackIdx(Number(e.target.value))
                    }}
                    className="w-full accent-amber-600"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10px] text-slate-500">
                      {playbackIdx + 1}/{playbackLogs.length} ·{" "}
                      {new Date(playbackLogs[playbackIdx]?.at || "").toLocaleString()}
                    </p>
                    <button
                      type="button"
                      onClick={() => setPlaybackPlaying((p) => !p)}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white"
                    >
                      {playbackPlaying ? <Pause size={12} /> : <Play size={12} />}
                      {playbackPlaying ? "Pause" : "Play"}
                    </button>
                  </div>
                </div>
              )}
            </OpsCard>
          )}

          {tab === "sos" && (
            <OpsCard padding={false}>
              <div className="border-b border-control-border px-4 py-3 dark:border-navy-800">
                <p className="flex items-center gap-2 text-sm font-bold text-navy-900 dark:text-white">
                  <ShieldAlert size={15} className="text-red-600" /> SOS workflow
                </p>
              </div>
              <div className="max-h-[520px] space-y-2 overflow-y-auto p-3">
                {sos.length === 0 ? (
                  <OpsEmpty message="No active SOS alerts" />
                ) : (
                  sos.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-navy-900 dark:text-white">
                            {personName(a.user) || a.cleanerName || "Cleaner"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {a.createdAt ? new Date(a.createdAt).toLocaleString() : "—"}
                            {a.taskId ? ` · Job #${a.taskId}` : ""}
                          </p>
                        </div>
                        <OpsBadge status={a.status || "active"} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {a.latitude != null && (
                          <a
                            href={mapsUrl(Number(a.latitude), Number(a.longitude))}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase text-amber-700"
                          >
                            <MapPin size={10} /> Map <ExternalLink size={9} />
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={sosBusy === a.id}
                          onClick={() => resolveSos(a.id, "acknowledged")}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase text-amber-800"
                        >
                          Ack
                        </button>
                        <button
                          type="button"
                          disabled={sosBusy === a.id}
                          onClick={() => resolveSos(a.id, "resolved")}
                          className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold uppercase text-white"
                        >
                          Resolve
                        </button>
                        {a.taskId && (
                          <Link
                            href={`${wsHref("jobs")}?task=${a.taskId}`}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-600"
                          >
                            Open job
                          </Link>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </OpsCard>
          )}

          {tab === "timeline" && (
            <OpsCard padding={false}>
              <div className="border-b border-control-border px-4 py-3 dark:border-navy-800">
                <p className="text-sm font-bold text-navy-900 dark:text-white">Incident timeline</p>
              </div>
              <ul className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto dark:divide-navy-900">
                {timeline.length === 0 ? (
                  <li className="p-6">
                    <OpsEmpty message="No recent GPS / SOS events" />
                  </li>
                ) : (
                  timeline.map((ev) => (
                    <li key={ev.id} className="flex gap-3 px-4 py-2.5">
                      <span
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          ev.warn ? "bg-red-500" : "bg-amber-500"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-navy-900 dark:text-white">{ev.label}</p>
                        {ev.detail && (
                          <p className="text-[11px] text-slate-500">{ev.detail}</p>
                        )}
                        <p className="mt-0.5 font-mono text-[9px] text-slate-400">
                          {new Date(ev.at).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </OpsCard>
          )}
        </div>

        {/* Right rail — exceptions + jobs */}
        <div className="space-y-3">
          <OpsCard padding={false}>
            <div className="flex items-center justify-between border-b border-control-border px-4 py-2.5 dark:border-navy-800">
              <p className="flex items-center gap-1.5 text-sm font-bold text-navy-900 dark:text-white">
                <AlertTriangle size={14} className="text-amber-600" /> Triage
              </p>
              <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                {filteredExceptions.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 py-2 dark:border-navy-900">
              {(
                [
                  ["all", "All"],
                  ["sos", "SOS"],
                  ["offsite", "Off-site"],
                  ["stale", "Stale"],
                  ["nogps", "No GPS"],
                  ["break", "Break"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setFilter(id)
                    setTab("exceptions")
                  }}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    filter === id
                      ? "bg-amber-600 text-white"
                      : "bg-slate-100 text-slate-600 dark:bg-navy-900 dark:text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <ul className="max-h-[280px] divide-y divide-slate-100 overflow-y-auto dark:divide-navy-900">
              {filteredExceptions.length === 0 ? (
                <li className="p-4 text-center text-xs text-slate-400">Queue clear</li>
              ) : (
                filteredExceptions.slice(0, 30).map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => openException(e)}
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-amber-50/50 dark:hover:bg-navy-900/50"
                    >
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                          e.urgency === "critical"
                            ? "bg-red-600 text-white"
                            : e.urgency === "high"
                              ? "bg-amber-500 text-white"
                              : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {e.kind === "sos" ? (
                          <ShieldAlert size={13} />
                        ) : e.kind === "offsite" ? (
                          <MapPin size={13} />
                        ) : (
                          <Radio size={13} />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold text-navy-900 dark:text-white">
                          {e.title}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">{e.detail}</span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </OpsCard>

          <OpsCard padding={false}>
            <div className="flex items-center justify-between border-b border-control-border px-4 py-2.5 dark:border-navy-800">
              <p className="flex items-center gap-1.5 text-sm font-bold text-navy-900 dark:text-white">
                <Users size={14} className="text-amber-600" /> Active jobs
              </p>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
              {jobs.length === 0 ? (
                <OpsEmpty message="No jobs tracking" ctaLabel="Open jobs" ctaHref={wsHref("jobs")} />
              ) : (
                jobs.map((job) => {
                  const focused = focusedJobIds.includes(job.taskId)
                  return (
                    <div
                      key={job.taskId}
                      className={`rounded-xl border p-3 ${
                        focused
                          ? "border-amber-500 bg-amber-50/70 dark:border-amber-600 dark:bg-amber-950/20"
                          : job.hasOffSiteCleaner
                            ? "border-red-200 dark:border-red-900/40"
                            : "border-control-border dark:border-navy-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-navy-900 dark:text-white">
                            {job.title || `Job #${job.taskId}`}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                            <MapPin size={10} />
                            <span className="truncate">{job.propertyAddress || "—"}</span>
                          </p>
                        </div>
                        <OpsBadge status={job.status} />
                      </div>
                      <div className="mt-2 space-y-1">
                        {(job.cleaners || []).map((c) => {
                          const sig = signalFromUpdatedAt(c.updatedAt, c.trackerActive)
                          const sv = scheduleVsReality(c, job.scheduledDate)
                          return (
                            <div
                              key={c.userId}
                              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-navy-950/50"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-semibold">{c.name}</p>
                                <p
                                  className={`font-mono text-[9px] ${
                                    sv.late || c.withinGeofence === false
                                      ? "text-red-600"
                                      : "text-slate-400"
                                  }`}
                                >
                                  {sig} · {ageLabel(c.updatedAt)} · {sv.label}
                                  {c.withinGeofence === false ? " · OFF-SITE" : ""}
                                </p>
                              </div>
                              <Clock3 size={11} className="text-slate-400" />
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleJobFocus(job.taskId)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase dark:border-navy-700"
                        >
                          <Focus size={10} /> {focused ? "Unfocus" : "Focus"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void startPlayback(job.taskId)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase dark:border-navy-700"
                        >
                          <Play size={10} /> Playback
                        </button>
                        <Link
                          href={`${wsHref("jobs")}?task=${job.taskId}`}
                          className="inline-flex items-center gap-1 rounded-md bg-navy-950 px-2 py-1 text-[10px] font-bold uppercase text-amber-300"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </OpsCard>
        </div>
      </div>

      {/* Pin action sheet */}
      <OpsDrawer
        open={actionOpen && !!selected}
        onClose={() => setActionOpen(false)}
        eyebrow="Actions"
        title={selected?.label || "Selection"}
        subtitle={selected?.sub || "Confirm before any change"}
        footer={
          <OpsSecondaryButton onClick={() => setActionOpen(false)}>Close</OpsSecondaryButton>
        }
      >
        {selected && (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-navy-800 dark:bg-navy-950">
              <p className="font-mono text-[10px] uppercase text-slate-400">{selected.kind}</p>
              <p className="mt-1 font-semibold text-navy-900 dark:text-white">{selected.label}</p>
              {selected.sub && <p className="mt-0.5 text-slate-500">{selected.sub}</p>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {selected.lat != null && selected.lng != null && Number.isFinite(selected.lat) && (
                <a
                  href={mapsUrl(selected.lat, selected.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2.5 text-xs font-bold dark:border-navy-700"
                >
                  <MapPin size={14} /> Open maps
                </a>
              )}
              {selected.meta?.taskId != null && (
                <Link
                  href={`${wsHref("jobs")}?task=${selected.meta.taskId}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-navy-950 py-2.5 text-xs font-bold text-amber-300"
                >
                  Open job
                </Link>
              )}
              {selected.meta?.taskId != null && (
                <Link
                  href={`${wsHref("jobs")}?task=${selected.meta.taskId}&smart=1`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 py-2.5 text-xs font-bold text-white"
                >
                  <Sparkles size={14} /> Reassign AI
                </Link>
              )}
              <a
                href={`sms:`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2.5 text-xs font-bold dark:border-navy-700"
              >
                <MessageSquare size={14} /> Message
              </a>
              <a
                href={`tel:`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2.5 text-xs font-bold dark:border-navy-700"
              >
                <Phone size={14} /> Call
              </a>
            </div>
            {selected.kind === "sos" && selected.meta?.sosId != null && (
              <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
                <OpsField label="SOS notes">
                  <textarea
                    value={sosNotes}
                    onChange={(e) => setSosNotes(e.target.value)}
                    rows={2}
                    className={`${opsFieldCls} resize-none`}
                    placeholder="What you did / who you called…"
                  />
                </OpsField>
                <div className="flex gap-2">
                  <OpsSecondaryButton
                    onClick={() => resolveSos(Number(selected.meta!.sosId), "acknowledged")}
                    disabled={sosBusy === selected.meta.sosId}
                  >
                    Acknowledge
                  </OpsSecondaryButton>
                  <OpsPrimaryButton
                    onClick={() => resolveSos(Number(selected.meta!.sosId), "resolved")}
                    disabled={sosBusy === selected.meta.sosId}
                  >
                    Resolve SOS
                  </OpsPrimaryButton>
                </div>
              </div>
            )}
            {selected.meta?.taskId != null && (
              <button
                type="button"
                onClick={() => {
                  setActionOpen(false)
                  void startPlayback(Number(selected.meta!.taskId))
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2.5 text-xs font-bold dark:border-navy-700"
              >
                <Play size={14} /> Playback this job
              </button>
            )}
            <button
              type="button"
              onClick={() => setActionOpen(false)}
              className="inline-flex w-full items-center justify-center gap-1 text-xs text-slate-400"
            >
              <X size={12} /> Dismiss
            </button>
          </div>
        )}
      </OpsDrawer>
    </div>
  )
}
