"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsKpi,
  OpsRefreshButton,
  OpsEmpty,
  OpsBadge,
  OpsCard,
  OpsSkeleton,
} from "@/components/ops/OpsChrome"
import LiveMapPanel, { type MapPoint } from "@/components/ops/LiveMapPanel"
import {
  fetchLiveCleaners,
  fetchActiveTrackingJobs,
  type LiveCleaner,
  type ActiveTrackingJob,
} from "@/lib/ops-tracking"
import { useOpsRealtime } from "@/hooks/useOpsRealtime"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import { Crosshair, MapPin, Radio, Clock3, Users } from "lucide-react"

export default function LiveMonitorPage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const { href: wsHref } = useCompanyWorkspace()
  const [live, setLive] = useState<LiveCleaner[]>([])
  const [activeJobs, setActiveJobs] = useState<ActiveTrackingJob[]>([])
  const [liveCount, setLiveCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [focusedJobId, setFocusedJobId] = useState<number | null>(null)

  const loadTracking = useCallback(async () => {
    const [liveList, active] = await Promise.all([
      fetchLiveCleaners(),
      fetchActiveTrackingJobs(),
    ])
    setLive(liveList)
    setActiveJobs(active.jobs)
    setLiveCount(active.liveCount || liveList.filter((c) => c.isLive).length)
  }, [])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      await loadTracking()
    } finally {
      setLoading(false)
    }
  }, [loadTracking])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const id = setInterval(() => {
      loadTracking().catch(() => undefined)
    }, 30000)
    return () => clearInterval(id)
  }, [loadTracking])

  useOpsRealtime(() => {
    loadTracking().catch(() => undefined)
  }, true)

  const offSite = useMemo(() => {
    const fromLive = live.filter((c) => c.withinGeofence === false).length
    if (fromLive > 0) return fromLive
    return activeJobs.reduce(
      (n, j) => n + (j.cleaners || []).filter((c) => c.withinGeofence === false).length,
      0
    )
  }, [live, activeJobs])

  const mapPoints = useMemo((): MapPoint[] => {
    const pts: MapPoint[] = []
    const focusCleanerIds =
      focusedJobId == null
        ? null
        : new Set(
            (activeJobs.find((j) => j.taskId === focusedJobId)?.cleaners || []).map(
              (c) => c.userId
            )
          )

    for (const j of activeJobs) {
      if (focusedJobId != null && j.taskId !== focusedJobId) continue
      if (j.propertyLatitude != null && j.propertyLongitude != null) {
        pts.push({
          id: `prop-${j.taskId}`,
          lat: Number(j.propertyLatitude),
          lng: Number(j.propertyLongitude),
          label: j.propertyAddress || j.title || `Job #${j.taskId}`,
          sub: j.status,
          kind: "property",
        })
      }
      for (const c of j.cleaners || []) {
        if (c.latitude == null || c.longitude == null) continue
        pts.push({
          id: `job-c-${j.taskId}-${c.userId}`,
          lat: Number(c.latitude),
          lng: Number(c.longitude),
          label: c.name,
          sub: [
            c.trackerActive ? "Live" : "Idle",
            `${c.workMinutes || 0}m`,
            c.withinGeofence === false ? "Off-site" : c.withinGeofence ? "On-site" : null,
          ]
            .filter(Boolean)
            .join(" · "),
          kind: "cleaner",
          warn: c.withinGeofence === false,
        })
      }
    }

    for (const c of live) {
      if (focusCleanerIds && !focusCleanerIds.has(c.userId)) continue
      if (c.latitude != null && c.longitude != null) {
        const already = pts.some((p) => p.id === `job-c-${c.taskId}-${c.userId}`)
        if (!already) {
          pts.push({
            id: `c-${c.userId}`,
            lat: Number(c.latitude),
            lng: Number(c.longitude),
            label: c.name,
            sub: [
              c.isLive ? "Live" : "Stale",
              c.taskTitle,
              c.withinGeofence === false ? "Off-site" : null,
            ]
              .filter(Boolean)
              .join(" · "),
            kind: "cleaner",
            warn: c.withinGeofence === false,
          })
        }
      }
      if (
        focusedJobId == null &&
        c.propertyLatitude != null &&
        c.propertyLongitude != null
      ) {
        const propId = `p-${c.userId}`
        if (!pts.some((p) => p.id === propId || (p.kind === "property" && p.lat === Number(c.propertyLatitude)))) {
          pts.push({
            id: propId,
            lat: Number(c.propertyLatitude),
            lng: Number(c.propertyLongitude),
            label: c.propertyAddress || "Property",
            sub: c.taskTitle || `For ${c.name}`,
            kind: "property",
          })
        }
      }
    }

    return pts
  }, [live, activeJobs, focusedJobId])

  if (loading && live.length === 0 && activeJobs.length === 0) {
    return (
      <div className="space-y-4 p-1">
        <OpsSkeleton rows={3} cols={3} />
        <OpsSkeleton rows={8} cols={4} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Field ops"
        title="Live job monitor"
        subtitle="Active cleaners on the map"
        actions={<OpsRefreshButton onClick={load} loading={loading} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <OpsKpi label="Live cleaners" value={liveCount} hint="Tracking on" />
        <OpsKpi label="Active jobs" value={activeJobs.length} />
        <OpsKpi
          label="Off-site"
          value={offSite}
          hint={offSite ? "Outside geofence" : "All on-site"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        <OpsCard padding={false}>
          <div className="flex items-center justify-between gap-2 border-b border-control-border px-4 py-3 dark:border-navy-800">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-950 text-amber-400">
                <Crosshair size={16} />
              </div>
              <div>
                <p className="text-sm font-bold text-navy-900 dark:text-white">Live map</p>
                <p className="font-mono text-[10px] text-slate-400">
                  Cleaners + property pins · auto-refresh 30s
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Radio size={10} className="animate-pulse" />
              LIVE
            </span>
          </div>
          <div className="p-3 sm:p-4">
            <LiveMapPanel
              points={mapPoints}
              height={440}
              emptyMessage={
                loading
                  ? "Loading live positions…"
                  : "No cleaners sharing GPS yet — start a tracked job to see the map"
              }
            />
            {focusedJobId != null && (
              <button
                type="button"
                onClick={() => setFocusedJobId(null)}
                className="mt-3 text-xs font-semibold text-amber-700 hover:text-amber-800"
              >
                Clear job focus · show everyone
              </button>
            )}
          </div>
        </OpsCard>

        <OpsCard padding={false}>
          <div className="flex items-center justify-between border-b border-control-border px-4 py-3 dark:border-navy-800">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-amber-600" />
              <p className="text-sm font-bold text-navy-900 dark:text-white">Active jobs</p>
            </div>
            <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
              {activeJobs.length}
            </span>
          </div>

          <div className="max-h-[520px] space-y-3 overflow-y-auto p-3">
            {activeJobs.length === 0 ? (
              <OpsEmpty
                message="No jobs are being tracked right now"
                ctaLabel="Open jobs"
                ctaHref={wsHref("jobs")}
              />
            ) : (
              activeJobs.map((job) => {
                const focused = focusedJobId === job.taskId
                return (
                  <button
                    key={job.taskId}
                    type="button"
                    onClick={() =>
                      setFocusedJobId((id) => (id === job.taskId ? null : job.taskId))
                    }
                    className={`w-full rounded-xl border p-3.5 text-left transition ${
                      focused
                        ? "border-amber-500 bg-amber-50/80 shadow-sm dark:border-amber-600 dark:bg-amber-950/20"
                        : job.hasOffSiteCleaner
                          ? "border-red-200 bg-red-50/40 hover:border-red-300 dark:border-red-900/40 dark:bg-red-950/10"
                          : "border-control-border bg-white hover:border-amber-300 dark:border-navy-800 dark:bg-control-darkCard dark:hover:border-amber-700/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-navy-900 dark:text-white">
                          {job.title || `Job #${job.taskId}`}
                        </p>
                        <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                          <MapPin size={12} className="mt-0.5 flex-shrink-0 text-slate-400" />
                          <span className="line-clamp-2">
                            {job.propertyAddress || "No address"}
                          </span>
                        </p>
                      </div>
                      <OpsBadge status={job.status} />
                    </div>

                    <div className="mt-3 space-y-2">
                      {(job.cleaners || []).length === 0 ? (
                        <p className="text-xs text-slate-400">No cleaners on this job</p>
                      ) : (
                        (job.cleaners || []).map((c) => (
                          <div
                            key={c.userId}
                            className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-navy-950/60"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-navy-900 dark:text-slate-100">
                                {c.name}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-slate-400">
                                <span className="inline-flex items-center gap-0.5">
                                  <Clock3 size={10} />
                                  {c.workMinutes || 0}m
                                </span>
                                <span>·</span>
                                <span
                                  className={
                                    c.withinGeofence === false
                                      ? "font-bold text-red-600"
                                      : c.withinGeofence
                                        ? "text-emerald-600"
                                        : ""
                                  }
                                >
                                  {c.withinGeofence === false
                                    ? "Off-site"
                                    : c.withinGeofence
                                      ? "On-site"
                                      : "Unknown"}
                                </span>
                              </p>
                            </div>
                            {c.trackerActive ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                                Live
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-slate-500 dark:bg-navy-800">
                                Idle
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-slate-400">
                      <span>{job.gpsPingCount} GPS pings</span>
                      <span>{focused ? "Focused on map" : "Click to focus"}</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {activeJobs.length === 0 && live.length === 0 ? null : activeJobs.length > 0 ? null : (
            <div className="border-t border-control-border px-4 py-3 dark:border-navy-800">
              <Link
                href={wsHref("jobs")}
                className="text-xs font-bold text-amber-700 hover:text-amber-800"
              >
                Go to jobs →
              </Link>
            </div>
          )}
        </OpsCard>
      </div>
    </div>
  )
}
