"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, formatDate, statusBadgeClass } from "@/lib/admin-session"
import { RefreshCw, CalendarOff, Check, X, Loader2 } from "lucide-react"

export default function LeavePage() {
  return (
    <AdminLayout>
      <ProtectedPage>
        <Content />
      </ProtectedPage>
    </AdminLayout>
  )
}

function Content() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [busyId, setBusyId] = useState<number | null>(null)
  const [filter, setFilter] = useState("all")

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await adminGet("/api/leave")
      if (res.data.success) setItems(res.data.data || [])
      else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load leave")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const decide = async (id: number, approved: boolean) => {
    try {
      setBusyId(id)
      const res = await adminPost(`/api/leave/${id}/approve`, { approved })
      if (res.data.success) {
        setToast(approved ? "Leave approved" : "Leave rejected")
        await load()
      } else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    } finally {
      setBusyId(null)
    }
  }

  const filtered = items.filter((i) => (filter === "all" ? true : i.status === filter))
  const pending = items.filter((i) => i.status === "pending").length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900 dark:text-white flex items-center gap-2">
            <CalendarOff className="text-amber-600" size={24} /> Leave requests
          </h1>
          <p className="text-sm text-slate-500 mt-1">Approve time off for cleaners and staff</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-control-border rounded-lg text-sm font-semibold"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {toast && <Flash ok text={toast} onClose={() => setToast("")} />}
      {error && <Flash ok={false} text={error} onClose={() => setError("")} />}

      <div className="flex flex-wrap items-center gap-3">
        <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border px-4 py-3">
          <span className="text-[11px] font-bold uppercase text-slate-400">Pending</span>
          <span className="ml-3 text-xl font-extrabold text-navy-900 dark:text-white">{pending}</span>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white dark:bg-control-darkCard rounded-xl border border-control-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No leave requests</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-navy-950 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-semibold">
                    {[item.user?.firstName, item.user?.lastName].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(item.startDate)} → {formatDate(item.endDate)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-[240px] truncate">
                    {item.reason || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${statusBadgeClass(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.status === "pending" && (
                      <div className="inline-flex gap-1">
                        <button
                          disabled={busyId === item.id}
                          onClick={() => decide(item.id, true)}
                          className="p-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        >
                          {busyId === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Check size={14} />
                          )}
                        </button>
                        <button
                          disabled={busyId === item.id}
                          onClick={() => decide(item.id, false)}
                          className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
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
