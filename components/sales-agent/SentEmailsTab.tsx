"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import {
  saGet,
  saPost,
  LoadingBlock,
  MessageBanner,
  EmptyState,
  btnSecondary,
  inputCls,
} from "./shared"
import { Download, RefreshCw } from "lucide-react"

export default function SentEmailsTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [search, setSearch] = useState("")
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = { page, pageSize: 25 }
      if (status) params.status = status
      if (search) params.search = search
      setData(await saGet("/sent-emails", params))
    } catch (e: any) {
      setMessage({ type: "error", text: e.message })
    } finally {
      setLoading(false)
    }
  }, [page, status, search])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4">
      <MessageBanner message={message} />
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-gray-600">Search</label>
          <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recipient or subject" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Status</label>
          <select className={inputCls} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="">All</option>
            {["PENDING", "QUEUED", "SENT", "DELIVERED", "OPENED", "FAILED", "BOUNCED", "RETRYING"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button type="button" className={btnSecondary} onClick={load}><RefreshCw className="w-4 h-4" /> Refresh</button>
        <button
          type="button"
          className={btnSecondary}
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
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : !data?.items?.length ? (
        <EmptyState title="No sent emails" description="History is permanent — nothing is auto-deleted." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="p-3 font-medium">Company</th>
                <th className="p-3 font-medium">Recipient</th>
                <th className="p-3 font-medium">Subject</th>
                <th className="p-3 font-medium">Campaign</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">AI</th>
                <th className="p-3 font-medium">Sent</th>
                <th className="p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e: any) => (
                <Fragment key={e.id}>
                  <tr className="border-b border-gray-100">
                    <td className="p-3">{e.company?.name || "—"}</td>
                    <td className="p-3">
                      <div>{e.recipientEmail}</div>
                      <div className="text-xs text-gray-400">{e.recipientName}</div>
                    </td>
                    <td className="p-3 max-w-xs truncate">{e.subject}</td>
                    <td className="p-3 text-gray-600">{e.campaign?.name || "—"}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        e.deliveryStatus === "FAILED" ? "bg-red-100 text-red-800" :
                        e.deliveryStatus === "SENT" || e.deliveryStatus === "DELIVERED" ? "bg-green-100 text-green-800" :
                        "bg-gray-100 text-gray-700"
                      }`}>{e.deliveryStatus}</span>
                      {e.retryCount > 0 && <span className="text-xs text-gray-400 ml-1">r{e.retryCount}</span>}
                    </td>
                    <td className="p-3 text-xs">{e.aiProvider || "—"}</td>
                    <td className="p-3 text-xs text-gray-500">{e.sentAt ? new Date(e.sentAt).toLocaleString() : "—"}</td>
                    <td className="p-3">
                      <button type="button" className="text-indigo-600 text-xs mr-2" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>View</button>
                      {e.deliveryStatus === "FAILED" && (
                        <button type="button" className="text-amber-600 text-xs" onClick={async () => {
                          await saPost("/sent-emails", { action: "retry", id: e.id })
                          setMessage({ type: "success", text: "Retry queued" })
                          load()
                        }}>Retry</button>
                      )}
                    </td>
                  </tr>
                  {expanded === e.id && (
                    <tr>
                      <td colSpan={8} className="p-4 bg-gray-50 text-xs space-y-2">
                        <div><strong>Message ID:</strong> {e.messageId || "—"}</div>
                        <div><strong>Thread ID:</strong> {e.threadId || "—"}</div>
                        <div><strong>SMTP:</strong> {e.smtpResponse || "—"}</div>
                        <div><strong>Template:</strong> {e.template?.name || "—"}</div>
                        {e.errorMessage && <div className="text-red-600"><strong>Error:</strong> {e.errorMessage}</div>}
                        <div className="border rounded p-3 bg-white mt-2 whitespace-pre-wrap">{e.textBody || e.htmlBody?.replace(/<[^>]+>/g, " ") || ""}</div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between p-3 text-sm text-gray-600">
            <span>{data.total} emails (permanent history)</span>
            <div className="flex gap-2">
              <button type="button" className={btnSecondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className={btnSecondary} disabled={page * 25 >= data.total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
