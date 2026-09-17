"use client"

import { useEffect, useState } from "react"
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
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import { AlertTriangle, CheckCircle, Loader2, ExternalLink } from "lucide-react"

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
  return n || u.email || "—"
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
  const [cleaners, setCleaners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [sosTab, setSosTab] = useState("active")
  const [sosPage, setSosPage] = useState(1)
  const [cleanerPage, setCleanerPage] = useState(1)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const statusParam = sosTab === "active" ? "active" : undefined
      const [sosRes, cleanersRes] = await Promise.all([
        adminGet("/api/safety/sos", {
          params: statusParam ? { status: statusParam } : {},
        }),
        adminGet("/api/users", { params: { role: "CLEANER" } }).catch(() => null),
      ])

      if (sosRes.data?.success !== false) setSos(asList(sosRes.data?.data))
      else {
        setSos([])
        setError(sosRes.data?.message || "Failed to load SOS")
      }

      const cl = asList(cleanersRes?.data?.data).filter(
        (u) => !u.role || u.role === "CLEANER"
      )
      setCleaners(cl)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load safety data")
      setSos([])
      setCleaners([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [sosTab])

  useEffect(() => {
    setSosPage(1)
  }, [sosTab])

  const acknowledge = async (id: number) => {
    try {
      setBusyId(id)
      const res = await adminPatch(`/api/safety/sos/${id}`, { status: "resolved" })
      if (res.data?.success !== false) {
        setToast("SOS acknowledged")
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to resolve SOS")
    } finally {
      setBusyId(null)
    }
  }

  const safeSos = Array.isArray(sos) ? sos : []
  const safeCleaners = Array.isArray(cleaners) ? cleaners : []
  const activeCount = safeSos.filter((a) =>
    ["active", "open", "acknowledged"].includes(String(a.status || "").toLowerCase())
  ).length
  const sosSlice = safeSos.slice((sosPage - 1) * PAGE_SIZE, sosPage * PAGE_SIZE)
  const cleanerSlice = safeCleaners.slice(
    (cleanerPage - 1) * PAGE_SIZE,
    cleanerPage * PAGE_SIZE
  )

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Safety"
        title="SOS & tracking"
        subtitle="Active emergencies and cleaner tracking overview"
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <OpsKpi label="SOS alerts" value={safeSos.length} />
        <OpsKpi label="Active" value={activeCount} hint={activeCount ? "Resolve ASAP" : undefined} />
        <OpsKpi label="Cleaners" value={safeCleaners.length} />
      </div>

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
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
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
                  const isOpen = st === "active" || st === "open" || st === "acknowledged"
                  const lat = a.latitude
                  const lng = a.longitude
                  return (
                    <tr
                      key={a.id}
                      className={isOpen ? "bg-amber-50/40 dark:bg-amber-950/10" : "hover:bg-slate-50/80"}
                    >
                      <td className={`${opsTd} font-bold text-navy-900 dark:text-white`}>
                        {personName(a.user)}
                        {a.user?.phone && (
                          <p className="font-mono text-[10px] font-normal text-slate-400">
                            {a.user.phone}
                          </p>
                        )}
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
                              className="rounded-lg p-1.5 text-navy-700 hover:bg-navy-50 dark:text-amber-400"
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

      <OpsTableShell
        title="Cleaner tracking overview"
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {safeCleaners.length}
          </span>
        }
      >
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : safeCleaners.length === 0 ? (
          <OpsEmpty message="No cleaners found" />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Name</th>
                  <th className={opsTh}>Email</th>
                  <th className={opsTh}>Phone</th>
                  <th className={opsTh}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {cleanerSlice.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80">
                    <td className={`${opsTd} font-bold text-navy-900 dark:text-white`}>
                      {personName(c)}
                    </td>
                    <td className={`${opsTd} font-mono text-xs text-slate-500`}>{c.email}</td>
                    <td className={`${opsTd} text-sm`}>{c.phone || "—"}</td>
                    <td className={opsTd}>
                      <OpsBadge status={c.isActive === false ? "inactive" : "active"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <OpsPagination
              page={cleanerPage}
              pageSize={PAGE_SIZE}
              total={safeCleaners.length}
              onPageChange={setCleanerPage}
            />
          </>
        )}
      </OpsTableShell>
    </div>
  )
}
