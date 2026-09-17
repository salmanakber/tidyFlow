"use client"

import { useEffect, useState } from "react"
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
} from "@/components/ops/OpsChrome"
import { formatDate } from "@/lib/admin-session"
import { Plus, FileText } from "lucide-react"

export default function CompliancePage() {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [docType, setDocType] = useState("policy")
  const [saving, setSaving] = useState(false)

  const headers = () => ({
    Authorization: `Bearer ${localStorage.getItem("authToken") || sessionStorage.getItem("authToken")}`,
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await axios.get("/api/compliance/documents", { headers: headers() })
      if (res.data.success) setDocs(res.data.data || [])
      else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load compliance documents")
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
      const res = await axios.post(
        "/api/compliance/documents",
        { title, type: docType, name: title },
        { headers: headers() }
      )
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

        <OpsCard padding={false}>
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
          ) : docs.length === 0 ? (
            <OpsEmpty message="No compliance documents yet" />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-900">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-50 text-navy-700 dark:bg-navy-900 dark:text-amber-400">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-navy-900 dark:text-white">
                      {d.title || d.name || `Document #${d.id}`}
                    </p>
                    <p className="text-xs text-slate-400">
                      {d.type || d.docType || "document"} · {formatDate(d.createdAt)}
                    </p>
                  </div>
                  <OpsBadge status={d.status || "active"} />
                </li>
              ))}
            </ul>
          )}
        </OpsCard>
      </div>
    </AdminLayout>
  )
}
