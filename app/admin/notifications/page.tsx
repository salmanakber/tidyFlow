"use client"

import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsTableShell,
  OpsPagination,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import { formatDate } from "@/lib/admin-session"
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react"

const PAGE_SIZE = 10

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [tab, setTab] = useState<"all" | "unread" | "read">("all")
  const [page, setPage] = useState(1)
  const [bulkBusy, setBulkBusy] = useState(false)

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem("authToken") || sessionStorage.getItem("authToken")}`,
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await axios.get("/api/notifications", {
        headers: headers(),
        params: { limit: 200 },
      })
      if (res.data.success) {
        const raw = res.data.data
        setItems(Array.isArray(raw) ? raw : raw?.notifications || [])
      } else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load notifications")
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
    setSelected(new Set())
  }, [tab])

  const isUnread = (n: any) => !n.readAt && n.status !== "read"

  const filtered = useMemo(() => {
    if (tab === "unread") return items.filter(isUnread)
    if (tab === "read") return items.filter((n) => !isUnread(n))
    return items
  }, [items, tab])

  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const pageIds = pageSlice.map((n) => n.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  const markRead = async (id: number) => {
    try {
      await axios.post(`/api/notifications/${id}/read`, {}, { headers: headers() })
      setToast("Marked read")
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    }
  }

  const remove = async (id: number) => {
    try {
      await axios.delete(`/api/notifications/${id}`, { headers: headers() })
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setToast("Deleted")
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    }
  }

  const bulkDelete = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`Delete ${ids.length} notification${ids.length === 1 ? "" : "s"}?`)) return
    try {
      setBulkBusy(true)
      const results = await Promise.allSettled(
        ids.map((id) => axios.delete(`/api/notifications/${id}`, { headers: headers() }))
      )
      const failed = results.filter((r) => r.status === "rejected").length
      setSelected(new Set())
      if (failed) setError(`${failed} could not be deleted`)
      else setToast(`Deleted ${ids.length} notification${ids.length === 1 ? "" : "s"}`)
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Bulk delete failed")
    } finally {
      setBulkBusy(false)
    }
  }

  const markAllRead = async () => {
    const unreadIds = filtered.filter(isUnread).map((n) => n.id)
    if (unreadIds.length === 0) {
      setToast("Nothing unread")
      return
    }
    try {
      setBulkBusy(true)
      await Promise.allSettled(
        unreadIds.map((id) => axios.post(`/api/notifications/${id}/read`, {}, { headers: headers() }))
      )
      setToast("All marked read")
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    } finally {
      setBulkBusy(false)
    }
  }

  const unread = items.filter(isUnread).length

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Account"
          title="Notifications"
          subtitle="Company alerts, job updates, and system messages"
          actions={
            <>
              <OpsRefreshButton onClick={load} loading={loading} />
              <OpsPrimaryButton onClick={markAllRead} disabled={bulkBusy || unread === 0}>
                <CheckCheck size={14} /> Mark all read
              </OpsPrimaryButton>
            </>
          }
        />
        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">
              {selected.size} selected
            </p>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={bulkDelete}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold uppercase text-white disabled:opacity-50"
            >
              <Trash2 size={14} />
              {bulkBusy ? "Deleting…" : "Bulk delete"}
            </button>
          </div>
        )}

        <OpsTableShell
          title="Inbox"
          badge={
            <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
              {unread} unread
            </span>
          }
          tabs={[
            { id: "all", label: "All" },
            { id: "unread", label: "Unread" },
            { id: "read", label: "Read" },
          ]}
          activeTab={tab}
          onTabChange={(id) => setTab(id as any)}
          footer={<span>OWNER ALERT FEED · PAGINATED</span>}
        >
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <OpsEmpty message="No notifications yet" />
          ) : (
            <>
              <table className="w-full text-left">
                <thead className="border-b border-control-border bg-slate-50 dark:bg-navy-950">
                  <tr>
                    <th className={`${opsTh} w-10`}>
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={togglePage}
                        aria-label="Select page"
                        className="rounded border-slate-300"
                      />
                    </th>
                    <th className={opsTh}>Alert</th>
                    <th className={opsTh}>Type</th>
                    <th className={opsTh}>When</th>
                    <th className={opsTh}>Status</th>
                    <th className={`${opsTh} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                  {pageSlice.map((n) => {
                    const unreadRow = isUnread(n)
                    return (
                      <tr
                        key={n.id}
                        className={unreadRow ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}
                      >
                        <td className={opsTd}>
                          <input
                            type="checkbox"
                            checked={selected.has(n.id)}
                            onChange={() => toggleOne(n.id)}
                            aria-label={`Select ${n.id}`}
                            className="rounded border-slate-300"
                          />
                        </td>
                        <td className={opsTd}>
                          <div className="flex items-start gap-2">
                            <Bell
                              size={14}
                              className={unreadRow ? "mt-0.5 text-amber-600" : "mt-0.5 text-slate-300"}
                            />
                            <div>
                              <p className="font-bold text-navy-900 dark:text-white">
                                {n.title || n.message?.slice(0, 60) || `Alert #${n.id}`}
                              </p>
                              <p className="mt-0.5 max-w-md text-xs text-slate-500 line-clamp-2">
                                {n.body || n.message || n.content || ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className={`${opsTd} font-mono text-[10px] uppercase text-slate-500`}>
                          {n.type || "general"}
                        </td>
                        <td className={`${opsTd} text-xs text-slate-500`}>
                          {formatDate(n.createdAt)}
                        </td>
                        <td className={opsTd}>
                          <OpsBadge status={unreadRow ? "pending" : "read"} />
                        </td>
                        <td className={`${opsTd} text-right`}>
                          <div className="inline-flex gap-1">
                            {unreadRow && (
                              <button
                                type="button"
                                onClick={() => markRead(n.id)}
                                className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                                title="Mark read"
                              >
                                <Check size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => remove(n.id)}
                              className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
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
    </AdminLayout>
  )
}
