"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsCard,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
} from "@/components/ops/OpsChrome"
import { Plus, Trash2 } from "lucide-react"
import { formatDate } from "@/lib/admin-session"

export default function AnnouncementsPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)

  const headers = () => {
    const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
    return { Authorization: `Bearer ${token}` }
  }

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const companyId = localStorage.getItem("selectedCompanyId")
      const res = await axios.get("/api/announcements", {
        headers: headers(),
        params: companyId ? { companyId } : {},
      })
      if (res.data.success) setItems(res.data.data || [])
      else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load announcements")
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
        "/api/announcements",
        { title, body, message: body, content: body },
        { headers: headers() }
      )
      if (res.data.success) {
        setToast("Announcement published")
        setShowForm(false)
        setTitle("")
        setBody("")
        await load()
      } else setError(res.data.message || "Failed")
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm("Delete this announcement?")) return
    try {
      await axios.delete(`/api/announcements?id=${id}`, { headers: headers() })
      setToast("Deleted")
      await load()
    } catch (e: any) {
      setError(e.response?.data?.message || "Delete failed")
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Manage"
          title="Announcements"
          subtitle="Broadcast updates to your team"
          actions={
            <>
              <OpsRefreshButton onClick={load} loading={loading} />
              <OpsPrimaryButton onClick={() => setShowForm(true)}>
                <Plus size={14} /> New announcement
              </OpsPrimaryButton>
            </>
          }
        />
        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        {showForm && (
          <OpsCard>
            <form onSubmit={create} className="space-y-3">
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              />
              <textarea
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Message"
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="text-sm font-semibold">
                  Cancel
                </button>
                <OpsPrimaryButton type="submit" disabled={saving}>
                  {saving ? "Publishing…" : "Publish"}
                </OpsPrimaryButton>
              </div>
            </form>
          </OpsCard>
        )}

        <OpsCard padding={false}>
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
          ) : items.length === 0 ? (
            <OpsEmpty message="No announcements yet" />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-navy-900">
              {items.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-navy-900 dark:text-white">
                        {a.title || a.message?.slice(0, 40) || `Announcement #${a.id}`}
                      </p>
                      {a.isActive !== false && <OpsBadge status="active" />}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {a.body || a.message || a.content || ""}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-400">{formatDate(a.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => remove(a.id)}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </OpsCard>
      </div>
    </AdminLayout>
  )
}
