"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import axios from "axios"
import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"
import { evaluatePassword } from "@/lib/password-policy"
import {
  clearAdminSession,
  clearCustomerSession,
  getCustomerToken,
  getCustomerUserEmail,
} from "@/lib/customer-account"
import AccountChrome from "@/components/account/AccountChrome"
import AppDownloadBanner from "@/components/AppDownloadBanner"
import {
  ACCOUNT_CURRENCIES,
  ACCOUNT_TIMEZONES,
  accountCard,
  accountInput,
  accountLabel,
  primaryBtn,
  secondaryBtn,
} from "@/components/account/accountUi"

type Country = { code: string; label: string }

export default function CustomerSettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [hasGoogle, setHasGoogle] = useState(false)
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [countries, setCountries] = useState<Country[]>([])
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  })
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [company, setCompany] = useState({
    companyName: "",
    companyDisplayName: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    addressCountry: "GB",
    taxRegistrationNumber: "",
  })
  const [ops, setOps] = useState({
    currency: "USD",
    timezone: "UTC",
    photoCountRequirement: 20,
    watermarkEnabled: false,
    geofenceRadius: 150,
    dataRetentionDays: 365,
  })

  const authHeaders = () => ({ Authorization: `Bearer ${getCustomerToken()}` })
  const pwdCheck = evaluatePassword(password.newPassword)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = getCustomerToken()
      if (!token) {
        window.location.href = "/account/login"
        return
      }
      clearAdminSession()
      await axios.post("/api/auth/clear-admin-session").catch(() => null)
      setEmail(getCustomerUserEmail())

      const [meRes, profileRes, configRes, invoiceRes] = await Promise.all([
        axios.get("/api/auth/me", { headers: authHeaders() }),
        axios.get("/api/company/profile", { headers: authHeaders() }).catch(() => null),
        axios.get("/api/company/admin-config", { headers: authHeaders() }).catch(() => null),
        axios.get("/api/company/invoice-settings", { headers: authHeaders() }).catch(() => null),
      ])

      const me = meRes.data?.data
      const user = me?.user || {}
      const companyProfile = profileRes?.data?.data || {}
      const config = configRes?.data?.data || {}
      const invoice = invoiceRes?.data?.data || {}

      setEmail(user.email || getCustomerUserEmail())
      setHasGoogle(!!user.hasGoogle)
      setProfileImage(user.profileImage || null)
      setProfile({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        phone: user.phone || "",
      })
      setCountries(companyProfile.countries || [])
      setCompany({
        companyName: companyProfile.companyName || me?.company?.name || "",
        companyDisplayName: companyProfile.companyDisplayName || invoice.companyDisplayName || "",
        address: companyProfile.address || invoice.address || "",
        phone: companyProfile.phone || invoice.phone || "",
        email: companyProfile.email || invoice.email || user.email || "",
        website: companyProfile.website || invoice.website || "",
        addressCountry: companyProfile.addressCountry || "GB",
        taxRegistrationNumber: invoice.taxRegistrationNumber || "",
      })
      setOps({
        currency: config.currency || "USD",
        timezone: config.timezone || "UTC",
        photoCountRequirement: Number(config.photoCountRequirement ?? 20),
        watermarkEnabled: !!config.watermarkEnabled,
        geofenceRadius: Number(config.geofenceRadius ?? 150),
        dataRetentionDays: Number(config.dataRetentionDays ?? 365),
      })
    } catch (err: any) {
      if (err?.response?.status === 401) {
        clearCustomerSession()
        window.location.href = "/account/login"
        return
      }
      setError(err?.response?.data?.message || "Could not load settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const flash = (ok: string) => {
    setMessage(ok)
    setError(null)
    window.setTimeout(() => setMessage(null), 3500)
  }

  const fail = (err: any, fallback: string) => {
    setError(err?.response?.data?.message || err?.message || fallback)
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving("profile")
    try {
      await axios.patch("/api/auth/me", profile, { headers: authHeaders() })
      flash("Profile updated")
    } catch (err) {
      fail(err, "Could not update profile")
    } finally {
      setSaving(null)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.newPassword !== password.confirmPassword) {
      setError("New passwords do not match")
      return
    }
    if (!pwdCheck.valid) {
      setError(pwdCheck.message || "Please choose a stronger password")
      return
    }
    if (!hasGoogle && !password.currentPassword) {
      setError("Current password is required")
      return
    }
    setSaving("password")
    try {
      await axios.patch(
        "/api/auth/me",
        {
          newPassword: password.newPassword,
          currentPassword: password.currentPassword || undefined,
        },
        { headers: authHeaders() }
      )
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" })
      flash("Password updated")
    } catch (err) {
      fail(err, "Could not update password")
    } finally {
      setSaving(null)
    }
  }

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving("company")
    try {
      await axios.patch(
        "/api/company/profile",
        {
          companyName: company.companyName,
          companyDisplayName: company.companyDisplayName,
          address: company.address,
          phone: company.phone,
          email: company.email,
          website: company.website,
          addressCountry: company.addressCountry,
        },
        { headers: authHeaders() }
      )
      await axios.patch(
        "/api/company/invoice-settings",
        { taxRegistrationNumber: company.taxRegistrationNumber },
        { headers: authHeaders() }
      ).catch(() => null)
      flash("Company information updated")
    } catch (err) {
      fail(err, "Could not update company information")
    } finally {
      setSaving(null)
    }
  }

  const saveOps = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving("ops")
    try {
      await axios.patch(
        "/api/company/admin-config",
        {
          timezone: ops.timezone,
          photoCountRequirement: ops.photoCountRequirement,
          watermarkEnabled: ops.watermarkEnabled,
          geofenceRadius: ops.geofenceRadius,
          dataRetentionDays: ops.dataRetentionDays,
        },
        { headers: authHeaders() }
      )
      const currencyRes = await axios.patch(
        "/api/company/currency",
        { currency: ops.currency },
        { headers: authHeaders() }
      )
      flash(currencyRes.data?.message || "Preferences updated")
    } catch (err) {
      fail(err, "Could not update preferences")
    } finally {
      setSaving(null)
    }
  }

  const uploadAvatar = async (file: File) => {
    setSaving("avatar")
    try {
      const fd = new FormData()
      fd.append("image", file)
      const upload = await axios.post("/api/users/upload-avatar", fd, { headers: authHeaders() })
      const url = upload.data?.data?.secureUrl || upload.data?.data?.url
      if (!upload.data?.success || !url) throw new Error(upload.data?.message || "Upload failed")
      await axios.patch("/api/auth/me", { profileImage: url }, { headers: authHeaders() })
      setProfileImage(url)
      flash("Profile photo updated")
    } catch (err) {
      fail(err, "Could not upload photo")
    } finally {
      setSaving(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <AccountChrome
      active="settings"
      title="Account settings"
      subtitle={`${email || "Your account"} · Profile, password, and company details`}
    >
      <AppDownloadBanner variant="hero" />

      {message ? <Banner tone="ok">{message}</Banner> : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}

      {loading ? (
        <div style={{ ...accountCard, padding: 40, textAlign: "center", color: T.inkMid }}>Loading settings…</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <section style={accountCard}>
            <h2 style={sectionTitle}>Profile</h2>
            <p style={sectionHint}>Your name and photo appear on jobs, messages, and the mobile app.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "16px 0 20px" }}>
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="Profile"
                  style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: `2px solid ${T.border}` }}
                />
              ) : (
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: T.amberSoft,
                    color: T.navy,
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    fontSize: 22,
                  }}
                >
                  {(profile.firstName || email || "T").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void uploadAvatar(file)
                  }}
                />
                <button type="button" style={secondaryBtn} onClick={() => fileRef.current?.click()} disabled={saving === "avatar"}>
                  {saving === "avatar" ? "Uploading…" : "Change photo"}
                </button>
              </div>
            </div>
            <form onSubmit={saveProfile} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field
                  label="First name"
                  value={profile.firstName}
                  onChange={(v) => setProfile((p) => ({ ...p, firstName: v }))}
                />
                <Field
                  label="Last name"
                  value={profile.lastName}
                  onChange={(v) => setProfile((p) => ({ ...p, lastName: v }))}
                />
              </div>
              <Field label="Phone" value={profile.phone} onChange={(v) => setProfile((p) => ({ ...p, phone: v }))} />
              <Field label="Email" value={email} onChange={() => undefined} disabled />
              <div>
                <button type="submit" style={primaryBtn} disabled={saving === "profile"}>
                  {saving === "profile" ? "Saving…" : "Save profile"}
                </button>
              </div>
            </form>
          </section>

          <section style={accountCard}>
            <h2 style={sectionTitle}>{hasGoogle ? "Set a password" : "Password"}</h2>
            <p style={sectionHint}>
              {hasGoogle
                ? "You signed in with Google. Optionally set a password so you can also log in with email."
                : "Use a strong password if you sign in with email."}
            </p>
            <form onSubmit={savePassword} style={{ display: "grid", gap: 12, marginTop: 16 }}>
              {!hasGoogle ? (
                <Field
                  label="Current password"
                  value={password.currentPassword}
                  onChange={(v) => setPassword((p) => ({ ...p, currentPassword: v }))}
                  type="password"
                />
              ) : null}
              <Field
                label="New password"
                value={password.newPassword}
                onChange={(v) => setPassword((p) => ({ ...p, newPassword: v }))}
                type="password"
              />
              <Field
                label="Confirm new password"
                value={password.confirmPassword}
                onChange={(v) => setPassword((p) => ({ ...p, confirmPassword: v }))}
                type="password"
              />
              {password.newPassword ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.inkMid }}>
                  {pwdCheck.checks.map((c) => (
                    <li key={c.id} style={{ color: c.ok ? T.emerald : T.rose }}>
                      {c.label}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div>
                <button type="submit" style={primaryBtn} disabled={saving === "password"}>
                  {saving === "password" ? "Saving…" : hasGoogle ? "Set password" : "Update password"}
                </button>
              </div>
            </form>
          </section>

          <section style={accountCard}>
            <h2 style={sectionTitle}>Company information</h2>
            <p style={sectionHint}>Shown on invoices, payroll, and customer-facing documents.</p>
            <form onSubmit={saveCompany} style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <Field
                label="Company name"
                value={company.companyName}
                onChange={(v) => setCompany((p) => ({ ...p, companyName: v }))}
              />
              <Field
                label="Invoice display name"
                value={company.companyDisplayName}
                onChange={(v) => setCompany((p) => ({ ...p, companyDisplayName: v }))}
              />
              <Field
                label="Business address"
                value={company.address}
                onChange={(v) => setCompany((p) => ({ ...p, address: v }))}
                multiline
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field
                  label="Company phone"
                  value={company.phone}
                  onChange={(v) => setCompany((p) => ({ ...p, phone: v }))}
                />
                <Field
                  label="Company email"
                  value={company.email}
                  onChange={(v) => setCompany((p) => ({ ...p, email: v }))}
                />
              </div>
              <Field
                label="Website"
                value={company.website}
                onChange={(v) => setCompany((p) => ({ ...p, website: v }))}
              />
              <Field
                label="Tax / registration number"
                value={company.taxRegistrationNumber}
                onChange={(v) => setCompany((p) => ({ ...p, taxRegistrationNumber: v }))}
              />
              <div>
                <label style={accountLabel}>Country</label>
                <select
                  value={company.addressCountry}
                  onChange={(e) => setCompany((p) => ({ ...p, addressCountry: e.target.value }))}
                  style={accountInput}
                >
                  {(countries.length ? countries : [{ code: "GB", label: "United Kingdom" }]).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <button type="submit" style={primaryBtn} disabled={saving === "company"}>
                  {saving === "company" ? "Saving…" : "Save company"}
                </button>
              </div>
            </form>
          </section>

          <section style={accountCard}>
            <h2 style={sectionTitle}>Preferences & job settings</h2>
            <p style={sectionHint}>Currency, timezone, photo checks, and GPS geofence used by the team.</p>
            <form onSubmit={saveOps} style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={accountLabel}>Currency</label>
                  <select
                    value={ops.currency}
                    onChange={(e) => setOps((p) => ({ ...p, currency: e.target.value }))}
                    style={accountInput}
                  >
                    {ACCOUNT_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={accountLabel}>Timezone</label>
                  <select
                    value={ops.timezone}
                    onChange={(e) => setOps((p) => ({ ...p, timezone: e.target.value }))}
                    style={accountInput}
                  >
                    {ACCOUNT_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Field
                  label="Required photos"
                  value={String(ops.photoCountRequirement)}
                  onChange={(v) => setOps((p) => ({ ...p, photoCountRequirement: Number(v) || 0 }))}
                  type="number"
                />
                <Field
                  label="Geofence radius (m)"
                  value={String(ops.geofenceRadius)}
                  onChange={(v) => setOps((p) => ({ ...p, geofenceRadius: Number(v) || 0 }))}
                  type="number"
                />
                <Field
                  label="Data retention (days)"
                  value={String(ops.dataRetentionDays)}
                  onChange={(v) => setOps((p) => ({ ...p, dataRetentionDays: Number(v) || 0 }))}
                  type="number"
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: T.ink }}>
                <input
                  type="checkbox"
                  checked={ops.watermarkEnabled}
                  onChange={(e) => setOps((p) => ({ ...p, watermarkEnabled: e.target.checked }))}
                />
                Add watermark to job photos
              </label>
              <div>
                <button type="submit" style={primaryBtn} disabled={saving === "ops"}>
                  {saving === "ops" ? "Saving…" : "Save preferences"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </AccountChrome>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  multiline,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  multiline?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <label style={accountLabel}>{label}</label>
      {multiline ? (
        <textarea
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ ...accountInput, resize: "vertical", minHeight: 72, background: disabled ? T.canvas : "#fff" }}
        />
      ) : (
        <input
          type={type}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...accountInput, background: disabled ? T.canvas : "#fff" }}
        />
      )}
    </div>
  )
}

function Banner({ children, tone }: { children: string; tone: "ok" | "bad" }) {
  const ok = tone === "ok"
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        borderRadius: 12,
        background: ok ? "#ECFDF5" : "#FEF2F2",
        border: `1px solid ${ok ? "#A7F3D0" : "#FECACA"}`,
        color: ok ? "#065F46" : "#991B1B",
        fontSize: 13,
      }}
    >
      {children}
    </div>
  )
}

const sectionTitle = { margin: 0, fontSize: 18, fontWeight: 800, color: T.ink }
const sectionHint = { margin: "6px 0 0", fontSize: 13, color: T.inkMid, lineHeight: 1.45 }
