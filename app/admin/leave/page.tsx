"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import ProtectedPage from "@/components/ProtectedPage"
import { adminGet, adminPost, formatDate } from "@/lib/admin-session"
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
import { Check, X, Loader2 } from "lucide-react"

const PAGE_SIZE = 10

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
  const [page, setPage] = useState(1)

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await adminGet("/api/leave")
      if (res.data.success) {
        const raw = res.data.data
        setItems(Array.isArray(raw) ? raw : [])
      } else {
        setItems([])
        setError(res.data.message || "Failed")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load leave")
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [filter])

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

  const safeItems = Array.isArray(items) ? items : []
  const filtered = safeItems.filter((i) => (filter === "all" ? true : i.status === filter))
  const pending = safeItems.filter((i) => i.status === "pending").length
  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <OpsKpi label="Pending" value={pending} />
        <OpsKpi label="Total" value={safeItems.length} />
      </div>

      <OpsTableShell
        title="Leave requests"
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {filtered.length}
          </span>
        }
        tabs={[
          { id: "all", label: "All" },
          { id: "pending", label: "Pending" },
          { id: "approved", label: "Approved" },
          { id: "rejected", label: "Rejected" },
        ]}
        activeTab={filter}
        onTabChange={setFilter}
      >
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <OpsEmpty message="No leave requests" />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Staff</th>
                  <th className={opsTh}>Dates</th>
                  <th className={opsTh}>Reason</th>
                  <th className={opsTh}>Status</th>
                  <th className={`${opsTh} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {pageSlice.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className={`${opsTd} font-semibold text-navy-900 dark:text-white`}>
                      {[item.user?.firstName, item.user?.lastName].filter(Boolean).join(" ") ||
                        "—"}
                    </td>
                    <td className={opsTd}>
                      {formatDate(item.startDate)} → {formatDate(item.endDate)}
                    </td>
                    <td className={`${opsTd} max-w-[240px] truncate text-slate-500`}>
                      {item.reason || "—"}
                    </td>
                    <td className={opsTd}>
                      <OpsBadge status={item.status} />
                    </td>
                    <td className={`${opsTd} text-right`}>
                      {item.status === "pending" && (
                        <div className="inline-flex gap-1">
                          <button
                            disabled={busyId === item.id}
                            onClick={() => decide(item.id, true)}
                            className="rounded-lg border border-emerald-200 p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
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
                            className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
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
            <OpsPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
            />
          </>
        )}
      </OpsTableShell>
    </div>
  )
}
