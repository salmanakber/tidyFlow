"use client"

/**
 * Slide-over listing recent company audit events.
 * Fetches GET /api/audit-logs?limit=50
 */
import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import { X, ScrollText, Loader2 } from "lucide-react"

export type AuditTrailLog = {
  id: number
  action: string
  entityType: string
  entityId?: string | null
  createdAt: string
  user?: {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
  } | null
}

export default function AuditTrailDrawer({
  open,
  onClose,
  entityType,
  entityId,
}: {
  open: boolean
  onClose: () => void
  entityType?: string
  entityId?: string
}) {
  const [logs, setLogs] = useState<AuditTrailLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError("")
        const token =
          localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
        const res = await axios.get("/api/audit-logs", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          params: { limit: 50 },
        })
        if (cancelled) return
        if (res.data?.success && Array.isArray(res.data.data)) {
          setLogs(res.data.data)
        } else {
          setLogs([])
          setError(res.data?.message || "Failed to load audit trail")
        }
      } catch (e: any) {
        if (!cancelled) {
          setLogs([])
          setError(e.response?.data?.message || "Failed to load audit trail")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const filtered = useMemo(() => {
    let list = logs
    if (entityType) {
      const t = entityType.toLowerCase()
      list = list.filter((l) => (l.entityType || "").toLowerCase() === t)
    }
    if (entityId != null && entityId !== "") {
      const id = String(entityId)
      list = list.filter((l) => String(l.entityId ?? "") === id)
    }
    return list
  }, [logs, entityType, entityId])

  return (
    <>
      <div
        className={`fixed inset-0 z-[60] bg-navy-950/60 backdrop-blur-[1px] transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[70] flex w-full max-w-[420px] flex-col border-l border-control-border bg-white shadow-2xl transition-transform duration-200 ease-out dark:border-control-darkBorder dark:bg-control-darkCard ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Audit trail"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-navy-800">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-amber-600" />
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Ops
              </p>
              <h2 className="text-sm font-extrabold text-navy-900 dark:text-white">Audit trail</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-navy-900 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {(entityType || entityId) && (
          <div className="border-b border-slate-100 px-4 py-2 text-[11px] text-slate-500 dark:border-navy-800">
            Filter:{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {[entityType, entityId].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No audit events yet</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((log) => {
                const who = log.user
                  ? [log.user.firstName, log.user.lastName].filter(Boolean).join(" ").trim() ||
                    log.user.email ||
                    "User"
                  : "System"
                return (
                  <li
                    key={log.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-navy-800 dark:bg-navy-950/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-navy-900 dark:text-white">
                        {log.action}
                      </p>
                      <time className="shrink-0 font-mono text-[10px] text-slate-400">
                        {formatWhen(log.createdAt)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {who}
                      {" · "}
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {log.entityType}
                        {log.entityId ? ` #${log.entityId}` : ""}
                      </span>
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}
