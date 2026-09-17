"use client"

import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import { useUrlQueryState } from "@/hooks/useUrlQueryState"
import {
  OpsPageHeader,
  OpsCard,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsTableShell,
  OpsPagination,
  OpsSkeleton,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import { formatDate } from "@/lib/admin-session"
import { Plus, Trash2, Megaphone } from "lucide-react"

type TargetKey = "ALL" | "CLEANER" | "MANAGER"

function toDateKey(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function defaultExpires() {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return toDateKey(d)
}

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false
  const d = new Date(expiresAt)
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now()
}

function audienceLabel(targetRole?: string | null) {
  if (!targetRole) return "Everyone"
  if (targetRole === "CLEANER") return "Cleaners only"
  if (targetRole === "MANAGER") return "Managers only"
  return targetRole
}

const PAGE_SIZE = 10

export default function AnnouncementsPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [target, setTarget] = useState<TargetKey>("ALL")
  const [expiresOn, setExpiresOn] = useState(defaultExpires())
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useUrlQueryState("status", "ALL")
  const [page, setPage] = useState(1)

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
      if (res.data.success) setItems(Array.isArray(res.data.data) ? res.data.data : [])
      else setError(res.data.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load announcements")
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [filter])

  const resetForm = () => {
    setTitle("")
    setBody("")
    setTarget("ALL")
    setExpiresOn(defaultExpires())
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      setError("Title and message are required")
      return
    }
    if (!expiresOn) {
      setError("Show until date is required")
      return
    }
    try {
      setSaving(true)
      const res = await axios.post(
        "/api/announcements",
        {
          title: title.trim(),
          message: body.trim(),
          targetRole: target === "ALL" ? null : target,
          expiresAt: expiresOn,
        },
        { headers: headers() }
      )
      if (res.data.success) {
        setToast("Announcement published")
        setShowForm(false)
        resetForm()
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

  const filtered = useMemo(() => {
    return items.filter((a) => {
      const expired = isExpired(a.expiresAt)
      if (filter === "ACTIVE") return !expired
      if (filter === "EXPIRED") return expired
      if (filter === "CLEANER") return a.targetRole === "CLEANER"
      if (filter === "MANAGER") return a.targetRole === "MANAGER"
      return true
    })
  }, [items, filter])

  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <AdminLayout>
      <div className="space-y-5">
        <OpsPageHeader
          eyebrow="Manage"
          title="Announcements"
          subtitle="Broadcast updates with audience targeting and expiry"
          actions={
            <>
              <OpsRefreshButton onClick={load} loading={loading} />
              <OpsPrimaryButton
                onClick={() => {
                  resetForm()
                  setShowForm(true)
                }}
              >
                <Plus size={14} /> New announcement
              </OpsPrimaryButton>
            </>
          }
        />
        {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
        {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

        {showForm && (
          <OpsCard>
            <form onSubmit={create} className="space-y-4">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Title
                </label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Announcement title"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Message
                </label>
                <textarea
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What should the team see?"
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                />
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Show to
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["ALL", "Everyone"],
                      ["MANAGER", "Managers only"],
                      ["CLEANER", "Cleaners only"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTarget(key)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                        target === key
                          ? "border-amber-600 bg-amber-50 text-amber-800"
                          : "border-slate-200 text-slate-600 hover:border-amber-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Show until
                </label>
                <input
                  required
                  type="date"
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Banner stays visible through this calendar date (mobile parity).
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm font-semibold"
                >
                  Cancel
                </button>
                <OpsPrimaryButton type="submit" disabled={saving}>
                  {saving ? "Publishing…" : "Publish"}
                </OpsPrimaryButton>
              </div>
            </form>
          </OpsCard>
        )}

        <OpsTableShell
          title="Announcement feed"
          stickyHeader
          badge={
            <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
              {filtered.length}
            </span>
          }
          tabs={[
            { id: "ALL", label: "All" },
            { id: "ACTIVE", label: "Active" },
            { id: "EXPIRED", label: "Expired" },
            { id: "MANAGER", label: "Managers" },
            { id: "CLEANER", label: "Cleaners" },
          ]}
          activeTab={filter}
          onTabChange={setFilter}
        >
          {loading ? (
            <OpsSkeleton rows={6} cols={5} />
          ) : filtered.length === 0 ? (
            <OpsEmpty
              message="No announcements yet"
              ctaLabel="New announcement"
              onCta={() => {
                resetForm()
                setShowForm(true)
              }}
            />
          ) : (
            <>
              <table className="w-full text-left">
                <thead className="border-b border-control-border bg-slate-50 dark:bg-navy-950">
                  <tr>
                    <th className={opsTh}>Announcement</th>
                    <th className={opsTh}>Audience</th>
                    <th className={opsTh}>Show until</th>
                    <th className={opsTh}>Status</th>
                    <th className={`${opsTh} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                  {pageSlice.map((a) => {
                    const expired = isExpired(a.expiresAt)
                    return (
                      <tr key={a.id} className="hover:bg-amber-50/30">
                        <td className={opsTd}>
                          <div className="flex items-start gap-2">
                            <Megaphone size={14} className="mt-0.5 text-amber-600" />
                            <div>
                              <p className="font-bold text-navy-900 dark:text-white">
                                {a.title || `Announcement #${a.id}`}
                              </p>
                              <p className="mt-0.5 max-w-md text-xs text-slate-500 line-clamp-2">
                                {a.message || a.body || a.content || ""}
                              </p>
                              <p className="mt-1 font-mono text-[10px] text-slate-400">
                                {formatDate(a.createdAt)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className={`${opsTd} text-xs font-semibold`}>
                          {audienceLabel(a.targetRole)}
                        </td>
                        <td className={`${opsTd} font-mono text-xs`}>
                          {a.expiresAt ? formatDate(a.expiresAt) : "No expiry"}
                        </td>
                        <td className={opsTd}>
                          <OpsBadge status={expired ? "expired" : "active"} />
                        </td>
                        <td className={`${opsTd} text-right`}>
                          <button
                            onClick={() => remove(a.id)}
                            className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <OpsPagination
                page={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onPageChange={setPage}
              />
            </>
          )}
        </OpsTableShell>
      </div>
    </AdminLayout>
  )
}
