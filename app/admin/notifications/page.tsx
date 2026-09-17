"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsTableShell,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import { formatDate } from "@/lib/admin-session"
import { Bell, Check, Trash2 } from "lucide-react"

export default function NotificationsPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem("authToken") || sessionStorage.getItem("authToken")}`,
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await axios.get("/api/notifications", {
        headers: headers(),
        params: { limit: 100 },
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
      setToast("Deleted")
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    }
  }

  const unread = items.filter((n) => !n.readAt && n.status !== "read").length

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Account"
          title="Notifications"
          subtitle="Company alerts, job updates, and system messages"
          actions={<OpsRefreshButton onClick={load} loading={loading} />}
        />
        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        <OpsTableShell
          title="Inbox"
          badge={
            <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
              {unread} unread
            </span>
          }
          footer={<span>OWNER ALERT FEED</span>}
        >
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
          ) : items.length === 0 ? (
            <OpsEmpty message="No notifications yet" />
          ) : (
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Alert</th>
                  <th className={opsTh}>Type</th>
                  <th className={opsTh}>When</th>
                  <th className={opsTh}>Status</th>
                  <th className={`${opsTh} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {items.map((n) => {
                  const isUnread = !n.readAt && n.status !== "read"
                  return (
                    <tr
                      key={n.id}
                      className={isUnread ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}
                    >
                      <td className={opsTd}>
                        <div className="flex items-start gap-2">
                          <Bell
                            size={14}
                            className={isUnread ? "mt-0.5 text-amber-600" : "mt-0.5 text-slate-300"}
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
                        <OpsBadge status={isUnread ? "pending" : "read"} />
                      </td>
                      <td className={`${opsTd} text-right`}>
                        <div className="inline-flex gap-1">
                          {isUnread && (
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
          )}
        </OpsTableShell>
      </div>
    </AdminLayout>
  )
}
