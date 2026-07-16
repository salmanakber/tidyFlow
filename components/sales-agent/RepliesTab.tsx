"use client"

import { useCallback, useEffect, useState } from "react"
import {
  saGet,
  saPost,
  saPatch,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnPrimary,
  btnSecondary,
  inputCls,
} from "./shared"
import { Plus } from "lucide-react"

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

  return (
    <div className="space-y-4">
      <MessageBanner message={message} />
      <div className="flex flex-wrap gap-2 items-end justify-between">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[180px]">
            <label className="text-xs font-medium text-gray-600">Search</label>
            <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Intent</label>
            <select className={inputCls} value={intent} onChange={(e) => { setIntent(e.target.value); setPage(1) }}>
              <option value="">All</option>
              {INTENTS.map((i) => <option key={i} value={i}>{i.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <button type="button" className={btnSecondary} onClick={load}>Refresh</button>
        </div>
        <button type="button" className={btnPrimary} onClick={() => setShowManual(!showManual)}>
          <Plus className="w-4 h-4" /> Log Reply
        </button>
      </div>

      {showManual && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3 shadow-sm">
          <input className={inputCls} placeholder="From email" value={manual.fromEmail} onChange={(e) => setManual({ ...manual, fromEmail: e.target.value })} />
          <input className={inputCls} placeholder="Subject" value={manual.subject} onChange={(e) => setManual({ ...manual, subject: e.target.value })} />
          <textarea className={inputCls} rows={4} placeholder="Reply body" value={manual.bodyText} onChange={(e) => setManual({ ...manual, bodyText: e.target.value })} />
          <button type="button" className={btnPrimary} onClick={async () => {
            try {
              await saPost("/replies", manual)
              setMessage({ type: "success", text: "Reply classified and stored" })
              setShowManual(false)
              load()
            } catch (e: any) {
              setMessage({ type: "error", text: e.message })
            }
          }}>Classify & Save</button>
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : !data?.items?.length ? (
        <EmptyState title="No replies yet" description="Incoming replies are classified by AI into intent categories." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {data.items.map((r: any) => (
                <li
                  key={r.id}
                  className={`p-4 cursor-pointer hover:bg-gray-50 ${selected?.id === r.id ? "bg-indigo-50" : ""}`}
                  onClick={() => setSelected(r)}
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{r.fromEmail}</p>
                      <p className="text-xs text-gray-500">{r.company?.name || "Unknown company"}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full h-fit ${
                      r.isPositive ? "bg-green-100 text-green-800" : r.isPositive === false ? "bg-red-100 text-red-800" : "bg-gray-100"
                    }`}>{r.intent.replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{r.aiSummary || r.subject || r.bodyText}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(r.receivedAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
            <div className="flex justify-between p-3 text-sm border-t">
              <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className={btnSecondary} disabled={page * 25 >= data.total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            {!selected ? (
              <EmptyState title="Select a reply" description="View full conversation thread and AI classification." />
            ) : (
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">Reply Timeline</h3>
                <div className="text-sm space-y-1">
                  <p><span className="text-gray-500">From:</span> {selected.fromName || selected.fromEmail}</p>
                  <p><span className="text-gray-500">Company:</span> {selected.company?.name || "—"}</p>
                  <p><span className="text-gray-500">Sentiment:</span> {selected.sentiment || "—"}</p>
                  <p><span className="text-gray-500">AI Summary:</span> {selected.aiSummary || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Reclassify Intent</label>
                  <select
                    className={inputCls}
                    value={selected.intent}
                    onChange={async (e) => {
                      const intent = e.target.value
                      await saPatch("/replies", { id: selected.id, intent })
                      setSelected({ ...selected, intent })
                      load()
                    }}
                  >
                    {INTENTS.map((i) => <option key={i} value={i}>{i.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                {selected.sentEmail && (
                  <div className="border-l-2 border-indigo-200 pl-3 text-sm text-gray-600">
                    <p className="font-medium text-gray-800">Original outreach</p>
                    <p>{selected.sentEmail.subject}</p>
                    <p className="text-xs">{selected.sentEmail.sentAt ? new Date(selected.sentEmail.sentAt).toLocaleString() : ""}</p>
                  </div>
                )}
                <div className="border rounded-lg p-3 bg-gray-50 text-sm whitespace-pre-wrap">
                  {selected.bodyText || selected.bodyHtml?.replace(/<[^>]+>/g, " ") || "(empty)"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
