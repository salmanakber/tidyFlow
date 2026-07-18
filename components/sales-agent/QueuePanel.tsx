
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { saGet, LoadingBlock, btnSecondary, ProgressBar } from "./shared"
import { RefreshCw, ListOrdered, CheckCircle2, AlertCircle, Activity, Clock } from "lucide-react"

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
      // Delayed jobs (campaign emails, reply sync) must not keep the UI "busy" forever
      const busy = (c.active || 0) + (c.waiting || 0)
      if (busy > 0) {
        wasBusy.current = true
        setShowProgress(true)
      } else if (wasBusy.current) {
        wasBusy.current = false
        setShowProgress(true)
        onIdleRef.current?.()
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
  const busy = (c.active || 0) + (c.waiting || 0)
  const delayed = c.delayed || 0
  const done = c.completed || 0
  const failed = c.failed || 0
  const totalTracked = busy + done + failed
  const pct = totalTracked > 0 ? Math.round(((done + failed) / totalTracked) * 100) : busy > 0 ? 5 : 100
  const analyzeBusy = (c.analyzeActive || 0) + (c.analyzeWaiting || 0)
  const discoverBusy = (c.discoverActive || 0) + (c.discoverWaiting || 0)

  const rows = [
    ...(data?.active || []).map((j: any) => ({ ...j, state: "active" })),
    ...(data?.waiting || []).map((j: any) => ({ ...j, state: "waiting" })),
    ...(data?.delayed || []).map((j: any) => ({ ...j, state: "delayed" })),
    ...(data?.failed || []).slice(0, 5).map((j: any) => ({ ...j, state: "failed" })),
    ...(data?.completed || []).slice(0, 5).map((j: any) => ({ ...j, state: "completed" })),
  ]

  return (
    <div className="bg-white rounded-xl border border-[#E3E7F0] shadow-xs p-5 space-y-5">
      
      {/* Telemetry Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-gray-100">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-slate-100 text-[#0D1E36]">
            <ListOrdered className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0D1E36]">Background Job Telemetry</h3>
            <p className="text-[11px] text-gray-400">Monitor background queues and outbound crawlers in real-time</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Redis Status */}
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${
            data?.redis 
              ? "bg-green-50 text-green-700 border border-green-100" 
              : "bg-amber-50 text-[#D97706] border border-[#FEF3C7]"
          }`}>
            {data?.redis ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" /> Engine Online
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5" /> Direct execution mode
              </>
            )}
          </span>

          {/* Active Job Counter */}
          {busy > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#FEF3C7] text-[#B45309] animate-pulse border border-[#FEF3C7]">
              <Activity className="w-3.5 h-3.5" /> {busy} Active task(s)
            </span>
          )}

          <button 
            type="button" 
            className="inline-flex items-center justify-center gap-1 bg-white hover:bg-slate-50 text-[#0D1E36] border border-gray-200 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all h-[32px]" 
            onClick={load}
          >
            <RefreshCw className="w-3 h-3 text-[#D97706]" /> Refresh
          </button>
        </div>
      </div>

      {showProgress && (
        <div className="py-1 space-y-1">
          <ProgressBar
            label={
              busy > 0
                ? `Working now — ${busy} job(s)${discoverBusy ? ` · ${discoverBusy} find` : ""}${analyzeBusy ? ` · ${analyzeBusy} analyze` : ""}${delayed ? ` · ${delayed} delayed later` : ""}`
                : "Queue idle (no active/waiting jobs)"
            }
            pct={busy > 0 ? Math.max(pct, 8) : 100}
            tone={busy > 0 ? "navy" : "green"}
          />
        </div>
      )}

      {!compact && data?.howItWorks && (
        <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
          {data.howItWorks.discovery} {data.howItWorks.emails}
        </p>
      )}

      {/* Grid of Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
        {[
          ["Active", c.active, "text-[#0D1E36] bg-slate-50 border-slate-200"],
          ["Waiting", c.waiting, "text-slate-500 bg-slate-50 border-slate-100"],
          ["Delayed", c.delayed, "text-[#B45309] bg-[#FEF3C7]/40 border-[#FEF3C7]"],
          ["Completed", c.completed, "text-green-700 bg-green-50/50 border-green-100"],
          ["Failed", c.failed, "text-rose-700 bg-rose-50/50 border-rose-100"],
        ].map(([label, val, cls]) => (
          <div key={String(label)} className={`rounded-xl border p-3.5 transition-all duration-150 ${cls}`}>
            <div className="text-xl font-bold font-mono tracking-tight">{val ?? 0}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider mt-1 opacity-80">{label}</div>
          </div>
        ))}
      </div>

      {/* Job Execution table */}
      {rows.length === 0 ? (
        <div className="text-center py-6 bg-slate-50 border border-gray-100 rounded-xl">
          <p className="text-xs text-gray-400">No active background tasks in memory queue.</p>
        </div>
      ) : (
        <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-slate-50 border-b border-gray-100">
                <th className="p-3 pl-4">Queue State</th>
                <th className="p-3">Job Type</th>
                <th className="p-3">Chunk Payload Data</th>
                <th className="p-3 text-right pr-4">Runtime Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((j) => (
                <tr key={`${j.state}-${j.id}`} className="hover:bg-[#F8F9FC] transition-colors duration-100">
                  <td className="p-3 pl-4">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        j.state === "failed"
                          ? "bg-rose-50 text-rose-700 border border-rose-100"
                          : j.state === "completed"
                            ? "bg-green-50 text-green-700 border border-green-100"
                            : j.state === "active"
                              ? "bg-[#FEF3C7] text-[#B45309] border border-[#FEF3C7]"
                              : j.state === "delayed"
                                ? "bg-amber-50 text-[#D97706] border border-[#FEF3C7]"
                                : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {j.state}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[#0D1E36] font-semibold text-[11px]">{j.name}</td>
                  <td className="p-3 text-slate-500 font-medium max-w-[240px] truncate text-[11px]" title={JSON.stringify(j.data)}>
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
                  <td className="p-3 text-right pr-4 font-mono text-[10px] text-gray-400">
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

      {/* Recent Activity Log list */}
      {!compact && data?.recentLogs?.length ? (
        <div className="pt-3 border-t border-gray-100 space-y-2">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Live Operation Stream</h4>
          </div>
          
          <ul className="text-xs text-slate-600 space-y-1.5 max-h-32 overflow-y-auto bg-slate-50/50 p-3 rounded-xl border border-gray-100 font-sans">
            {data.recentLogs.slice(0, 12).map((log: any) => (
              <li key={log.id} className="flex items-start gap-2 leading-relaxed">
                <span className="font-mono text-[10px] text-gray-400 shrink-0 bg-white px-1.5 py-0.5 rounded border border-gray-100">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
                <span className="text-[#0D1E36] font-bold shrink-0">{log.action}</span>
                <span className="text-slate-400 shrink-0">·</span>
                <span className="text-gray-500 italic truncate" title={log.message}>{log.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
