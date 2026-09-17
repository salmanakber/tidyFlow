"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, formatDate } from "@/lib/admin-session"
import {
  OpsPageHeader,
  OpsCard,
  OpsKpi,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
} from "@/components/ops/OpsChrome"
import { Check, X, Loader2 } from "lucide-react"

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
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Manage"
        title="Leave requests"
        subtitle="Approve time off for cleaners and staff"
        actions={<OpsRefreshButton onClick={load} loading={loading} />}
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="flex flex-wrap items-center gap-3">
        <OpsKpi label="Pending" value={pending} />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-navy-800 dark:bg-navy-950"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <OpsCard padding={false}>
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <OpsEmpty message="No leave requests" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-navy-950">
              <tr>
                <th className="px-5 py-3">Staff</th>
                <th className="px-5 py-3">Dates</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3 font-semibold text-navy-900 dark:text-white">
                    {[item.user?.firstName, item.user?.lastName].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-5 py-3">
                    {formatDate(item.startDate)} → {formatDate(item.endDate)}
                  </td>
                  <td className="max-w-[240px] truncate px-5 py-3 text-slate-500">
                    {item.reason || "—"}
                  </td>
                  <td className="px-5 py-3">
                    <OpsBadge status={item.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {item.status === "pending" && (
                      <div className="inline-flex gap-1">
                        <button
                          disabled={busyId === item.id}
                          onClick={() => decide(item.id, true)}
                          className="rounded-lg border border-emerald-200 p-1.5 text-emerald-700 hover:bg-emerald-50"
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
                          className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
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
      </OpsCard>
    </div>
  )
}
