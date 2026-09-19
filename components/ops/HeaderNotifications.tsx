"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import axios from "axios"
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react"
import { useCompanyWorkspace } from "@/contexts/CompanyWorkspaceContext"
import { resolveNotificationHref } from "@/lib/notification-links"
import { useInterval } from "@/hooks/useOpsRealtime"

type Notif = {
  id: number
  title?: string
  message?: string
  body?: string
  type?: string
  status?: string
  readAt?: string | null
  createdAt?: string
  metadata?: string | Record<string, unknown> | null
}

function authHeaders() {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
      : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function isUnread(n: Notif) {
  return !n.readAt && n.status !== "read"
}

function relativeTime(iso?: string) {
  if (!iso) return ""
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ""
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function HeaderNotifications() {
  const { href } = useCompanyWorkspace()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await axios.get("/api/notifications", {
        headers: authHeaders(),
        params: { limit: 12 },
      })
      if (res.data?.success) {
        const raw = res.data.data
        setItems(Array.isArray(raw) ? raw : raw?.notifications || [])
      }
    } catch {
      /* keep prior */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useInterval(() => {
    void load()
  }, open ? 15000 : 45000, true)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const unread = items.filter(isUnread).length
  const preview = items.slice(0, 8)

  const markRead = async (id: number) => {
    try {
      await axios.post(`/api/notifications/${id}/read`, {}, { headers: authHeaders() })
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, status: "read", readAt: new Date().toISOString() } : n))
      )
    } catch {
      /* ignore */
    }
  }

  const markAll = async () => {
    const ids = items.filter(isUnread).map((n) => n.id)
    await Promise.allSettled(
      ids.map((id) => axios.post(`/api/notifications/${id}/read`, {}, { headers: authHeaders() }))
    )
    await load()
  }

  const openItem = async (n: Notif) => {
    if (isUnread(n)) await markRead(n.id)
    const dest = resolveNotificationHref(n, href) || href("notifications")
    setOpen(false)
    window.location.href = dest
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open) void load()
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-navy-800 dark:bg-navy-950 dark:text-slate-300 dark:hover:border-amber-700/50"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-600 px-1 font-mono text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(100vw-1.5rem,22rem)] overflow-hidden rounded-xl border border-control-border bg-white shadow-xl dark:border-amber-900/30 dark:bg-control-darkCard">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-navy-800">
            <div>
              <p className="text-sm font-bold text-navy-900 dark:text-white">Notifications</p>
              <p className="font-mono text-[10px] text-slate-400">
                {unread} unread{loading ? " · refreshing" : ""}
              </p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-navy-900"
              >
                <CheckCheck size={12} /> Mark all
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {preview.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell size={20} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">You&apos;re all caught up</p>
                <p className="mt-1 text-xs text-slate-400">Job updates and SOS will appear here</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-navy-900">
                {preview.map((n) => {
                  const unreadRow = isUnread(n)
                  const dest = resolveNotificationHref(n, href)
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void openItem(n)}
                        className={`flex w-full gap-2.5 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-navy-900 ${
                          unreadRow ? "bg-amber-50/50 dark:bg-amber-950/20" : ""
                        }`}
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                            unreadRow ? "bg-amber-500" : "bg-transparent"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold text-navy-900 dark:text-white line-clamp-1">
                              {n.title || "Alert"}
                            </span>
                            <span className="flex-shrink-0 font-mono text-[10px] text-slate-400">
                              {relativeTime(n.createdAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500 line-clamp-2">
                            {n.message || n.body || ""}
                          </span>
                          {dest && (
                            <span className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-400">
                              Open <ExternalLink size={10} />
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 dark:border-navy-800">
            <button
              type="button"
              onClick={() => {
                const first = preview.find(isUnread)
                if (first) void markRead(first.id)
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700"
              disabled={!unread}
            >
              <Check size={12} /> Mark top read
            </button>
            <Link
              href={href("notifications")}
              onClick={() => setOpen(false)}
              className="text-[11px] font-bold text-amber-700 hover:text-amber-800 dark:text-amber-400"
            >
              View all →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
