
"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
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
import { Download, Loader2, RefreshCw, Eye, EyeOff, Mail, AlertTriangle, Trash2 } from "lucide-react"

function getStatusBadge(status: string) {
  const norm = (status || "").toUpperCase()
  if (norm === "FAILED" || norm === "BOUNCED") {
    return "bg-rose-50 text-rose-700 border border-rose-100"
  }
  if (norm === "SENT" || norm === "DELIVERED" || norm === "OPENED") {
    return "bg-green-50 text-green-700 border border-green-100"
  }
  if (norm === "PENDING" || norm === "QUEUED" || norm === "RETRYING") {
    return "bg-amber-50 text-[#D97706] border border-[#FEF3C7]"
  }
  return "bg-slate-50 text-slate-600 border border-slate-100"
}

export default function SentEmailsTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [search, setSearch] = useState("")
  const [groupId, setGroupId] = useState("")
  const [groups, setGroups] = useState<any[]>([])
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [retrying, setRetrying] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const params: Record<string, any> = { page, pageSize: 25 }
      if (status) params.status = status
      if (search) params.search = search
      if (groupId) params.discoveryGroupId = groupId
      const next = await saGet("/sent-emails", params)
      setData(next)
      if (!silent) setSelected([])
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, status, search, groupId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    saGet("/groups")
      .then((g) => setGroups(Array.isArray(g) ? g : []))
      .catch(() => {})
  }, [])

  // Live list while campaign sends — no manual refresh needed
  useEffect(() => {
    const t = setInterval(() => load(true), 4000)
    return () => clearInterval(t)
  }, [load])

  const toggleSelect = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleSelectAll = () => {
    const ids = (data?.items || []).map((e: any) => e.id)
    setSelected((prev) => (prev.length === ids.length ? [] : ids))
  }

  const deleteOne = async (e: any) => {
    if (!window.confirm(`Delete sent email to ${e.recipientEmail}?`)) return
    setDeleting(true)
    try {
      await saDelete("/sent-emails", { id: e.id })
      setMessage({ type: "success", text: "Sent email deleted" })
      if (expanded === e.id) setExpanded(null)
      await load(true)
    } catch (err: any) {
      setMessage({ type: "error", text: err.message })
    } finally {
      setDeleting(false)
    }
  }

  const deleteSelected = async () => {
    if (!selected.length) return
    if (!window.confirm(`Delete ${selected.length} sent email(s)?`)) return
    setDeleting(true)
    try {
      await saPost("/sent-emails", { action: "bulk_delete", ids: selected })
      setMessage({ type: "success", text: `Deleted ${selected.length} sent emails` })
      setExpanded(null)
      await load(true)
    } catch (err: any) {
      setMessage({ type: "error", text: err.message })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <MessageBanner message={message} />
      
      {/* Search & Filter Utility Bar */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider mb-1.5">
            Search Term
          </label>
          <input
            className={`${inputCls} transition-all duration-150 focus:border-[#D97706] focus:ring-1 focus:ring-[#D97706]`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipient address or subject..."
          />
        </div>
        
        <div className="w-full sm:w-[180px]">
          <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider mb-1.5">
            Delivery Status
          </label>
          <select
            className={`${inputCls} transition-all duration-150 focus:border-[#D97706]`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All statuses</option>
            {["PENDING", "QUEUED", "SENT", "DELIVERED", "OPENED", "FAILED", "BOUNCED", "RETRYING", "CANCELED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-[220px]">
          <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider mb-1.5">
            Lead group
          </label>
          <select
            className={`${inputCls} transition-all duration-150 focus:border-[#D97706]`}
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.label || `Group #${g.id}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 px-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live updating
          </span>
          <button 
            type="button" 
            className={`${btnSecondary} inline-flex items-center gap-1.5 text-xs text-[#0D1E36] hover:bg-slate-50`} 
            onClick={() => load()}
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#D97706]" /> Refresh
          </button>
          
          <button
            type="button"
            className={`${btnSecondary} inline-flex items-center gap-1.5 text-xs text-[#0D1E36] hover:bg-slate-50`}
            onClick={() => {
              const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
              fetch("/api/admin/sales-agent/export?type=sent-emails&format=csv", {
                headers: { Authorization: `Bearer ${token}` },
              })
                .then((r) => r.blob())
                .then((blob) => {
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = "sent-emails.csv"
                  a.click()
                })
            }}
          >
            <Download className="w-3.5 h-3.5 text-[#D97706]" /> Export CSV
          </button>

          {selected.length > 0 && (
            <button
              type="button"
              className={`${btnSecondary} inline-flex items-center gap-1.5 text-xs text-rose-700 border-rose-200 hover:bg-rose-50`}
              disabled={deleting}
              onClick={deleteSelected}
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete ({selected.length})
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : !data?.items?.length ? (
        <EmptyState title="No logs matching criteria" description="Dispatched messages initiated from active campaigns will list here." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="text-gray-500 text-[10px] font-bold uppercase tracking-wider bg-slate-50 border-b border-gray-200">
                  <th className="p-4 pl-5 w-10">
                    <input
                      type="checkbox"
                      checked={!!data.items.length && selected.length === data.items.length}
                      onChange={toggleSelectAll}
                      className="accent-[#0D1E36]"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="p-4">Associated Company</th>
                  <th className="p-4">Recipient</th>
                  <th className="p-4">Subject</th>
                  <th className="p-4">Campaign context</th>
                  <th className="p-4">Round</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Scheduled / Sent</th>
                  <th className="p-4 text-right pr-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((e: any) => (
                  <Fragment key={e.id}>
                    <tr className="hover:bg-slate-50 transition-colors duration-100">
                      <td className="p-4 pl-5">
                        <input
                          type="checkbox"
                          checked={selected.includes(e.id)}
                          onChange={() => toggleSelect(e.id)}
                          className="accent-[#0D1E36]"
                          aria-label={`Select ${e.recipientEmail}`}
                        />
                      </td>
                      <td className="p-4 font-semibold text-[#0D1E36]">{e.company?.name || "—"}</td>
                      <td className="p-4">
                        <div className="font-medium text-slate-800">{e.recipientEmail}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{e.recipientName || "No name configured"}</div>
                      </td>
                      <td className="p-4 max-w-[200px] truncate text-slate-600" title={e.subject}>
                        {e.subject}
                      </td>
                      <td className="p-4 text-slate-500">{e.campaign?.name || "—"}</td>
                      <td className="p-4">
                        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          Round {e.sequenceStep || 1}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-block text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${getStatusBadge(e.deliveryStatus)}`}>
                          {e.deliveryStatus}
                        </span>
                      </td>
                      <td className="p-4 text-[10px] text-gray-500 font-mono space-y-0.5">
                        {e.sentAt ? (
                          <div>
                            <span className="text-green-700 font-semibold">Sent </span>
                            {new Date(e.sentAt).toLocaleString()}
                          </div>
                        ) : e.scheduledFor ? (
                          <div>
                            <span className="text-amber-700 font-semibold">Due </span>
                            {new Date(e.scheduledFor).toLocaleString()}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-4 text-right pr-5 whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-3">
                          <button
                            type="button"
                            className="text-[#0D1E36] hover:text-[#D97706] font-semibold text-[11px] inline-flex items-center gap-1 transition-colors"
                            onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                          >
                            {expanded === e.id ? (
                              <>
                                <EyeOff className="w-3.5 h-3.5" /> Hide
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5" /> View
                              </>
                            )}
                          </button>
                          
                          {e.deliveryStatus === "FAILED" && (
                            <button
                              type="button"
                              className="text-[#D97706] hover:text-[#B45309] font-semibold text-[11px] inline-flex items-center gap-1 transition-colors"
                              disabled={retrying === e.id}
                              onClick={async () => {
                                setRetrying(e.id)
                                try {
                                  await saPost("/sent-emails", { action: "retry", id: e.id })
                                  setMessage({ type: "success", text: "Retry started" })
                                  await load(true)
                                } catch (err: any) {
                                  setMessage({ type: "error", text: err.message })
                                } finally {
                                  setRetrying(null)
                                }
                              }}
                            >
                              {retrying === e.id ? (
                                <Loader2 className="w-3 h-3 animate-spin text-[#D97706]" />
                              ) : (
                                <AlertTriangle className="w-3 h-3" />
                              )}
                              Retry
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-rose-600 hover:text-rose-800 font-semibold text-[11px] inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                            disabled={deleting}
                            onClick={() => deleteOne(e)}
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Expanded Email Inspector Section */}
                    {expanded === e.id && (
                      <tr>
                        <td colSpan={9} className="p-0 bg-slate-50 border-b border-gray-200">
                          <div className="p-5 space-y-4">
                            {/* Metadata labels */}
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-slate-500 border-b border-gray-200 pb-3">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="font-semibold text-[#0D1E36]">Template:</span> 
                                <span className="underline">{e.template?.name || "No template mapped"}</span>
                              </span>
                              <span>
                                <span className="font-semibold text-[#0D1E36]">To:</span> {e.recipientEmail}
                              </span>
                              {e.messageId && (
                                <span className="font-mono text-[10px] bg-white border px-1.5 py-0.5 rounded text-gray-400" title={e.messageId}>
                                  ID: {e.messageId}
                                </span>
                              )}
                            </div>

                            {/* Error messaging bar if present */}
                            {e.errorMessage && (
                              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-4 py-3 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold">Dispatch Error:</span> {e.errorMessage}
                                </div>
                              </div>
                            )}

                            {/* Email viewport panel */}
                            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                              <div className="px-4 py-2.5 border-b border-gray-100 bg-slate-50 text-xs font-semibold text-[#0D1E36] flex items-center gap-2">
                                <Mail className="w-3.5 h-3.5 text-[#D97706]" />
                                Subject Line: {e.subject}
                              </div>
                              
                              {e.htmlBody ? (
                                <iframe
                                  title={`email-${e.id}`}
                                  sandbox=""
                                  srcDoc={e.htmlBody}
                                  className="w-full min-h-[300px] bg-white"
                                />
                              ) : (
                                <pre className="p-5 text-xs whitespace-pre-wrap text-slate-700 font-sans leading-relaxed">
                                  {e.textBody || "(No plaintext body preserved)"}
                                </pre>
                              )}
                            </div>

                            {/* Plaintext secondary backup details foldout */}
                            {e.textBody && e.htmlBody && (
                              <details className="text-xs text-slate-400 group">
                                <summary className="cursor-pointer font-semibold text-[#0D1E36] hover:text-[#D97706] transition-colors outline-none select-none">
                                  View raw plaintext backup copy
                                </summary>
                                <pre className="mt-2.5 p-4 bg-white border border-gray-200 rounded-lg whitespace-pre-wrap font-sans text-slate-600 leading-relaxed shadow-inner">
                                  {e.textBody}
                                </pre>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-50 border-t border-gray-200 text-xs text-slate-500">
            <span>Total records tracked: <strong className="text-[#0D1E36]">{data.total}</strong> logs</span>
            
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
                disabled={page * 25 >= data.total}
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
