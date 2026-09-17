"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, adminPatch, formatDate, statusBadgeClass } from "@/lib/admin-session"
import { RefreshCw, Check, X, Clock, Edit3, Loader2 } from "lucide-react"

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
      if (hRes.data.success) setHours(hRes.data.data || [])
      if (eRes.data.success) setEdits(eRes.data.data || [])
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

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

  const pendingHours = hours.filter((h) => h.status === "pending").length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 dark:text-white">Working hours</h1>
          <p className="text-sm text-slate-500 mt-1">
            Approve submitted hours and GPS duration edit requests
          </p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-control-darkCard border border-control-border rounded-lg text-sm font-semibold"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {toast && <Flash ok text={toast} onClose={() => setToast("")} />}
      {error && <Flash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-4">
          <p className="text-[11px] font-bold uppercase text-slate-400">Pending hours</p>
          <p className="text-2xl font-extrabold text-navy-900 dark:text-white mt-1">{pendingHours}</p>
        </div>
        <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border p-4">
          <p className="text-[11px] font-bold uppercase text-slate-400">Pending edits</p>
          <p className="text-2xl font-extrabold text-navy-900 dark:text-white mt-1">{edits.length}</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-control-border">
        <TabBtn active={tab === "hours"} onClick={() => setTab("hours")} icon={Clock} label="Submissions" />
        <TabBtn active={tab === "edits"} onClick={() => setTab("edits")} icon={Edit3} label="Edit requests" />
      </div>

      <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
        ) : tab === "hours" ? (
          hours.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-navy-950 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Staff</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {hours.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 font-semibold">
                      {[h.user?.firstName, h.user?.lastName].filter(Boolean).join(" ") ||
                        h.user?.email ||
                        `#${h.userId}`}
                    </td>
                    <td className="px-4 py-3">{formatDate(h.date)}</td>
                    <td className="px-4 py-3 font-mono font-bold">{Number(h.hours).toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">
                      {h.description || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={h.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
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
          )
        ) : edits.length === 0 ? (
          <Empty text="No pending duration edit requests" />
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-navy-950 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Requester</th>
                <th className="px-4 py-3">Current → Proposed</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
              {edits.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{e.taskTitle || `Task #${e.taskId}`}</div>
                    <div className="text-xs text-slate-400">{e.propertyAddress}</div>
                  </td>
                  <td className="px-4 py-3">
                    {[e.requester?.firstName, e.requester?.lastName].filter(Boolean).join(" ") ||
                      "—"}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {e.currentDurationMinutes ?? "—"}m →{" "}
                    <span className="font-bold text-amber-700">{e.proposedDurationMinutes}m</span>
                    {e.geoFlagged && (
                      <span className="ml-2 text-[10px] font-bold text-red-600 uppercase">GPS flag</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate">
                    {e.reason || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <IconBtn busy={busyId === e.id} onClick={() => reviewEdit(e.id, "approve")} ok />
                      <IconBtn busy={busyId === e.id} onClick={() => reviewEdit(e.id, "reject")} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: any
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 -mb-px ${
        active
          ? "border-amber-600 text-amber-700"
          : "border-transparent text-slate-400 hover:text-slate-700"
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  )
}

function Badge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${statusBadgeClass(
        status
      )}`}
    >
      {status}
    </span>
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
      className={`p-1.5 rounded-lg border ${
        ok
          ? "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
          : "text-red-600 border-red-200 hover:bg-red-50"
      } disabled:opacity-50`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : ok ? <Check size={14} /> : <X size={14} />}
    </button>
  )
}

function Flash({ ok, text, onClose }: { ok: boolean; text: string; onClose: () => void }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 text-sm flex justify-between ${
        ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
      }`}
    >
      {text}
      <button onClick={onClose} className="font-bold text-xs">
        Dismiss
      </button>
    </div>
  )
}

function Empty({ text = "No records in the last 30 days" }: { text?: string }) {
  return <div className="py-16 text-center text-sm text-slate-500">{text}</div>
}
