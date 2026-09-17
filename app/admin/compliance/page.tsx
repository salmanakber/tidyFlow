"use client"

import { useEffect, useMemo, useState } from "react"
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
import { Plus, FileText, Shield } from "lucide-react"

function asDocs(data: any): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.documents)) return data.documents
  return []
}

export default function CompliancePage() {
  const [docs, setDocs] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [docType, setDocType] = useState("policy")
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState("all")

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem("authToken") || sessionStorage.getItem("authToken")}`,
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await axios.get("/api/compliance/documents", { headers: headers() })
      if (res.data.success) {
        const raw = res.data.data
        setDocs(asDocs(raw))
        setSummary(raw?.summary || null)
      } else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load compliance documents")
      setDocs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      const fd = new FormData()
      fd.append("title", title)
      fd.append("docType", docType)
      const res = await axios.post("/api/compliance/documents", fd, {
        headers: headers(),
      })
      if (res.data.success) {
        setToast("Document added")
        setShowForm(false)
        setTitle("")
        await load()
      } else setError(res.data.message || "Failed")
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to add document")
    } finally {
      setSaving(false)
    }
  }

  const filtered = useMemo(() => {
    if (tab === "all") return docs
    return docs.filter((d) => String(d.status || "").toLowerCase() === tab)
  }, [docs, tab])

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Finance & reports"
          title="Compliance"
          subtitle="Policies and compliance documents for your company"
          actions={
            <>
              <OpsRefreshButton onClick={load} loading={loading} />
              <OpsPrimaryButton onClick={() => setShowForm(true)}>
                <Plus size={14} /> Add document
              </OpsPrimaryButton>
            </>
          }
        />
        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        {summary && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <OpsCard>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Documents</p>
              <p className="mt-1 font-mono text-2xl font-black text-navy-900 dark:text-white">
                {docs.length}
              </p>
            </OpsCard>
            <OpsCard>
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Shield size={12} className="text-amber-600" /> Status
              </p>
              <p className="mt-1 text-sm font-bold text-navy-900 dark:text-white">
                {typeof summary === "string"
                  ? summary
                  : summary.message || summary.label || "Tracked"}
              </p>
            </OpsCard>
          </div>
        )}

        {showForm && (
          <OpsCard>
            <form onSubmit={create} className="grid gap-3 md:grid-cols-3">
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document title"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2 dark:border-navy-800 dark:bg-navy-950"
              />
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              >
                <option value="policy">Policy</option>
                <option value="insurance">Insurance</option>
                <option value="certificate">Certificate</option>
                <option value="other">Other</option>
              </select>
              <div className="flex justify-end gap-2 md:col-span-3">
                <button type="button" onClick={() => setShowForm(false)} className="text-sm font-semibold">
                  Cancel
                </button>
                <OpsPrimaryButton type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </OpsPrimaryButton>
              </div>
            </form>
          </OpsCard>
        )}

        <OpsTableShell
          title="Compliance documents"
          badge={
            <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
              {filtered.length}
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
          footer={<span>COMPANY COMPLIANCE LEDGER</span>}
        >
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <OpsEmpty message="No compliance documents yet" />
          ) : (
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Document</th>
                  <th className={opsTh}>Type</th>
                  <th className={opsTh}>Updated</th>
                  <th className={opsTh}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-amber-50/30 dark:hover:bg-amber-950/10">
                    <td className={opsTd}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700 dark:bg-navy-900 dark:text-amber-400">
                          <FileText size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-navy-900 dark:text-white">
                            {d.title || d.name || `Document #${d.id}`}
                          </p>
                          <p className="font-mono text-[10px] text-slate-400">DOC-{d.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`${opsTd} font-mono text-xs uppercase text-slate-500`}>
                      {d.docType || d.type || "—"}
                    </td>
                    <td className={`${opsTd} text-xs text-slate-500`}>
                      {formatDate(d.updatedAt || d.createdAt)}
                    </td>
                    <td className={opsTd}>
                      <OpsBadge status={d.status || "active"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </OpsTableShell>
      </div>
    </AdminLayout>
  )
}
