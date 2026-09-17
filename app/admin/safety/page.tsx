"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import { adminGet, adminPatch, formatDate } from "@/lib/admin-session"
import {
  OpsPageHeader,
  OpsKpi,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsTableShell,
  OpsPagination,
  OpsCard,
  OpsSkeleton,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import LiveMapPanel from "@/components/ops/LiveMapPanel"
import {
  fetchLiveCleaners,
  fetchActiveTrackingJobs,
  type LiveCleaner,
  type ActiveTrackingJob,
} from "@/lib/ops-tracking"
import { useOpsRealtime } from "@/hooks/useOpsRealtime"
import { useUrlQueryState } from "@/hooks/useUrlQueryState"
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  ExternalLink,
  Radio,
  MapPin,
} from "lucide-react"

const PAGE_SIZE = 10

function asList(data: any): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.alerts)) return data.alerts
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.users)) return data.users
  return []
}

function personName(u: any) {
  if (!u) return "—"
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ").trim()
  return n || u.email || u.name || "—"
}

export default function SafetyPage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const [sos, setSos] = useState<any[]>([])
  const [live, setLive] = useState<LiveCleaner[]>([])
  const [activeJobs, setActiveJobs] = useState<ActiveTrackingJob[]>([])
  const [liveCount, setLiveCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [sosTab, setSosTab] = useState("active")
  const [viewTab, setViewTab] = useUrlQueryState("tab", "live")
  const [sosPage, setSosPage] = useState(1)
  const [livePage, setLivePage] = useState(1)
  const [jobsPage, setJobsPage] = useState(1)
  const [busyId, setBusyId] = useState<number | null>(null)

  const loadSos = useCallback(async () => {
    const statusParam = sosTab === "active" ? "active" : undefined
    const sosRes = await adminGet("/api/safety/sos", {
      params: statusParam ? { status: statusParam } : {},
    })
    if (sosRes.data?.success !== false) setSos(asList(sosRes.data?.data))
    else setSos([])
  }, [sosTab])

  const loadTracking = useCallback(async () => {
    const [liveList, active] = await Promise.all([
      fetchLiveCleaners(),
      fetchActiveTrackingJobs(),
    ])
    setLive(liveList)
    setActiveJobs(active.jobs)
    setLiveCount(active.liveCount || liveList.filter((c) => c.isLive).length)
  }, [])

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      await Promise.all([loadSos(), loadTracking()])
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load safety data")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [sosTab])

  useEffect(() => {
    const id = setInterval(() => {
      loadTracking().catch(() => undefined)
    }, 30000)
    return () => clearInterval(id)
  }, [loadTracking])

  useOpsRealtime(() => {
    loadTracking().catch(() => undefined)
  }, true)

  useEffect(() => {
    setSosPage(1)
  }, [sosTab])

  const acknowledge = async (id: number) => {
    try {
      setBusyId(id)
      const res = await adminPatch(`/api/safety/sos/${id}`, { status: "resolved" })
      if (res.data?.success !== false) {
        setToast("SOS acknowledged")
        await loadSos()
      } else setError(res.data?.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to resolve SOS")
    } finally {
      setBusyId(null)
    }
  }

  const safeSos = Array.isArray(sos) ? sos : []
  const activeCount = safeSos.filter((a) =>
    ["active", "open", "acknowledged"].includes(String(a.status || "").toLowerCase())
  ).length
  const offSite = live.filter((c) => c.withinGeofence === false).length

  const mapPoints = useMemo(() => {
    const pts: {
      id: string | number
      lat: number
      lng: number
      label: string
      sub?: string
      kind?: "cleaner" | "property" | "log"
      warn?: boolean
    }[] = []
    for (const c of live) {
      if (c.latitude != null && c.longitude != null) {
        pts.push({
          id: `c-${c.userId}`,
          lat: Number(c.latitude),
          lng: Number(c.longitude),
          label: c.name,
          sub: [
            c.isLive ? "Live" : "Stale",
            c.taskTitle,
            c.propertyAddress,
            c.withinGeofence === false ? "Off-site" : null,
          ]
            .filter(Boolean)
            .join(" · "),
          kind: "cleaner",
          warn: c.withinGeofence === false,
        })
      }
      if (c.propertyLatitude != null && c.propertyLongitude != null) {
        pts.push({
          id: `p-${c.userId}`,
          lat: Number(c.propertyLatitude),
          lng: Number(c.propertyLongitude),
          label: c.propertyAddress || "Property",
          sub: `Job for ${c.name}`,
          kind: "property",
        })
      }
    }
    return pts
  }, [live])

  const sosSlice = safeSos.slice((sosPage - 1) * PAGE_SIZE, sosPage * PAGE_SIZE)
  const liveSlice = live.slice((livePage - 1) * PAGE_SIZE, livePage * PAGE_SIZE)
  const jobsSlice = activeJobs.slice((jobsPage - 1) * PAGE_SIZE, jobsPage * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Safety"
        title="Live GPS & SOS"
        subtitle="See cleaner locations in real time, active jobs, and emergencies"
        actions={<OpsRefreshButton onClick={load} loading={loading} />}
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      {activeCount > 0 && (
        <section className="flex items-center gap-3 rounded-xl border border-navy-800 bg-navy-900 p-4 text-white">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-400">
            <AlertTriangle size={16} />
          </div>
          <div className="font-mono text-xs">
            <span className="font-bold text-amber-400">SOS ACTIVE</span>
            <span className="text-slate-400"> · </span>
            <span className="text-slate-200">
              {activeCount} alert{activeCount === 1 ? "" : "s"} need attention
            </span>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OpsKpi label="Live cleaners" value={liveCount} hint="Tracking on" />
        <OpsKpi label="Active jobs" value={activeJobs.length} />
        <OpsKpi
          label="Off-site"
          value={offSite}
          hint={offSite ? "Outside geofence" : undefined}
        />
        <OpsKpi label="SOS active" value={activeCount} />
      </div>

      <OpsCard padding={false}>
        <div className="flex flex-wrap gap-1 border-b border-control-border bg-slate-50 p-2 dark:border-navy-800 dark:bg-navy-950">
          {(
            [
              ["live", "Live map"],
              ["jobs", "Active jobs"],
              ["sos", "SOS"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewTab(id)}
              className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase ${
                viewTab === id
                  ? "bg-white text-amber-700 shadow-sm dark:bg-navy-800"
                  : "text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && viewTab === "live" && live.length === 0 ? (
          <div className="p-4">
            <OpsSkeleton rows={6} cols={4} />
          </div>
        ) : null}

        {viewTab === "live" && !(loading && live.length === 0) && (
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400">
              <Radio size={12} className="text-amber-600" />
              Auto-refresh every 30s · same feed as mobile tracking
            </div>
            <LiveMapPanel
              points={mapPoints}
              height={320}
              emptyMessage={
                loading ? "Loading live positions…" : "No cleaners sharing live GPS right now"
              }
            />

            <OpsTableShell
              title="Live cleaners"
              badge={
                <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                  {live.length}
                </span>
              }
            >
              {live.length === 0 ? (
                <OpsEmpty message="No live positions" />
              ) : (
                <>
                  <table className="w-full text-left">
                    <thead className="border-b border-control-border bg-slate-50 dark:bg-navy-950">
                      <tr>
                        <th className={opsTh}>Cleaner</th>
                        <th className={opsTh}>Job</th>
                        <th className={opsTh}>Geofence</th>
                        <th className={opsTh}>Updated</th>
                        <th className={`${opsTh} text-right`}>Map</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                      {liveSlice.map((c) => (
                        <tr
                          key={c.userId}
                          className={
                            c.withinGeofence === false
                              ? "bg-red-50/50 dark:bg-red-950/10"
                              : "hover:bg-slate-50/80"
                          }
                        >
                          <td className={opsTd}>
                            <p className="font-bold text-navy-900 dark:text-white">{c.name}</p>
                            <p className="font-mono text-[10px] text-slate-400">
                              {c.isLive ? "LIVE" : "LAST SEEN"}
                            </p>
                          </td>
                          <td className={opsTd}>
                            <p className="text-sm">{c.taskTitle || "—"}</p>
                            <p className="text-xs text-slate-500">{c.propertyAddress || ""}</p>
                          </td>
                          <td className={opsTd}>
                            {c.withinGeofence === false ? (
                              <OpsBadge status="expired" />
                            ) : c.withinGeofence ? (
                              <OpsBadge status="active" />
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                            {c.distanceFromProperty != null && (
                              <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                                {Math.round(Number(c.distanceFromProperty))}m
                              </p>
                            )}
                          </td>
                          <td className={`${opsTd} text-xs text-slate-500`}>
                            {c.updatedAt ? formatDate(c.updatedAt) : "—"}
                          </td>
                          <td className={`${opsTd} text-right`}>
                            {c.latitude != null && c.longitude != null && (
                              <a
                                href={`https://maps.google.com/?q=${c.latitude},${c.longitude}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex rounded-lg p-1.5 text-amber-700 hover:bg-amber-50"
                              >
                                <MapPin size={14} />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <OpsPagination
                    page={livePage}
                    pageSize={PAGE_SIZE}
                    total={live.length}
                    onPageChange={setLivePage}
                  />
                </>
              )}
            </OpsTableShell>
          </div>
        )}

        {viewTab === "jobs" && (
          <div className="p-4">
            <OpsTableShell
              title="Jobs with active tracking"
              badge={
                <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                  {activeJobs.length}
                </span>
              }
            >
              {activeJobs.length === 0 ? (
                <OpsEmpty message="No active tracked jobs" />
              ) : (
                <>
                  <table className="w-full text-left">
                    <thead className="border-b border-control-border bg-slate-50 dark:bg-navy-950">
                      <tr>
                        <th className={opsTh}>Job</th>
                        <th className={opsTh}>Property</th>
                        <th className={opsTh}>Cleaners</th>
                        <th className={opsTh}>GPS</th>
                        <th className={opsTh}>Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                      {jobsSlice.map((j) => (
                        <tr
                          key={j.taskId}
                          className={
                            j.hasOffSiteCleaner
                              ? "bg-amber-50/40 dark:bg-amber-950/10"
                              : "hover:bg-slate-50/80"
                          }
                        >
                          <td className={`${opsTd} font-bold`}>
                            #{j.taskId} · {j.title}
                          </td>
                          <td className={`${opsTd} text-xs`}>{j.propertyAddress || "—"}</td>
                          <td className={opsTd}>
                            <div className="space-y-1">
                              {(j.cleaners || []).map((c) => (
                                <p key={c.userId} className="text-xs">
                                  <span className="font-semibold">{c.name}</span>
                                  {c.trackerActive && (
                                    <span className="ml-1 font-mono text-[9px] text-emerald-600">
                                      TRACKING
                                    </span>
                                  )}
                                  {c.withinGeofence === false && (
                                    <span className="ml-1 font-mono text-[9px] text-red-600">
                                      OFF-SITE
                                    </span>
                                  )}
                                </p>
                              ))}
                            </div>
                          </td>
                          <td className={`${opsTd} font-mono text-xs`}>
                            {j.gpsPingCount} pings
                            {j.lastGpsAt && (
                              <p className="text-[10px] text-slate-400">
                                {formatDate(j.lastGpsAt)}
                              </p>
                            )}
                          </td>
                          <td className={opsTd}>
                            <OpsBadge status={j.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <OpsPagination
                    page={jobsPage}
                    pageSize={PAGE_SIZE}
                    total={activeJobs.length}
                    onPageChange={setJobsPage}
                  />
                </>
              )}
            </OpsTableShell>
          </div>
        )}

        {viewTab === "sos" && (
          <div className="p-4">
            <OpsTableShell
              title="SOS alerts"
              badge={
                <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
                  {safeSos.length}
                </span>
              }
              tabs={[
                { id: "active", label: "Active" },
                { id: "all", label: "All" },
              ]}
              activeTab={sosTab}
              onTabChange={setSosTab}
            >
              {loading ? (
                <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
              ) : safeSos.length === 0 ? (
                <OpsEmpty message="No SOS alerts" />
              ) : (
                <>
                  <table className="w-full text-left">
                    <thead className="border-b border-control-border bg-slate-50 dark:bg-navy-950">
                      <tr>
                        <th className={opsTh}>Cleaner</th>
                        <th className={opsTh}>Task / location</th>
                        <th className={opsTh}>When</th>
                        <th className={opsTh}>Status</th>
                        <th className={`${opsTh} text-right`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                      {sosSlice.map((a) => {
                        const st = String(a.status || "active").toLowerCase()
                        const isOpen =
                          st === "active" || st === "open" || st === "acknowledged"
                        const lat = a.latitude
                        const lng = a.longitude
                        return (
                          <tr
                            key={a.id}
                            className={
                              isOpen
                                ? "bg-amber-50/40 dark:bg-amber-950/10"
                                : "hover:bg-slate-50/80"
                            }
                          >
                            <td className={`${opsTd} font-bold text-navy-900 dark:text-white`}>
                              {personName(a.user)}
                            </td>
                            <td className={opsTd}>
                              <p className="text-sm">{a.task?.title || "—"}</p>
                              <p className="text-xs text-slate-500">
                                {a.task?.property?.address || a.notes || "—"}
                              </p>
                            </td>
                            <td className={`${opsTd} text-xs text-slate-500`}>
                              {formatDate(a.createdAt)}
                            </td>
                            <td className={opsTd}>
                              <OpsBadge status={a.status || "active"} />
                            </td>
                            <td className={`${opsTd} text-right`}>
                              <div className="inline-flex items-center gap-1">
                                {lat != null && lng != null && (
                                  <a
                                    href={`https://maps.google.com/?q=${lat},${lng}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg p-1.5 text-navy-700 hover:bg-navy-50"
                                    title="Map"
                                  >
                                    <ExternalLink size={14} />
                                  </a>
                                )}
                                {isOpen && (
                                  <button
                                    type="button"
                                    disabled={busyId === a.id}
                                    onClick={() => acknowledge(a.id)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700 hover:bg-emerald-50"
                                  >
                                    {busyId === a.id ? (
                                      <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                      <CheckCircle size={12} />
                                    )}
                                    Resolve
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <OpsPagination
                    page={sosPage}
                    pageSize={PAGE_SIZE}
                    total={safeSos.length}
                    onPageChange={setSosPage}
                  />
                </>
              )}
            </OpsTableShell>
          </div>
        )}
      </OpsCard>
    </div>
  )
}
