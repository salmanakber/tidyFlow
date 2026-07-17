
"use client"

import { useCallback, useEffect, useState } from "react"
import {
  saGet,
  saPost,
  saPatch,
  saDelete,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnPrimary,
  btnSecondary,
  inputCls,
} from "./shared"
import { Plus, Loader2, RefreshCw, MessageSquare, ArrowRight, User, Calendar, Trash2 } from "lucide-react"

const INTENTS = [
  "INTERESTED",
  "NOT_INTERESTED",
  "BOOK_DEMO",
  "NEED_PRICING",
  "REQUEST_INFORMATION",
  "ALREADY_USING_COMPETITOR",
  "WRONG_CONTACT",
  "SPAM",
  "OTHER",
]

function getIntentBadge(intent: string, isPositive?: boolean) {
  const label = intent.replace(/_/g, " ")
  if (isPositive === true || intent === "BOOK_DEMO" || intent === "INTERESTED") {
    return "bg-green-50 text-green-700 border border-green-100"
  }
  if (isPositive === false || intent === "NOT_INTERESTED" || intent === "SPAM") {
    return "bg-rose-50 text-rose-700 border border-rose-100"
  }
  return "bg-amber-50 text-[#D97706] border border-[#FEF3C7]"
}

export default function RepliesTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [intent, setIntent] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [manual, setManual] = useState({ fromEmail: "", subject: "", bodyText: "" })
  const [selected, setSelected] = useState<any | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [savingManual, setSavingManual] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = { page, pageSize: 25 }
      if (intent) params.intent = intent
      if (search) params.search = search
      setData(await saGet("/replies", params))
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setLoading(false)
    }
  }, [page, intent, search])

  useEffect(() => {
    load()
  }, [load])

  const deleteReply = async (r: any) => {
    if (!window.confirm(`Delete reply from ${r.fromEmail}?`)) return
    setDeleting(true)
    try {
      await saDelete("/replies", { id: r.id })
      setMessage({ type: "success", text: "Reply deleted" })
      if (selected?.id === r.id) setSelected(null)
      await load()
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <MessageBanner message={message} />
      
      {/* Control Actions Panel */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-[220px]">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider mb-1.5">
              Search Replies
            </label>
            <input 
              className={`${inputCls} focus:border-[#D97706]`} 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Email or keyword..."
            />
          </div>
          
          <div className="w-full sm:w-[180px]">
            <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider mb-1.5">
              AI Classified Intent
            </label>
            <select 
              className={`${inputCls} focus:border-[#D97706]`} 
              value={intent} 
              onChange={(e) => { setIntent(e.target.value); setPage(1) }}
            >
              <option value="">All intents</option>
              {INTENTS.map((i) => (
                <option key={i} value={i}>
                  {i.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              type="button" 
              className={`${btnSecondary} inline-flex items-center gap-1.5 hover:bg-slate-50`} 
              onClick={load} 
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D97706]" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-[#D97706]" />
              )}
              Refresh
            </button>
            
            <button
              type="button"
              className={`${btnSecondary} inline-flex items-center gap-1.5 hover:bg-slate-50`}
              disabled={syncing}
              onClick={async () => {
                setSyncing(true)
                try {
                  const res = await saPost("/replies", { action: "sync_inbox" })
                  setMessage({
                    type: "success",
                    text: `Inbox synchronization completed. Found ${res.imported ?? 0} new replies.`,
                  })
                  await load()
                } catch (e: any) {
                  setMessage({ type: "error", text: e.message })
                } finally {
                  setSyncing(false)
                }
              }}
            >
              {syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D97706]" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-[#D97706]" />
              )}
              Sync inbox
            </button>
          </div>
        </div>

        <button 
          type="button" 
          className="inline-flex items-center justify-center gap-1.5 bg-[#0D1E36] hover:bg-[#142944] text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all duration-150 shrink-0" 
          onClick={() => setShowManual(!showManual)}
        >
          <Plus className="w-4 h-4 text-[#D97706]" /> Log Manual Reply
        </button>
      </div>

      {showManual && (
        <div className="bg-white rounded-xl border-l-4 border-l-[#D97706] border-y border-r border-gray-200 p-5 shadow-sm space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0D1E36]">Log Incoming Thread Manually</h3>
            <p className="text-[11px] text-gray-400">Log outreach replies that skipped direct synchronization</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input 
              className={`${inputCls} focus:border-[#D97706]`} 
              placeholder="From Email Address" 
              value={manual.fromEmail} 
              onChange={(e) => setManual({ ...manual, fromEmail: e.target.value })} 
            />
            <input 
              className={`${inputCls} focus:border-[#D97706]`} 
              placeholder="Subject Heading" 
              value={manual.subject} 
              onChange={(e) => setManual({ ...manual, subject: e.target.value })} 
            />
            <textarea 
              className={`${inputCls} sm:col-span-2 focus:border-[#D97706]`} 
              rows={4} 
              placeholder="Copy plain text conversation body here..." 
              value={manual.bodyText} 
              onChange={(e) => setManual({ ...manual, bodyText: e.target.value })} 
            />
          </div>

          <div className="flex items-center gap-3">
            <button 
              type="button" 
              className="inline-flex items-center gap-1.5 bg-[#D97706] hover:bg-[#C26405] text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm transition-all" 
              disabled={savingManual} 
              onClick={async () => {
                setSavingManual(true)
                try {
                  await saPost("/replies", manual)
                  setMessage({ type: "success", text: "Reply classified and successfully stored." })
                  setShowManual(false)
                  load()
                } catch (e: any) {
                  setMessage({ type: "error", text: e.message })
                } finally {
                  setSavingManual(false)
                }
              }}
            >
              {savingManual && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Classify & Store Reply
            </button>
            <button 
              type="button" 
              className={btnSecondary} 
              onClick={() => setShowManual(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : !data?.items?.length ? (
        <EmptyState title="Conversations Empty" description="Inbound messages are classified automatically by sentiment AI categories." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Left Column: Inbox List */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-[#0D1E36] px-4 py-3.5 border-b border-gray-200 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-[#D97706]" />
                Classification Feed
              </span>
              <span className="text-[10px] font-semibold text-slate-300 font-mono">
                Page {page} of {Math.ceil(data.total / 25) || 1}
              </span>
            </div>
            
            <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
              {data.items.map((r: any) => {
                const isCurrent = selected?.id === r.id
                return (
                  <li
                    key={r.id}
                    className={`p-4 cursor-pointer transition-all duration-150 border-l-4 ${
                      isCurrent 
                        ? "bg-[#F4F7FC] border-l-[#D97706]" 
                        : "border-l-transparent hover:bg-slate-50"
                    }`}
                    onClick={() => setSelected(r)}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-[#0D1E36] text-xs truncate max-w-[200px]">{r.fromEmail}</p>
                        <p className="text-[10px] text-gray-400 font-medium">{r.company?.name || "Unverified Contact"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wide ${getIntentBadge(r.intent, r.isPositive)}`}>
                          {r.intent.replace(/_/g, " ")}
                        </span>
                        <button
                          type="button"
                          className="text-rose-600 hover:text-rose-800 text-[10px] font-semibold inline-flex items-center gap-0.5"
                          disabled={deleting}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            deleteReply(r)
                          }}
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                      {r.aiSummary || r.subject || r.bodyText}
                    </p>
                    
                    <p className="text-[10px] text-gray-400 font-mono mt-2 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(r.receivedAt).toLocaleString()}
                    </p>
                  </li>
                )
              })}
            </ul>

            {/* Inbox Pagination Footer */}
            <div className="flex justify-between p-3.5 bg-slate-50 border-t border-gray-200">
              <button 
                type="button" 
                className={`${btnSecondary} bg-white text-[11px] py-1 px-3`} 
                disabled={page <= 1} 
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button 
                type="button" 
                className={`${btnSecondary} bg-white text-[11px] py-1 px-3`} 
                disabled={page * 25 >= data.total} 
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>

          {/* Right Column: Detailed Conversation Inspector */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 shadow-sm p-5 min-h-[500px]">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center py-20 text-center">
                <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
                <h4 className="text-xs font-bold text-[#0D1E36] uppercase tracking-wider">Inspect Conversation</h4>
                <p className="text-xs text-gray-400 max-w-xs mt-1">
                  Select a classified thread on the left pane to view original context, timeline progression, and classification parameters.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Header Information */}
                <div className="pb-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#EEF0F5] flex items-center justify-center text-[#0D1E36]">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#0D1E36]">{selected.fromName || selected.fromEmail}</h3>
                      <p className="text-[10px] text-gray-400">Classification Details & Metadata</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-rose-600 hover:text-rose-800 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                    disabled={deleting}
                    onClick={() => deleteReply(selected)}
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete reply
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-gray-100 rounded-lg text-xs">
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Associated Business</span>
                    <span className="font-semibold text-[#0D1E36]">{selected.company?.name || "No matched account"}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Identified Sentiment</span>
                    <span className="font-semibold text-[#0D1E36]">{selected.sentiment || "Neutral / Ambiguous"}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Automated AI Summary</span>
                    <p className="text-slate-600 leading-relaxed font-medium">{selected.aiSummary || "AI summary generation pending..."}</p>
                  </div>
                </div>

                {/* Reclassification Controls */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">
                    Override AI Classified Intent
                  </label>
                  <select
                    className={`${inputCls} focus:border-[#D97706]`}
                    value={selected.intent}
                    onChange={async (e) => {
                      const intent = e.target.value
                      await saPatch("/replies", { id: selected.id, intent })
                      setSelected({ ...selected, intent })
                      load()
                    }}
                  >
                    {INTENTS.map((i) => (
                      <option key={i} value={i}>
                        {i.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Timeline Interaction Sequence */}
                <div className="space-y-3 pt-3 border-t border-gray-100">
                  <h4 className="text-[10px] font-bold text-[#0D1E36] uppercase tracking-wider">Outreach Context Timeline</h4>
                  
                  {selected.sentEmail && (
                    <div className="relative pl-5 border-l-2 border-[#D97706]/30 space-y-1 text-xs">
                      <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-[#D97706]" />
                      <p className="font-bold text-[#0D1E36] flex items-center gap-1.5">
                        Original Outreach Sent
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                      </p>
                      <p className="text-slate-500 italic">"{selected.sentEmail.subject}"</p>
                      <p className="text-[9px] font-mono text-gray-400">
                        {selected.sentEmail.sentAt ? new Date(selected.sentEmail.sentAt).toLocaleString() : ""}
                      </p>
                    </div>
                  )}

                  <div className="relative pl-5 border-l-2 border-[#0D1E36]/10 space-y-2">
                    <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[#0D1E36]" />
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-[#0D1E36] text-xs">Inbound Response Received</p>
                    </div>
                    
                    <div className="border border-[#E3E7F0] rounded-xl p-4 bg-white shadow-xs text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">
                      {selected.bodyText || selected.bodyHtml?.replace(/<[^>]+>/g, " ") || "(empty conversation content)"}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
