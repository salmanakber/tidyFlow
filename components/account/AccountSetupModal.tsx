"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import { SUBSCRIBE_THEME as T } from "@/lib/public-plan-scope"
import { getCustomerToken } from "@/lib/customer-account"
import {
  ACCOUNT_CURRENCIES,
  ACCOUNT_TIMEZONES,
  accountInput,
  accountLabel,
  clearSetupPromptSkip,
  primaryBtn,
  secondaryBtn,
  skipSetupPrompt,
} from "@/components/account/accountUi"

type Country = { code: string; label: string }

export default function AccountSetupModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean
  onClose: () => void
  onComplete: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [countries, setCountries] = useState<Country[]>([])
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    companyName: "",
    address: "",
    companyPhone: "",
    website: "",
    addressCountry: "GB",
    currency: "USD",
    timezone: "UTC",
  })

  const authHeaders = () => ({ Authorization: `Bearer ${getCustomerToken()}` })
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError("")
      try {
        const [meRes, profileRes, configRes] = await Promise.all([
          axios.get("/api/auth/me", { headers: authHeaders() }),
          axios.get("/api/company/profile", { headers: authHeaders() }).catch(() => null),
          axios.get("/api/company/admin-config", { headers: authHeaders() }).catch(() => null),
        ])
        if (cancelled) return
        const me = meRes.data?.data
        const user = me?.user || {}
        const profile = profileRes?.data?.data || {}
        const config = configRes?.data?.data || {}
        const placeholder = !!me?.placeholderCompanyName
        setCountries(profile.countries || [])
        setForm({
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          phone: user.phone || "",
          companyName: placeholder ? "" : profile.companyName || me?.company?.name || "",
          address: profile.address || "",
          companyPhone: profile.phone || "",
          website: profile.website || "",
          addressCountry: profile.addressCountry || "GB",
          currency: config.currency || "USD",
          timezone: config.timezone || "UTC",
        })
      } catch (err: any) {
        if (!cancelled) setError(err?.response?.data?.message || "Could not load account details")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!form.firstName.trim() || !form.lastName.trim() || !form.companyName.trim()) {
      setError("Please enter your name and company name.")
      return
    }
    setSaving(true)
    try {
      await axios.patch(
        "/api/auth/me",
        {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim(),
        },
        { headers: authHeaders() }
      )
      await axios.patch(
        "/api/company/profile",
        {
          companyName: form.companyName.trim(),
          companyDisplayName: form.companyName.trim(),
          address: form.address.trim(),
          phone: form.companyPhone.trim(),
          website: form.website.trim(),
          addressCountry: form.addressCountry,
        },
        { headers: authHeaders() }
      )
      await axios.patch(
        "/api/company/admin-config",
        { timezone: form.timezone },
        { headers: authHeaders() }
      )
      await axios.patch("/api/company/currency", { currency: form.currency }, { headers: authHeaders() }).catch(() => null)
      clearSetupPromptSkip()
      onComplete()
    } catch (err: any) {
      setError(err?.response?.data?.message || "Could not save company details")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(6, 21, 37, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <form
        onSubmit={save}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "92vh",
          overflow: "auto",
          background: T.surface,
          borderRadius: 20,
          border: `1px solid ${T.border}`,
          boxShadow: "0 24px 60px rgba(6,21,37,0.28)",
          padding: 24,
        }}
      >
        <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: 1.3, color: T.amberDeep }}>
          WELCOME TO TIDYFLOW
        </p>
        <h2 id="setup-title" style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 800, color: T.ink }}>
          Set up your company
        </h2>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: T.inkMid, lineHeight: 1.5 }}>
          Add the details your team, invoices, and jobs will use. You can change these later in Settings.
        </p>

        {loading ? (
          <p style={{ marginTop: 20, color: T.inkMid }}>Loading your details…</p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
            {error ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#991B1B",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="First name" value={form.firstName} onChange={(v) => set("firstName", v)} required />
              <Field label="Last name" value={form.lastName} onChange={(v) => set("lastName", v)} required />
            </div>
            <Field label="Your phone" value={form.phone} onChange={(v) => set("phone", v)} />
            <Field
              label="Company name"
              value={form.companyName}
              onChange={(v) => set("companyName", v)}
              required
              hint="Use your cleaning business name, not your personal name."
            />
            <Field label="Company phone" value={form.companyPhone} onChange={(v) => set("companyPhone", v)} />
            <Field
              label="Business address"
              value={form.address}
              onChange={(v) => set("address", v)}
              multiline
            />
            <Field label="Website" value={form.website} onChange={(v) => set("website", v)} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <div>
                <label style={accountLabel}>Country</label>
                <select
                  value={form.addressCountry}
                  onChange={(e) => set("addressCountry", e.target.value)}
                  style={accountInput}
                >
                  {(countries.length
                    ? countries
                    : [{ code: "GB", label: "United Kingdom" }, { code: "US", label: "United States" }]
                  ).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={accountLabel}>Currency</label>
                <select value={form.currency} onChange={(e) => set("currency", e.target.value)} style={accountInput}>
                  {ACCOUNT_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={accountLabel}>Timezone</label>
                <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)} style={accountInput}>
                  {ACCOUNT_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            style={secondaryBtn}
            onClick={() => {
              skipSetupPrompt()
              onClose()
            }}
          >
            Remind me later
          </button>
          <button type="submit" disabled={saving || loading} style={primaryBtn}>
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  required,
  multiline,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  multiline?: boolean
  hint?: string
}) {
  return (
    <div>
      <label style={accountLabel}>
        {label}
        {required ? " *" : ""}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          rows={3}
          style={{ ...accountInput, resize: "vertical", minHeight: 72 }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          style={accountInput}
        />
      )}
      {hint ? <p style={{ margin: "6px 0 0", fontSize: 12, color: T.inkFaint }}>{hint}</p> : null}
    </div>
  )
}
