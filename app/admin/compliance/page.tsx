"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsCard,
  OpsRefreshButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsPrimaryButton,
  OpsTableShell,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import { formatDate } from "@/lib/admin-session"
import { humanizeAuditAction } from "@/lib/audit-labels"
import {
  Plus,
  FileText,
  Shield,
  Download,
  Eye,
  Upload,
  ScrollText,
  Loader2,
  Printer,
  Trash2,
  Filter,
  User,
} from "lucide-react"

type ComplianceStatus = "valid" | "expiring" | "expired" | "pending" | "missing"

type ChecklistItem = {
  docType: string
  title: string
  status: ComplianceStatus
  document: {
    id: number
    fileUrl: string | null
    fileName: string | null
    expiresAt: string | null
    notes: string | null
    updatedAt: string
    uploadedBy: string | null
  } | null
}

type Summary = {
  total: number
  valid: number
  expiring: number
  expired: number
  missing: number
}

type DocTypeOption = { type: string; title: string }

type AuditLogItem = {
  id: number
  action: string
  actionLabel?: string
  entityType: string
  entityId?: string | null
  createdAt: string
  user?: {
    id?: number
    firstName?: string | null
    lastName?: string | null
    email?: string | null
  } | null
}

function authHeaders() {
  return {
    Authorization: `Bearer ${localStorage.getItem("authToken") || sessionStorage.getItem("authToken")}`,
  }
}

function statusTone(status: string) {
  switch (status) {
    case "valid":
      return "text-emerald-600"
    case "expiring":
      return "text-amber-600"
    case "expired":
      return "text-rose-600"
    default:
      return "text-slate-400"
  }
}

function userLabel(user?: AuditLogItem["user"] | null) {
  if (!user) return "System"
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "User"
}

export default function CompliancePage() {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [docs, setDocs] = useState<any[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [docTypes, setDocTypes] = useState<DocTypeOption[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [docType, setDocType] = useState("id_verification")
  const [expiresAt, setExpiresAt] = useState("")
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [tab, setTab] = useState("all")

  // Audit filters
  const [auditSearch, setAuditSearch] = useState("")
  const [auditAction, setAuditAction] = useState("")
  const [auditUserId, setAuditUserId] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const loadDocs = useCallback(async () => {
    const docsRes = await axios.get("/api/compliance/documents", { headers: authHeaders() })
    if (docsRes.data.success) {
      const raw = docsRes.data.data
      setChecklist(Array.isArray(raw?.checklist) ? raw.checklist : [])
      setDocs(Array.isArray(raw?.documents) ? raw.documents : [])
      setSummary(raw?.summary || null)
      setDocTypes(Array.isArray(raw?.docTypes) ? raw.docTypes : [])
      if (raw?.docTypes?.[0]?.type) {
        setDocType((prev) => prev || raw.docTypes[0].type)
      }
      return true
    }
    setError(docsRes.data.message || "Failed to load compliance")
    return false
  }, [])

  const loadAudit = useCallback(async () => {
    const params: Record<string, string | number> = { limit: 50 }
    if (auditSearch.trim()) params.search = auditSearch.trim()
    if (auditAction.trim()) params.action = auditAction.trim()
    if (auditUserId.trim()) params.userId = Number(auditUserId)
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo

    const logsRes = await axios.get("/api/audit-logs", {
      headers: authHeaders(),
      params,
    })
    if (logsRes.data?.success && Array.isArray(logsRes.data.data)) {
      setAuditLogs(logsRes.data.data)
    } else {
      setAuditLogs([])
    }
  }, [auditSearch, auditAction, auditUserId, dateFrom, dateTo])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      await Promise.all([loadDocs(), loadAudit()])
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load compliance documents")
      setChecklist([])
      setDocs([])
      setAuditLogs([])
    } finally {
      setLoading(false)
    }
  }, [loadDocs, loadAudit])

  useEffect(() => {
    load()
  }, [load])

  const auditUsers = useMemo(() => {
    const map = new Map<number, string>()
    for (const log of auditLogs) {
      if (log.user?.id) map.set(log.user.id, userLabel(log.user))
    }
    for (const d of docs) {
      // uploader id not always present; skip
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [auditLogs, docs])

  const openUploadFor = (type: string) => {
    setDocType(type)
    setTitle("")
    setExpiresAt("")
    setNotes("")
    setFile(null)
    setShowForm(true)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      setError("")
      const fd = new FormData()
      fd.append("docType", docType)
      if (title.trim()) fd.append("title", title.trim())
      if (expiresAt.trim()) fd.append("expiresAt", expiresAt.trim())
      if (notes.trim()) fd.append("notes", notes.trim())
      if (file) fd.append("file", file)

      const res = await axios.post("/api/compliance/documents", fd, {
        headers: authHeaders(),
      })
      if (res.data.success) {
        setToast("Document uploaded")
        setShowForm(false)
        setTitle("")
        setExpiresAt("")
        setNotes("")
        setFile(null)
        await load()
      } else {
        setError(res.data.message || "Failed to upload")
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to add document")
    } finally {
      setSaving(false)
    }
  }

  const deleteDoc = async (id: number) => {
    if (!confirm("Delete this compliance document? This cannot be undone.")) return
    try {
      setDeletingId(id)
      await axios.delete(`/api/compliance/documents/${id}`, { headers: authHeaders() })
      setToast("Document deleted")
      await load()
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to delete document")
    } finally {
      setDeletingId(null)
    }
  }

  const buildAuditParams = () => {
    const params: Record<string, string | number> = { limit: 500 }
    if (auditSearch.trim()) params.search = auditSearch.trim()
    if (auditAction.trim()) params.action = auditAction.trim()
    if (auditUserId.trim()) params.userId = Number(auditUserId)
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    return params
  }

  const exportAuditTrail = async (format: "csv" | "pdf" = "csv") => {
    try {
      setExporting(true)
      if (format === "pdf") {
        const res = await axios.get("/api/audit-logs", {
          headers: authHeaders(),
          params: { ...buildAuditParams(), format: "html" },
          responseType: "text",
        })
        const html = String(res.data).includes("window.print")
          ? String(res.data)
          : String(res.data).replace(
              "</body>",
              "<script>setTimeout(function(){window.print()},300)</script></body>"
            )
        const blob = new Blob([html], { type: "text/html;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        window.open(url, "_blank")
        setToast("Printable audit report opened — use Save as PDF")
        return
      }

      const res = await axios.get("/api/audit-logs", {
        headers: authHeaders(),
        params: { ...buildAuditParams(), format: "csv" },
        responseType: "blob",
      })
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "tidyflow-audit-trail.csv"
      a.click()
      URL.revokeObjectURL(url)
      setToast("Audit trail exported (CSV)")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to export audit trail")
    } finally {
      setExporting(false)
    }
  }

  const filteredChecklist = useMemo(() => {
    if (tab === "all") return checklist
    return checklist.filter((d) => String(d.status || "").toLowerCase() === tab)
  }, [checklist, tab])

  const typeOptions =
    docTypes.length > 0
      ? docTypes
      : [
          { type: "id_verification", title: "ID Verification" },
          { type: "coshh", title: "COSHH Documentation" },
          { type: "insurance", title: "Insurance Certificates" },
          { type: "health_safety", title: "Health & Safety Policy" },
          { type: "dbs_check", title: "DBS / Background Check" },
        ]

  const attentionNeeded =
    (summary?.expired || 0) + (summary?.expiring || 0) + (summary?.missing || 0)

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Safety & compliance"
          title="Compliance"
          subtitle="Required documents, expiry tracking, and company audit trail"
          actions={
            <>
              <OpsRefreshButton onClick={load} loading={loading} />
              <button
                type="button"
                onClick={() => exportAuditTrail("csv")}
                disabled={exporting}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-control-border bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-600 hover:text-amber-700 disabled:opacity-50 dark:border-amber-800/50 dark:bg-control-darkCard dark:text-slate-200"
              >
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => exportAuditTrail("pdf")}
                disabled={exporting}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-control-border bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-600 hover:text-amber-700 disabled:opacity-50 dark:border-amber-800/50 dark:bg-control-darkCard dark:text-slate-200"
              >
                <Printer size={14} />
                Print / PDF
              </button>
              <OpsPrimaryButton onClick={() => openUploadFor(docType || typeOptions[0].type)}>
                <Plus size={14} /> Upload document
              </OpsPrimaryButton>
            </>
          }
        />
        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        {attentionNeeded > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <strong>{attentionNeeded}</strong> document(s) need attention (missing, expiring, or
            expired). Managers also receive a weekly compliance digest every Monday.
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(
              [
                { key: "valid", value: summary.valid, color: "text-emerald-600" },
                { key: "expiring", value: summary.expiring, color: "text-amber-600" },
                { key: "expired", value: summary.expired, color: "text-rose-600" },
                { key: "missing", value: summary.missing, color: "text-slate-400" },
              ] as const
            ).map((chip) => (
              <OpsCard key={chip.key}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {chip.key}
                </p>
                <p className={`mt-1 font-mono text-2xl font-black ${chip.color}`}>{chip.value}</p>
              </OpsCard>
            ))}
          </div>
        )}

        {showForm && (
          <OpsCard>
            <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Document type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                >
                  {typeOptions.map((opt) => (
                    <option key={opt.type} value={opt.type}>
                      {opt.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Title (optional)
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Override default title"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Expires at
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  File
                </label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-amber-50 file:px-3 file:py-1 file:text-xs file:font-bold file:text-amber-800 dark:border-navy-800 dark:bg-navy-950"
                />
              </div>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm font-semibold text-slate-500"
                >
                  Cancel
                </button>
                <OpsPrimaryButton type="submit" disabled={saving}>
                  {saving ? "Uploading…" : "Save document"}
                </OpsPrimaryButton>
              </div>
            </form>
          </OpsCard>
        )}

        <OpsTableShell
          title="Required documents"
          badge={
            <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
              {filteredChecklist.length}
            </span>
          }
          tabs={[
            { id: "all", label: "All" },
            { id: "valid", label: "Valid" },
            { id: "expiring", label: "Expiring" },
            { id: "expired", label: "Expired" },
            { id: "missing", label: "Missing" },
          ]}
          activeTab={tab}
          onTabChange={setTab}
          footer={<span>COMPANY COMPLIANCE CHECKLIST</span>}
        >
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
          ) : filteredChecklist.length === 0 ? (
            <OpsEmpty message="No required documents in this filter" />
          ) : (
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Document</th>
                  <th className={opsTh}>Uploaded by</th>
                  <th className={opsTh}>Expires</th>
                  <th className={opsTh}>Status</th>
                  <th className={opsTh}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {filteredChecklist.map((item) => (
                  <tr key={item.docType} className="hover:bg-amber-50/30 dark:hover:bg-amber-950/10">
                    <td className={opsTd}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700 dark:bg-navy-900 dark:text-amber-400">
                          <FileText size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-navy-900 dark:text-white">{item.title}</p>
                          <p className="truncate font-mono text-[10px] uppercase text-slate-400">
                            {item.docType.replace(/_/g, " ")}
                            {item.document?.fileName ? ` · ${item.document.fileName}` : ""}
                          </p>
                          {item.document?.notes ? (
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {item.document.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className={`${opsTd} text-xs text-slate-600`}>
                      <span className="inline-flex items-center gap-1">
                        <User size={12} className="text-slate-400" />
                        {item.document?.uploadedBy || "—"}
                      </span>
                      {item.document?.updatedAt ? (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {formatDate(item.document.updatedAt)}
                        </p>
                      ) : null}
                    </td>
                    <td className={`${opsTd} text-xs text-slate-500`}>
                      {item.document?.expiresAt ? formatDate(item.document.expiresAt) : "—"}
                    </td>
                    <td className={opsTd}>
                      <span className={`text-xs font-bold uppercase ${statusTone(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className={opsTd}>
                      <div className="flex items-center gap-2">
                        {item.document?.fileUrl ? (
                          <a
                            href={item.document.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-amber-500 hover:text-amber-700 dark:border-navy-800"
                            title="View file"
                          >
                            <Eye size={14} />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openUploadFor(item.docType)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-amber-500 hover:text-amber-700 dark:border-navy-800"
                          title="Upload / replace"
                        >
                          <Upload size={14} />
                        </button>
                        {item.document?.id ? (
                          <button
                            type="button"
                            onClick={() => deleteDoc(item.document!.id)}
                            disabled={deletingId === item.document.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-rose-500 hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50 dark:border-navy-800"
                            title="Delete"
                          >
                            {deletingId === item.document.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </OpsTableShell>

        <div className="grid gap-4 lg:grid-cols-2">
          <OpsCard>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-extrabold text-navy-900 dark:text-white">
                  Recent audit activity
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportAuditTrail("csv")}
                  disabled={exporting}
                  className="text-[11px] font-bold text-amber-700 hover:underline disabled:opacity-50"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportAuditTrail("pdf")}
                  disabled={exporting}
                  className="text-[11px] font-bold text-amber-700 hover:underline disabled:opacity-50"
                >
                  Print / PDF
                </button>
              </div>
            </div>

            <div className="mb-3 grid gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-navy-800 dark:bg-navy-950/40 sm:grid-cols-2">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:col-span-2">
                <Filter size={12} /> Filters
              </div>
              <input
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search action / user / entity"
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-navy-800 dark:bg-navy-950"
              />
              <input
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
                placeholder="Action contains…"
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-navy-800 dark:bg-navy-950"
              />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-navy-800 dark:bg-navy-950"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-navy-800 dark:bg-navy-950"
              />
              <select
                value={auditUserId}
                onChange={(e) => setAuditUserId(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs sm:col-span-2 dark:border-navy-800 dark:bg-navy-950"
              >
                <option value="">All users</option>
                {auditUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
            ) : auditLogs.length === 0 ? (
              <OpsEmpty message="No audit events for these filters" />
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto">
                {auditLogs.map((log) => (
                  <li
                    key={log.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-navy-800 dark:bg-navy-950/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-navy-900 dark:text-white">
                        {log.actionLabel || humanizeAuditAction(log.action)}
                      </p>
                      <time className="shrink-0 font-mono text-[10px] text-slate-400">
                        {new Date(log.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {userLabel(log.user)} · {log.entityType}
                      {log.entityId ? ` #${log.entityId}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </OpsCard>

          <OpsCard>
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-extrabold text-navy-900 dark:text-white">
                Upload history
              </h2>
            </div>
            {docs.length === 0 ? (
              <OpsEmpty message="No uploads yet" />
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto">
                {docs.slice(0, 20).map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-navy-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-navy-900 dark:text-white">
                        {d.title || d.fileName || `Document #${d.id}`}
                      </p>
                      <p className="font-mono text-[10px] uppercase text-slate-400">
                        {d.docType}
                        {d.fileName ? ` · ${d.fileName}` : ""}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {d.uploader
                          ? [d.uploader.firstName, d.uploader.lastName].filter(Boolean).join(" ") ||
                            "Team"
                          : "—"}{" "}
                        · {formatDate(d.updatedAt || d.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <OpsBadge status={d.status || "active"} />
                      {d.fileUrl ? (
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-amber-700"
                        >
                          <Eye size={14} />
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </OpsCard>
        </div>
      </div>
    </AdminLayout>
  )
}
