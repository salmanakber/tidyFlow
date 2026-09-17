"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, adminPatch, formatDate } from "@/lib/admin-session"
import { Check, X, Loader2 } from "lucide-react"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsKpi,
  OpsTableShell,
  OpsPagination,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"

const PAGE_SIZE = 10

type Tab = "hours" | "edits"

export default function WorkingHoursPage() {
  return (
    <AdminLayout>
      <ProtectedPage>
        <Content />
      </ProtectedPage>
    </AdminLayout>
  )
}

function Content() {
  const [tab, setTab] = useState<Tab>("hours")
  const [hours, setHours] = useState<any[]>([])
  const [edits, setEdits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [busyId, setBusyId] = useState<number | null>(null)
  const [page, setPage] = useState(1)

  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 30)

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const [hRes, eRes] = await Promise.all([
        adminGet("/api/working-hours", {
          params: {
            startDate: start.toISOString().slice(0, 10),
            endDate: end.toISOString().slice(0, 10),
          },
        }),
        adminGet("/api/hours-edit-requests", { params: { status: "pending" } }),
      ])
      if (hRes.data.success) {
        const raw = hRes.data.data
        setHours(Array.isArray(raw) ? raw : [])
      } else setHours([])
      if (eRes.data.success) {
        const raw = eRes.data.data
        setEdits(Array.isArray(raw) ? raw : [])
      } else setEdits([])
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load")
      setHours([])
      setEdits([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [tab])

  const approveHours = async (id: number, action: "approve" | "reject") => {
    try {
      setBusyId(id)
      const res = await adminPost(`/api/working-hours/${id}/approve`, { action })
      if (res.data.success) {
        setToast(`Hours ${action}d`)
        await load()
      } else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    } finally {
      setBusyId(null)
    }
  }

  const reviewEdit = async (id: number, action: "approve" | "reject") => {
    try {
      setBusyId(id)
      const res = await adminPatch(`/api/hours-edit-requests/${id}`, { action })
      if (res.data.success) {
        setToast(`Edit request ${action}d`)
        await load()
      } else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    } finally {
      setBusyId(null)
    }
  }

  const safeHours = Array.isArray(hours) ? hours : []
  const safeEdits = Array.isArray(edits) ? edits : []
  const pendingHours = safeHours.filter((h) => h.status === "pending").length
  const activeList = tab === "hours" ? safeHours : safeEdits
  const pageSlice = activeList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Manage"
        title="Working hours"
        subtitle="Approve submitted hours and GPS duration edit requests"
        actions={<OpsRefreshButton onClick={load} loading={loading} />}
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3">
        <OpsKpi label="Pending hours" value={pendingHours} />
        <OpsKpi label="Pending edits" value={safeEdits.length} />
      </div>

      <OpsTableShell
        title={tab === "hours" ? "Hour submissions" : "Edit requests"}
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {activeList.length}
          </span>
        }
        tabs={[
          { id: "hours", label: "Submissions" },
          { id: "edits", label: "Edit requests" },
        ]}
        activeTab={tab}
        onTabChange={(id) => setTab(id as Tab)}
      >
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : tab === "hours" ? (
          safeHours.length === 0 ? (
            <OpsEmpty message="No records in the last 30 days" />
          ) : (
            <>
              <table className="w-full text-left">
                <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                  <tr>
                    <th className={opsTh}>Staff</th>
                    <th className={opsTh}>Date</th>
                    <th className={opsTh}>Hours</th>
                    <th className={opsTh}>Notes</th>
                    <th className={opsTh}>Status</th>
                    <th className={`${opsTh} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                  {pageSlice.map((h: any) => (
                    <tr key={h.id} className="hover:bg-slate-50/80">
                      <td className={`${opsTd} font-semibold`}>
                        {[h.user?.firstName, h.user?.lastName].filter(Boolean).join(" ") ||
                          h.user?.email ||
                          `#${h.userId}`}
                      </td>
                      <td className={opsTd}>{formatDate(h.date)}</td>
                      <td className={`${opsTd} font-mono font-bold`}>
                        {Number(h.hours).toFixed(2)}
                      </td>
                      <td className={`${opsTd} max-w-[200px] truncate text-slate-500`}>
                        {h.description || "—"}
                      </td>
                      <td className={opsTd}>
                        <OpsBadge status={h.status} />
                      </td>
                      <td className={`${opsTd} text-right`}>
                        {h.status === "pending" && (
                          <div className="inline-flex gap-1">
                            <IconBtn
                              busy={busyId === h.id}
                              onClick={() => approveHours(h.id, "approve")}
                              ok
                            />
                            <IconBtn
                              busy={busyId === h.id}
                              onClick={() => approveHours(h.id, "reject")}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <OpsPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={safeHours.length}
                onPageChange={setPage}
              />
            </>
          )
        ) : safeEdits.length === 0 ? (
          <OpsEmpty message="No pending duration edit requests" />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Job</th>
                  <th className={opsTh}>Requester</th>
                  <th className={opsTh}>Current → Proposed</th>
                  <th className={opsTh}>Reason</th>
                  <th className={`${opsTh} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {pageSlice.map((e: any) => (
                  <tr key={e.id} className="hover:bg-slate-50/80">
                    <td className={opsTd}>
                      <div className="font-semibold">{e.taskTitle || `Task #${e.taskId}`}</div>
                      <div className="text-xs text-slate-400">{e.propertyAddress}</div>
                    </td>
                    <td className={opsTd}>
                      {[e.requester?.firstName, e.requester?.lastName].filter(Boolean).join(" ") ||
                        "—"}
                    </td>
                    <td className={`${opsTd} font-mono`}>
                      {e.currentDurationMinutes ?? "—"}m →{" "}
                      <span className="font-bold text-amber-700">{e.proposedDurationMinutes}m</span>
                      {e.geoFlagged && (
                        <span className="ml-2 text-[10px] font-bold uppercase text-red-600">
                          GPS flag
                        </span>
                      )}
                    </td>
                    <td className={`${opsTd} max-w-[180px] truncate text-slate-500`}>
                      {e.reason || "—"}
                    </td>
                    <td className={`${opsTd} text-right`}>
                      <div className="inline-flex gap-1">
                        <IconBtn
                          busy={busyId === e.id}
                          onClick={() => reviewEdit(e.id, "approve")}
                          ok
                        />
                        <IconBtn
                          busy={busyId === e.id}
                          onClick={() => reviewEdit(e.id, "reject")}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <OpsPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={safeEdits.length}
              onPageChange={setPage}
            />
          </>
        )}
      </OpsTableShell>
    </div>
  )
}

function IconBtn({
  onClick,
  ok,
  busy,
}: {
  onClick: () => void
  ok?: boolean
  busy?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg border p-1.5 ${
        ok
          ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          : "border-red-200 text-red-600 hover:bg-red-50"
      } disabled:opacity-50`}
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : ok ? (
        <Check size={14} />
      ) : (
        <X size={14} />
      )}
    </button>
  )
}
