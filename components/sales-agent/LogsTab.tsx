"use client"

import { useCallback, useEffect, useState } from "react"
import {
  saGet,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnSecondary,
  inputCls,
} from "./shared"
import { Download, RefreshCw } from "lucide-react"

export default function LogsTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState("")
  const [level, setLevel] = useState("")
  const [search, setSearch] = useState("")
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = { page, pageSize: 50 }
      if (category) params.category = category
      if (level) params.level = level
      if (search) params.search = search
      setData(await saGet("/logs", params))
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setLoading(false)
    }
  }, [page, category, level, search])

  useEffect(() => {
    load()
  }, [load])

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
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-medium text-gray-600">Search</label>
          <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Category</label>
          <select className={inputCls} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }}>
            <option value="">All</option>
            {["api", "google_places", "search", "crawl", "ai", "smtp", "email", "reply", "scheduler", "campaign", "user", "job", "exception"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Level</label>
          <select className={inputCls} value={level} onChange={(e) => { setLevel(e.target.value); setPage(1) }}>
            <option value="">All</option>
            {["debug", "info", "warn", "error"].map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <button type="button" className={btnSecondary} onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</button>
        <button type="button" className={btnSecondary} onClick={exportCsv}><Download className="w-4 h-4" /> Export / Download</button>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : !data?.items?.length ? (
        <EmptyState title="No logs yet" description="API calls, crawls, AI, SMTP, and campaign events appear here." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="p-2 font-medium">Time</th>
                <th className="p-2 font-medium">Level</th>
                <th className="p-2 font-medium">Category</th>
                <th className="p-2 font-medium">Action</th>
                <th className="p-2 font-medium">Message</th>
                <th className="p-2 font-medium">ms</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((log: any) => (
                <tr key={log.id} className={`border-b border-gray-50 ${!log.success ? "bg-red-50/50" : ""}`}>
                  <td className="p-2 text-xs text-gray-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="p-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      log.level === "error" ? "bg-red-100 text-red-800" :
                      log.level === "warn" ? "bg-amber-100 text-amber-800" :
                      "bg-gray-100 text-gray-700"
                    }`}>{log.level}</span>
                  </td>
                  <td className="p-2 text-xs">{log.category}</td>
                  <td className="p-2 text-xs font-mono">{log.action}</td>
                  <td className="p-2 text-gray-700 max-w-md truncate" title={log.message}>{log.message}</td>
                  <td className="p-2 text-xs text-gray-400">{log.durationMs ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between p-3 text-sm text-gray-600">
            <span>{data.total} logs</span>
            <div className="flex gap-2">
              <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className={btnSecondary} disabled={page * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
