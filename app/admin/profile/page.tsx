"use client"

import { useEffect, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import { adminGet, adminPatch, adminPost } from "@/lib/admin-session"
import {
  OpsPageHeader,
  OpsCard,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsBadge,
} from "@/components/ops/OpsChrome"
import { Loader2, Save, User } from "lucide-react"

function readLocalUser(): any | null {
  try {
    const raw =
      localStorage.getItem("userData") ||
      sessionStorage.getItem("userData") ||
      localStorage.getItem("user") ||
      sessionStorage.getItem("user")
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function ProfilePage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [pwdSupported, setPwdSupported] = useState(true)
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "" })
  const [pwd, setPwd] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })

  const load = async () => {
    try {
      setLoading(true)
      setError("")
      let data: any = null

      try {
        const me = await adminGet("/api/users/me")
        if (me.data?.success) {
          data = me.data.data?.user || me.data.data
        }
      } catch {
        /* fall through */
      }

      if (!data) {
        try {
          const auth = await adminGet("/api/auth/me")
          if (auth.data?.success) data = auth.data.data?.user || auth.data.data
        } catch {
          /* fall through */
        }
      }

      if (!data) data = readLocalUser()

      if (!data) {
        setError("Could not load profile")
        setUser(null)
        return
      }

      setUser(data)
      setForm({
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        phone: data.phone || "",
      })
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load profile")
      const local = readLocalUser()
      if (local) {
        setUser(local)
        setForm({
          firstName: local.firstName || "",
          lastName: local.lastName || "",
          phone: local.phone || "",
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) {
      setError("Missing user id")
      return
    }
    try {
      setSaving(true)
      setError("")
      const res = await adminPatch(`/api/users/${user.id}`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || null,
      })
      if (res.data?.success) {
        setToast("Profile updated")
        const next = { ...user, ...form }
        setUser(next)
        try {
          localStorage.setItem("userData", JSON.stringify(next))
        } catch {
          /* ignore */
        }
        await load()
      } else setError(res.data?.message || "Failed")
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pwd.newPassword) return
    if (pwd.newPassword.length < 6) {
      setError("New password must be at least 6 characters")
      return
    }
    if (pwd.newPassword !== pwd.confirmPassword) {
      setError("New passwords do not match")
      return
    }
    if (!pwd.currentPassword) {
      setError("Current password is required")
      return
    }
    try {
      setPwdSaving(true)
      setError("")
      const res = await adminPost("/api/users/change-password", {
        currentPassword: pwd.currentPassword,
        newPassword: pwd.newPassword,
      })
      if (res.data?.success) {
        setToast("Password changed")
        setPwd({ currentPassword: "", newPassword: "", confirmPassword: "" })
      } else setError(res.data?.message || "Failed")
    } catch (err: any) {
      const status = err.response?.status
      if (status === 404) {
        setPwdSupported(false)
        setError("Password change is not available on this server")
      } else {
        setError(err.response?.data?.message || "Failed to change password")
      }
    } finally {
      setPwdSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Account"
        title="Profile"
        subtitle="Update your name, phone, and password"
        actions={<OpsRefreshButton onClick={load} loading={loading} />}
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : !user ? (
        <OpsCard>
          <p className="text-sm text-slate-500">No profile data available.</p>
        </OpsCard>
      ) : (
        <>
          <OpsCard>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-navy-900 text-amber-400">
                <User size={24} />
              </div>
              <div>
                <p className="text-lg font-bold text-navy-900 dark:text-white">
                  {[form.firstName, form.lastName].filter(Boolean).join(" ") || user.email}
                </p>
                <p className="font-mono text-xs text-slate-500">{user.email}</p>
                <div className="mt-1">
                  <OpsBadge status={user.role || "user"} />
                </div>
              </div>
            </div>
          </OpsCard>

          <OpsCard>
            <form onSubmit={saveProfile} className="space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Personal details
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold">
                  First name
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Last name
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold md:col-span-2">
                  Phone
                  <input
                    type="tel"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Email
                  <input
                    disabled
                    value={user.email || ""}
                    className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-navy-800 dark:bg-navy-950"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  Role
                  <input
                    disabled
                    value={user.role || ""}
                    className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-navy-800 dark:bg-navy-950"
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <OpsPrimaryButton type="submit" disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  Save profile
                </OpsPrimaryButton>
              </div>
            </form>
          </OpsCard>

          {pwdSupported && (
            <OpsCard>
              <form onSubmit={changePassword} className="space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Change password
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="space-y-1 text-xs font-semibold">
                    Current
                    <input
                      type="password"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                      value={pwd.currentPassword}
                      onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold">
                    New
                    <input
                      type="password"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                      value={pwd.newPassword}
                      onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold">
                    Confirm
                    <input
                      type="password"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                      value={pwd.confirmPassword}
                      onChange={(e) => setPwd({ ...pwd, confirmPassword: e.target.value })}
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <OpsPrimaryButton type="submit" disabled={pwdSaving || !pwd.newPassword}>
                    {pwdSaving && <Loader2 className="animate-spin" size={14} />}
                    Update password
                  </OpsPrimaryButton>
                </div>
              </form>
            </OpsCard>
          )}
        </>
      )}
    </div>
  )
}
