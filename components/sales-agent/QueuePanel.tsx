"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { saGet, LoadingBlock, btnSecondary, ProgressBar } from "./shared"
import { RefreshCw, ListOrdered } from "lucide-react"

type QueueData = {
  redis?: boolean
  counts?: Record<string, number>
  waiting?: any[]
  active?: any[]
  delayed?: any[]
  failed?: any[]
  completed?: any[]
  howItWorks?: { discovery?: string; emails?: string }
  recentLogs?: any[]
}

export default function QueuePanel({
  compact = false,
  onQueueUpdate,
  onQueueBecameIdle,
}: {
  compact?: boolean
  onQueueUpdate?: (data: QueueData) => void
  onQueueBecameIdle?: () => void
}) {
  const [data, setData] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showProgress, setShowProgress] = useState(false)
  const wasBusy = useRef(false)
  const onUpdateRef = useRef(onQueueUpdate)
  const onIdleRef = useRef(onQueueBecameIdle)
  onUpdateRef.current = onQueueUpdate
  onIdleRef.current = onQueueBecameIdle

  const load = useCallback(async () => {
    try {
      const next = await saGet("/jobs")
      setData(next)
      onUpdateRef.current?.(next)

      const c = next?.counts || {}
      const busy = (c.active || 0) + (c.waiting || 0) + (c.delayed || 0)
      if (busy > 0) {
        wasBusy.current = true
        setShowProgress(true)
      } else if (wasBusy.current) {
        wasBusy.current = false
        setShowProgress(true)
        onIdleRef.current?.()
        // Hide progress shortly after idle
        setTimeout(() => setShowProgress(false), 4000)
      }
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  if (loading && !data) return <LoadingBlock />

  const c = data?.counts || {}
  const busy = (c.active || 0) + (c.waiting || 0) + (c.delayed || 0)
  const done = c.completed || 0
  const failed = c.failed || 0
  const totalTracked = busy + done + failed
  const pct = totalTracked > 0 ? Math.round(((done + failed) / totalTracked) * 100) : busy > 0 ? 5 : 100

  const rows = [
    ...(data?.active || []).map((j: any) => ({ ...j, state: "active" })),
    ...(data?.waiting || []).map((j: any) => ({ ...j, state: "waiting" })),
    ...(data?.delayed || []).map((j: any) => ({ ...j, state: "delayed" })),
    ...(data?.failed || []).slice(0, 5).map((j: any) => ({ ...j, state: "failed" })),
    ...(data?.completed || []).slice(0, 5).map((j: any) => ({ ...j, state: "completed" })),
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ListOrdered className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Job queue</h3>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              data?.redis ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {data?.redis ? "Redis connected" : "Redis offline (jobs run inline if possible)"}
          </span>
          {busy > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 animate-pulse">
              Working… {busy} job(s)
            </span>
          )}
        </div>
        <button type="button" className={btnSecondary} onClick={load}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {showProgress && (
        <ProgressBar
          label={busy > 0 ? "Queue progress — UI refreshes automatically when done" : "Queue finished"}
          pct={busy > 0 ? Math.max(pct, 8) : 100}
          tone={busy > 0 ? "indigo" : "green"}
        />
      )}

      {!compact && data?.howItWorks && (
        <p className="text-xs text-gray-500">
          {data.howItWorks.discovery} {data.howItWorks.emails}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
        {[
          ["Active", c.active, "text-indigo-700 bg-indigo-50"],
          ["Waiting", c.waiting, "text-gray-700 bg-gray-50"],
          ["Delayed", c.delayed, "text-amber-700 bg-amber-50"],
          ["Done", c.completed, "text-green-700 bg-green-50"],
          ["Failed", c.failed, "text-red-700 bg-red-50"],
        ].map(([label, val, cls]) => (
          <div key={String(label)} className={`rounded-lg px-2 py-2 ${cls}`}>
            <div className="text-lg font-semibold">{val ?? 0}</div>
            <div className="text-xs">{label}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">No sales-agent jobs in the queue right now.</p>
      ) : (
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-1.5 pr-2">State</th>
                <th className="py-1.5 pr-2">Job</th>
                <th className="py-1.5 pr-2">Chunk / data</th>
                <th className="py-1.5">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => (
                <tr key={`${j.state}-${j.id}`} className="border-b border-gray-50">
                  <td className="py-1.5 pr-2">
                    <span className="font-medium">{j.state}</span>
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-gray-600">{j.name}</td>
                  <td className="py-1.5 pr-2 text-gray-600 max-w-[240px] truncate" title={JSON.stringify(j.data)}>
                    {j.data?.keyword
                      ? `${j.data.keyword}${j.data.city ? ` · ${j.data.city}` : ""}${j.data.country ? ` · ${j.data.country}` : ""}`
                      : j.data?.keywords
                        ? `${(j.data.keywords || []).length} keywords`
                        : j.data?.companyId
                          ? `lead #${j.data.companyId}`
                          : j.data?.sentEmailId
                            ? `email #${j.data.sentEmailId}`
                            : j.data?.discoveryGroupId
                              ? `group #${j.data.discoveryGroupId}`
                              : "—"}
                  </td>
                  <td className="py-1.5 text-gray-400">
                    {j.finishedOn
                      ? new Date(j.finishedOn).toLocaleTimeString()
                      : j.processedOn
                        ? new Date(j.processedOn).toLocaleTimeString()
                        : j.timestamp
                          ? new Date(j.timestamp).toLocaleTimeString()
                          : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!compact && data?.recentLogs?.length ? (
        <div>
          <h4 className="text-xs font-medium text-gray-600 mb-1">Recent activity</h4>
          <ul className="text-xs text-gray-500 space-y-1 max-h-32 overflow-y-auto">
            {data.recentLogs.slice(0, 12).map((log: any) => (
              <li key={log.id}>
                <span className="text-gray-400">{new Date(log.createdAt).toLocaleTimeString()}</span>
                {" · "}
                <span className="text-gray-700">{log.action}</span>
                {" — "}
                {log.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
