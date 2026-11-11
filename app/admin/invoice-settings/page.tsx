"use client"

import { useCallback, useEffect, useState } from "react"
import axios from "axios"
import AdminLayout from "@/components/AdminLayout"
import {
  OpsPageHeader,
  OpsCard,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
} from "@/components/ops/OpsChrome"
import type { CompanyInvoiceSettingsDTO, TaxRule } from "@/lib/invoice-settings"
import { Loader2, Plus, Trash2, Upload, ImageIcon } from "lucide-react"

const WORKER_TYPES = [
  { id: "hourly", label: "Hourly" },
  { id: "custom", label: "Custom" },
  { id: "paye_uk", label: "PAYE (UK)" },
  { id: "w2", label: "W-2 (US)" },
  { id: "contractor_1099", label: "1099 contractor" },
  { id: "payg_au", label: "PAYG (AU)" },
  { id: "t4_ca", label: "T4 (CA)" },
  { id: "paye_nz", label: "PAYE (NZ)" },
  { id: "eu_standard", label: "EU standard" },
]

function authHeaders() {
  const token = localStorage.getItem("authToken") || sessionStorage.getItem("authToken")
  return { Authorization: `Bearer ${token}` }
}

function newTaxRule(partial?: Partial<TaxRule>): TaxRule {
  return {
    id: crypto.randomUUID(),
    name: "",
    percentage: 0,
    mode: "exclusive",
    enabled: true,
    isDefault: false,
    ...partial,
  }
}

const empty: CompanyInvoiceSettingsDTO = {
  companyDisplayName: null,
  logoUrl: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  taxRegistrationNumber: null,
  invoicePrefix: "INV-",
  nextInvoiceNumber: 1,
  taxEnabled: false,
  taxRules: [],
  defaultTaxRuleId: null,
  payrollPrefix: "PAY-",
  nextPayrollNumber: 1,
  payrollTaxEnabled: false,
  payrollTaxRules: [],
  payrollDefaultTaxRuleId: null,
  invoiceLanguage: "en",
}

export default function InvoiceSettingsPage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const [settings, setSettings] = useState<CompanyInvoiceSettingsDTO>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const res = await axios.get("/api/company/invoice-settings", { headers: authHeaders() })
      if (res.data?.success && res.data.data) {
        setSettings({ ...empty, ...res.data.data, invoiceLanguage: "en" })
      } else {
        setError(res.data?.message || "Failed to load invoice settings")
      }
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load invoice settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      setError("")
      const payload = {
        ...settings,
        invoiceLanguage: "en",
        taxRules: settings.taxRules.map((r, i) => ({
          ...r,
          isDefault: settings.defaultTaxRuleId
            ? r.id === settings.defaultTaxRuleId
            : i === 0 && r.enabled,
        })),
        payrollTaxRules: settings.payrollTaxRules.map((r, i) => ({
          ...r,
          mode: "exclusive" as const,
          isDefault: settings.payrollDefaultTaxRuleId
            ? r.id === settings.payrollDefaultTaxRuleId
            : i === 0 && r.enabled,
        })),
      }
      const res = await axios.patch("/api/company/invoice-settings", payload, {
        headers: authHeaders(),
      })
      if (res.data?.success) {
        setSettings({ ...empty, ...res.data.data, invoiceLanguage: "en" })
        setToast("Invoice settings saved")
      } else {
        setError(res.data?.message || "Failed to save")
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to save invoice settings")
    } finally {
      setSaving(false)
    }
  }

  const uploadLogo = async (file: File | null) => {
    if (!file) return
    try {
      setUploading(true)
      setError("")
      const fd = new FormData()
      fd.append("file", file)
      const res = await axios.post("/api/company/invoice-settings/logo", fd, {
        headers: authHeaders(),
      })
      if (res.data?.success) {
        const logoUrl = res.data.data?.logoUrl || res.data.data?.settings?.logoUrl
        setSettings((s) => ({
          ...s,
          ...(res.data.data?.settings || {}),
          logoUrl: logoUrl || s.logoUrl,
          invoiceLanguage: "en",
        }))
        setToast("Logo updated")
      } else {
        setError(res.data?.message || "Logo upload failed")
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Logo upload failed")
    } finally {
      setUploading(false)
    }
  }

  const field = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    opts?: { multiline?: boolean; placeholder?: string; type?: string }
  ) => (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      {opts?.multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={opts.placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-navy-800 dark:bg-navy-950"
        />
      ) : (
        <input
          type={opts?.type || "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={opts?.placeholder}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-navy-800 dark:bg-navy-950"
        />
      )}
    </label>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading invoice settings…</span>
      </div>
    )
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <OpsPageHeader
        eyebrow="Finance"
        title="Invoice settings"
        subtitle="Branding, numbering, and tax rules for client invoices and payroll slips — English only"
        actions={
          <>
            <OpsRefreshButton onClick={load} loading={loading} />
            <OpsPrimaryButton type="submit" disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? "Saving…" : "Save settings"}
            </OpsPrimaryButton>
          </>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      {/* Branding */}
      <OpsCard>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Brand identity
            </p>
            <h2 className="mt-0.5 text-base font-extrabold text-navy-900 dark:text-white">
              Company on documents
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Appears on PDF invoices and payroll documents.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
              {settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logoUrl} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="text-slate-300" size={22} />
              )}
            </div>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-amber-500 hover:text-amber-700 dark:border-navy-800 dark:bg-navy-950 dark:text-slate-200">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? "Uploading…" : "Upload logo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => uploadLogo(e.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {field("Display name", settings.companyDisplayName || "", (v) =>
            setSettings((s) => ({ ...s, companyDisplayName: v || null }))
          )}
          {field("Tax / registration number", settings.taxRegistrationNumber || "", (v) =>
            setSettings((s) => ({ ...s, taxRegistrationNumber: v || null }))
          )}
          <div className="md:col-span-2">
            {field(
              "Business address",
              settings.address || "",
              (v) => setSettings((s) => ({ ...s, address: v || null })),
              { multiline: true }
            )}
          </div>
          {field("Phone", settings.phone || "", (v) =>
            setSettings((s) => ({ ...s, phone: v || null }))
          )}
          {field("Email", settings.email || "", (v) =>
            setSettings((s) => ({ ...s, email: v || null })),
            { type: "email" }
          )}
          {field("Website", settings.website || "", (v) =>
            setSettings((s) => ({ ...s, website: v || null }))
          )}
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-navy-800 dark:bg-navy-950/50">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Document language
            </p>
            <p className="mt-1 text-sm font-semibold text-navy-900 dark:text-white">English</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Fixed for all generated PDFs</p>
          </div>
        </div>
      </OpsCard>

      {/* Numbering */}
      <OpsCard>
        <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
          Numbering
        </p>
        <h2 className="mt-0.5 text-base font-extrabold text-navy-900 dark:text-white">
          Invoice & payroll prefixes
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {field("Invoice prefix", settings.invoicePrefix || "", (v) =>
            setSettings((s) => ({ ...s, invoicePrefix: v }))
          )}
          {field(
            "Next invoice number",
            String(settings.nextInvoiceNumber ?? 1),
            (v) => setSettings((s) => ({ ...s, nextInvoiceNumber: Math.max(1, Number(v) || 1) })),
            { type: "number" }
          )}
          {field("Payroll prefix", settings.payrollPrefix || "", (v) =>
            setSettings((s) => ({ ...s, payrollPrefix: v }))
          )}
          {field(
            "Next payroll number",
            String(settings.nextPayrollNumber ?? 1),
            (v) => setSettings((s) => ({ ...s, nextPayrollNumber: Math.max(1, Number(v) || 1) })),
            { type: "number" }
          )}
        </div>
      </OpsCard>

      {/* Client tax */}
      <OpsCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Client invoices
            </p>
            <h2 className="mt-0.5 text-base font-extrabold text-navy-900 dark:text-white">Tax rules</h2>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={settings.taxEnabled}
              onChange={(e) => setSettings((s) => ({ ...s, taxEnabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            Enable tax on invoices
          </label>
        </div>

        {settings.taxEnabled && (
          <div className="mt-4 space-y-3">
            {settings.taxRules.map((rule, idx) => (
              <div
                key={rule.id}
                className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-navy-800 dark:bg-navy-950/40 md:grid-cols-[1.4fr_0.7fr_0.9fr_auto_auto]"
              >
                <input
                  value={rule.name}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      taxRules: s.taxRules.map((r, i) =>
                        i === idx ? { ...r, name: e.target.value } : r
                      ),
                    }))
                  }
                  placeholder="Rule name (e.g. VAT)"
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                />
                <input
                  type="number"
                  step="0.01"
                  value={rule.percentage}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      taxRules: s.taxRules.map((r, i) =>
                        i === idx ? { ...r, percentage: Number(e.target.value) || 0 } : r
                      ),
                    }))
                  }
                  placeholder="%"
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                />
                <select
                  value={rule.mode}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      taxRules: s.taxRules.map((r, i) =>
                        i === idx
                          ? { ...r, mode: e.target.value as "inclusive" | "exclusive" }
                          : r
                      ),
                    }))
                  }
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                >
                  <option value="exclusive">Exclusive</option>
                  <option value="inclusive">Inclusive</option>
                </select>
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold">
                  <input
                    type="radio"
                    name="defaultTax"
                    checked={settings.defaultTaxRuleId === rule.id}
                    onChange={() => setSettings((s) => ({ ...s, defaultTaxRuleId: rule.id }))}
                  />
                  Default
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      taxRules: s.taxRules.filter((r) => r.id !== rule.id),
                      defaultTaxRuleId:
                        s.defaultTaxRuleId === rule.id ? null : s.defaultTaxRuleId,
                    }))
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  taxRules: [...s.taxRules, newTaxRule({ name: "VAT", percentage: 20 })],
                }))
              }
              className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline"
            >
              <Plus size={14} /> Add tax rule
            </button>
          </div>
        )}
      </OpsCard>

      {/* Payroll tax */}
      <OpsCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Payroll
            </p>
            <h2 className="mt-0.5 text-base font-extrabold text-navy-900 dark:text-white">
              Worker tax profiles
            </h2>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={settings.payrollTaxEnabled}
              onChange={(e) =>
                setSettings((s) => ({ ...s, payrollTaxEnabled: e.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            Enable payroll tax
          </label>
        </div>

        {settings.payrollTaxEnabled && (
          <div className="mt-4 space-y-3">
            {settings.payrollTaxRules.map((rule, idx) => (
              <div
                key={rule.id}
                className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-navy-800 dark:bg-navy-950/40"
              >
                <div className="grid gap-2 md:grid-cols-3">
                  <input
                    value={rule.name}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        payrollTaxRules: s.payrollTaxRules.map((r, i) =>
                          i === idx ? { ...r, name: e.target.value } : r
                        ),
                      }))
                    }
                    placeholder="Profile name"
                    className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                  />
                  <select
                    value={rule.workerType || "hourly"}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        payrollTaxRules: s.payrollTaxRules.map((r, i) =>
                          i === idx ? { ...r, workerType: e.target.value } : r
                        ),
                      }))
                    }
                    className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                  >
                    {WORKER_TYPES.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    value={rule.percentage}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        payrollTaxRules: s.payrollTaxRules.map((r, i) =>
                          i === idx ? { ...r, percentage: Number(e.target.value) || 0 } : r
                        ),
                      }))
                    }
                    placeholder="Tax %"
                    className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <input
                    type="number"
                    step="0.01"
                    value={rule.socialSecurityPercent ?? 0}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        payrollTaxRules: s.payrollTaxRules.map((r, i) =>
                          i === idx
                            ? { ...r, socialSecurityPercent: Number(e.target.value) || 0 }
                            : r
                        ),
                      }))
                    }
                    placeholder="Social security %"
                    className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={rule.insurancePercent ?? 0}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        payrollTaxRules: s.payrollTaxRules.map((r, i) =>
                          i === idx
                            ? { ...r, insurancePercent: Number(e.target.value) || 0 }
                            : r
                        ),
                      }))
                    }
                    placeholder="Insurance %"
                    className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm dark:border-navy-800 dark:bg-navy-950"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold">
                      <input
                        type="radio"
                        name="defaultPayrollTax"
                        checked={settings.payrollDefaultTaxRuleId === rule.id}
                        onChange={() =>
                          setSettings((s) => ({ ...s, payrollDefaultTaxRuleId: rule.id }))
                        }
                      />
                      Default
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          payrollTaxRules: s.payrollTaxRules.filter((r) => r.id !== rule.id),
                          payrollDefaultTaxRuleId:
                            s.payrollDefaultTaxRuleId === rule.id
                              ? null
                              : s.payrollDefaultTaxRuleId,
                        }))
                      }
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  payrollTaxRules: [
                    ...s.payrollTaxRules,
                    newTaxRule({ name: "Standard", percentage: 0, workerType: "hourly" }),
                  ],
                }))
              }
              className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:underline"
            >
              <Plus size={14} /> Add payroll tax profile
            </button>
          </div>
        )}
      </OpsCard>

      <div className="flex justify-end pb-6">
        <OpsPrimaryButton type="submit" disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save settings"}
        </OpsPrimaryButton>
      </div>
    </form>
  )
}
