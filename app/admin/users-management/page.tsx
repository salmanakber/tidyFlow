"use client"

import { useEffect, useMemo, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import {
  adminGet,
  adminPost,
  adminPatch,
  adminDelete,
  formatDate,
} from "@/lib/admin-session"
import {
  OpsPageHeader,
  OpsKpi,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsEmpty,
  OpsBadge,
  OpsTableShell,
  OpsPagination,
  opsTh,
  opsTd,
} from "@/components/ops/OpsChrome"
import { Plus, Trash2, Loader2, UserPlus } from "lucide-react"

const PAGE_SIZE = 10
const ROLES = ["OWNER", "MANAGER", "CLEANER"] as const

function asList(data: any): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.users)) return data.users
  if (Array.isArray(data?.items)) return data.items
  return []
}

function displayName(u: any) {
  const n = [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim()
  return n || u?.name || u?.email || "—"
}

function statusOf(u: any) {
  if (typeof u?.status === "string") return u.status
  return u?.isActive === false ? "inactive" : "active"
}

export default function UsersManagementPage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [tab, setTab] = useState("all")
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "CLEANER",
    password: "",
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      const res = await adminGet("/api/users")
      if (res.data?.success) {
        const list = asList(res.data.data).filter(
          (u) => ROLES.includes(u.role) || ["OWNER", "MANAGER", "CLEANER"].includes(u.role)
        )
        setItems(list)
      } else {
        setItems([])
        setError(res.data?.message || "Failed")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load team")
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
  }, [tab])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const parts = form.name.trim().split(/\s+/)
    const firstName = parts[0] || ""
    const lastName = parts.slice(1).join(" ") || ""
    try {
      setSaving(true)
      const res = await adminPost("/api/users", {
        firstName,
        lastName,
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        password: form.password,
      })
      if (res.data?.success) {
        setToast("Team member created")
        setShowForm(false)
        setForm({ name: "", email: "", role: "CLEANER", password: "" })
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to create user")
    } finally {
      setSaving(false)
    }
  }

  const setRole = async (id: number, role: string) => {
    try {
      setBusyId(id)
      const res = await adminPatch(`/api/users/${id}`, { role })
      if (res.data?.success) {
        setToast("Role updated")
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    } finally {
      setBusyId(null)
    }
  }

  const toggleActive = async (u: any) => {
    try {
      setBusyId(u.id)
      const next = !(u.isActive !== false && statusOf(u) !== "inactive")
      const res = await adminPatch(`/api/users/${u.id}`, { isActive: next })
      if (res.data?.success) {
        setToast(next ? "User activated" : "User deactivated")
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: number) => {
    if (!confirm("Delete this team member?")) return
    try {
      setBusyId(id)
      const res = await adminDelete(`/api/users/${id}`)
      if (res.data?.success) {
        setToast("User deleted")
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed")
    } finally {
      setBusyId(null)
    }
  }

  const safe = Array.isArray(items) ? items : []
  const filtered = useMemo(() => {
    if (tab === "all") return safe
    return safe.filter((u) => u.role === tab)
  }, [safe, tab])

  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const owners = safe.filter((u) => u.role === "OWNER").length
  const managers = safe.filter((u) => u.role === "MANAGER").length
  const cleaners = safe.filter((u) => u.role === "CLEANER").length

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Manage"
        title="Team"
        subtitle="Owners, managers, and cleaners — invite and manage roles"
        actions={
          <div className="flex gap-2">
            <OpsRefreshButton onClick={load} loading={loading} />
            <OpsPrimaryButton onClick={() => setShowForm(true)}>
              <Plus size={14} /> Invite member
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OpsKpi label="Total" value={safe.length} />
        <OpsKpi label="Owners" value={owners} />
        <OpsKpi label="Managers" value={managers} />
        <OpsKpi label="Cleaners" value={cleaners} />
      </div>

      {showForm && (
        <form
          onSubmit={create}
          className="grid grid-cols-1 gap-3 rounded-xl border border-control-border bg-white p-5 dark:border-navy-800 dark:bg-control-darkCard md:grid-cols-4"
        >
          <label className="space-y-1 text-xs font-semibold">
            Name
            <input
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Email
            <input
              required
              type="email"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Role
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Password
            <input
              required
              type="password"
              minLength={6}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2 md:col-span-4">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
            <OpsPrimaryButton type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={14} /> : <UserPlus size={14} />}
              Create
            </OpsPrimaryButton>
          </div>
        </form>
      )}

      <OpsTableShell
        title="Team members"
        badge={
          <span className="rounded bg-navy-950 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300">
            {filtered.length}
          </span>
        }
        tabs={[
          { id: "all", label: "All" },
          { id: "OWNER", label: "Owners" },
          { id: "MANAGER", label: "Managers" },
          { id: "CLEANER", label: "Cleaners" },
        ]}
        activeTab={tab}
        onTabChange={setTab}
      >
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <OpsEmpty message="No team members yet" />
        ) : (
          <>
            <table className="w-full text-left">
              <thead className="border-b border-control-border bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                <tr>
                  <th className={opsTh}>Name</th>
                  <th className={opsTh}>Email</th>
                  <th className={opsTh}>Role</th>
                  <th className={opsTh}>Status</th>
                  <th className={opsTh}>Joined</th>
                  <th className={`${opsTh} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-900">
                {pageSlice.map((u) => {
                  const st = statusOf(u)
                  const active = st === "active" || st === "ACTIVE"
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80">
                      <td className={`${opsTd} font-bold text-navy-900 dark:text-white`}>
                        {displayName(u)}
                      </td>
                      <td className={`${opsTd} font-mono text-xs text-slate-500`}>{u.email}</td>
                      <td className={opsTd}>
                        <select
                          disabled={busyId === u.id}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold dark:border-navy-800 dark:bg-navy-950"
                          value={u.role}
                          onChange={(e) => setRole(u.id, e.target.value)}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className={opsTd}>
                        <OpsBadge status={active ? "active" : "inactive"} />
                      </td>
                      <td className={`${opsTd} text-xs text-slate-500`}>{formatDate(u.createdAt)}</td>
                      <td className={`${opsTd} text-right`}>
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => toggleActive(u)}
                            className="rounded-lg px-2 py-1 text-[10px] font-bold uppercase text-navy-700 hover:bg-navy-50 dark:text-amber-400"
                          >
                            {active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === u.id}
                            onClick={() => remove(u.id)}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            {busyId === u.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <OpsPagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
          </>
        )}
      </OpsTableShell>
    </div>
  )
}
