
"use client"

import { useCallback, useEffect, useState } from "react"
import {
  saGet,
  saPost,
  saDelete,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnSecondary,
  inputCls,
} from "./shared"
import { Download, RefreshCw, Trash2, Loader2 } from "lucide-react"

function getLogLevelBadge(level: string) {
  const norm = (level || "").toLowerCase()
  if (norm === "error" || norm === "exception") {
    return "bg-rose-50 text-rose-700 border border-rose-100"
  }
  if (norm === "warn") {
    return "bg-amber-50 text-[#D97706] border border-[#FEF3C7]"
  }
  return "bg-slate-50 text-slate-600 border border-slate-100"
}

export default function LogsTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState("")
  const [level, setLevel] = useState("")
  const [search, setSearch] = useState("")
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = { page, pageSize: 50 }
      if (category) params.category = category
      if (level) params.level = level
      if (search) params.search = search
      setData(await saGet("/logs", params))
      setSelected([])
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setLoading(false)
    }
  }, [page, category, level, search])

  useEffect(() => {
    load()
  }, [load])

  const toggleSelect = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleSelectAll = () => {
    const ids = (data?.items || []).map((l: any) => l.id)
    setSelected((prev) => (prev.length === ids.length ? [] : ids))
  }

  const deleteOne = async (log: any) => {
    if (!window.confirm("Delete this log entry?")) return
    setDeleting(true)
    try {
      await saDelete("/logs", { id: log.id })
      setMessage({ type: "success", text: "Log deleted" })
      await load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setDeleting(false)
    }
  }

  const deleteSelected = async () => {
    if (!selected.length) return
    if (!window.confirm(`Delete ${selected.length} log(s)?`)) return
    setDeleting(true)
    try {
      await saPost("/logs", { action: "bulk_delete", ids: selected })
      setMessage({ type: "success", text: `Deleted ${selected.length} logs` })
      await load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setDeleting(false)
    }
  }

  const clearFiltered = async () => {
    const scope = [category && `category=${category}`, level && `level=${level}`].filter(Boolean).join(", ")
    if (!window.confirm(scope ? `Clear all logs matching ${scope}?` : "Clear all system logs? This cannot be undone.")) {
      return
    }
    setDeleting(true)
    try {
      const res = await saPost("/logs", {
        action: "clear",
        category: category || undefined,
        level: level || undefined,
      })
      setMessage({ type: "success", text: `Cleared ${res.deleted ?? 0} logs` })
      await load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setDeleting(false)
    }
  }

  const exportCsv = () => {
    const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
    const params = new URLSearchParams({ format: "csv" })
    if (category) params.set("category", category)
    if (level) params.set("level", level)
    if (search) params.set("search", search)
    fetch(`/api/admin/sales-agent/logs?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "sales-agent-logs.csv"
        a.click()
      })
  }

  return (
    <div className="space-y-4">
      <MessageBanner message={message} />
      
      {/* Search & Telemetry Controls Console */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider mb-1.5">
            Filter Log Message
          </label>
          <input 
            className={`${inputCls} focus:border-[#D97706]`} 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search action or message payload..."
          />
        </div>
        
        <div className="w-full sm:w-[150px]">
          <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider mb-1.5">
            Module Category
          </label>
          <select 
            className={`${inputCls} focus:border-[#D97706]`} 
            value={category} 
            onChange={(e) => { setCategory(e.target.value); setPage(1) }}
          >
            <option value="">All modules</option>
            {["api", "google_places", "search", "crawl", "ai", "smtp", "email", "reply", "scheduler", "campaign", "user", "job", "exception"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-[150px]">
          <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider mb-1.5">
            Severity Level
          </label>
          <select 
            className={`${inputCls} focus:border-[#D97706]`} 
            value={level} 
            onChange={(e) => { setLevel(e.target.value); setPage(1) }}
          >
            <option value="">All levels</option>
            {["debug", "info", "warn", "error"].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button 
            type="button" 
            className={`${btnSecondary} text-xs inline-flex items-center gap-1.5 hover:bg-slate-50`} 
            onClick={load}
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#D97706]" /> Refresh
          </button>
          
          <button 
            type="button" 
            className={`${btnSecondary} text-xs inline-flex items-center gap-1.5 hover:bg-slate-50`} 
            onClick={exportCsv}
          >
            <Download className="w-3.5 h-3.5 text-[#D97706]" /> Export Logs
          </button>

          {selected.length > 0 && (
            <button
              type="button"
              className={`${btnSecondary} text-xs inline-flex items-center gap-1.5 text-rose-700 border-rose-200 hover:bg-rose-50`}
              disabled={deleting}
              onClick={deleteSelected}
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete ({selected.length})
            </button>
          )}

          <button
            type="button"
            className={`${btnSecondary} text-xs inline-flex items-center gap-1.5 text-rose-700 border-rose-200 hover:bg-rose-50`}
            disabled={deleting}
            onClick={clearFiltered}
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear{category || level ? " filtered" : " all"}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : !data?.items?.length ? (
        <EmptyState title="Telemetry logs empty" description="Operational events, API queries, web-crawls, and scheduler traces will render here." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-slate-50 border-b border-gray-200">
                  <th className="p-3 pl-4 w-10">
                    <input
                      type="checkbox"
                      checked={!!data.items.length && selected.length === data.items.length}
                      onChange={toggleSelectAll}
                      className="accent-[#0D1E36]"
                      aria-label="Select all logs"
                    />
                  </th>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Level</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Action context</th>
                  <th className="p-3">Message Payload</th>
                  <th className="p-3 text-right pr-4">Latency (ms)</th>
                  <th className="p-3 text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-sans">
                {data.items.map((log: any) => {
                  const isUnsuccessful = !log.success || log.level === "error" || log.level === "exception"
                  return (
                    <tr 
                      key={log.id} 
                      className={`hover:bg-slate-50/50 transition-colors duration-100 ${
                        isUnsuccessful ? "bg-rose-50/30 hover:bg-rose-50/50" : ""
                      }`}
                    >
                      <td className="p-3 pl-4">
                        <input
                          type="checkbox"
                          checked={selected.includes(log.id)}
                          onChange={() => toggleSelect(log.id)}
                          className="accent-[#0D1E36]"
                          aria-label={`Select log ${log.id}`}
                        />
                      </td>
                      <td className="p-3 font-mono text-[10px] text-gray-400 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3">
                        <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${getLogLevelBadge(log.level)}`}>
                          {log.level}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                          {log.category}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-gray-700 text-[11px]">
                        {log.action}
                      </td>
                      <td className="p-3 text-slate-600 max-w-md truncate font-medium text-[11px]" title={log.message}>
                        {log.message}
                      </td>
                      <td className="p-3 text-right pr-4 font-mono text-[10px] text-gray-400">
                        {log.durationMs != null ? `${log.durationMs}ms` : "—"}
                      </td>
                      <td className="p-3 text-right pr-4">
                        <button
                          type="button"
                          className="text-rose-600 hover:text-rose-800 text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                          disabled={deleting}
                          onClick={() => deleteOne(log)}
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer Navigation */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-50 border-t border-gray-200 text-xs text-slate-500">
            <span>Operational records tracked: <strong className="text-[#0D1E36]">{data.total}</strong> logs</span>
            
            <div className="flex items-center gap-2">
              <button 
                type="button" 
                className={`${btnSecondary} bg-white text-xs px-3 py-1.5`} 
                disabled={page <= 1} 
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="text-[11px] font-mono font-bold text-[#0D1E36] px-2">Page {page}</span>
              <button 
                type="button" 
                className={`${btnSecondary} bg-white text-xs px-3 py-1.5`} 
                disabled={page * 50 >= data.total} 
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
