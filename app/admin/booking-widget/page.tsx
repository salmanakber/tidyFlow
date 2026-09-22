"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import AdminLayout from "@/components/AdminLayout"
import { adminGet, adminPatch } from "@/lib/admin-session"
import {
  DEFAULT_FORM_FIELDS,
  DEFAULT_THEME,
  DEFAULT_WEEKLY_HOURS,
  type BookingFormField,
  type DayHours,
  type WeeklyHours,
} from "@/lib/booking-widget"
import {
  OpsPageHeader,
  OpsRefreshButton,
  OpsPrimaryButton,
  OpsFlash,
  OpsCard,
  OpsEmpty,
  OpsSkeleton,
} from "@/components/ops/OpsChrome"
import { OpsField, OpsSecondaryButton, opsFieldCls } from "@/components/ops/OpsForm"
import {
  CalendarHeart,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react"

const DAY_LABELS: { key: string; label: string }[] = [
  { key: "1", label: "Monday" },
  { key: "2", label: "Tuesday" },
  { key: "3", label: "Wednesday" },
  { key: "4", label: "Thursday" },
  { key: "5", label: "Friday" },
  { key: "6", label: "Saturday" },
  { key: "0", label: "Sunday" },
]

type WidgetConfig = {
  enabled: boolean
  publicSlug: string
  publicUrl?: string
  embedSnippet?: string
  headline: string
  description: string
  successMessage: string
  logoUrl: string
  primaryColor: string
  accentColor: string
  backgroundColor: string
  textColor: string
  formFields: BookingFormField[]
  showCalendar: boolean
  weeklyHours: WeeklyHours
  closedDates: string[]
  slotIntervalMinutes: number
  minLeadHours: number
  maxDaysAhead: number
  bufferMinutes: number
  useCleanerAvailability: boolean
  defaultDurationMin: number
  autoCreateTask: boolean
  autoCreateProperty: boolean
}

function emptyConfig(): WidgetConfig {
  return {
    enabled: false,
    publicSlug: "",
    headline: "",
    description: "",
    successMessage: "",
    logoUrl: "",
    primaryColor: DEFAULT_THEME.primaryColor,
    accentColor: DEFAULT_THEME.accentColor,
    backgroundColor: DEFAULT_THEME.backgroundColor,
    textColor: DEFAULT_THEME.textColor,
    formFields: DEFAULT_FORM_FIELDS.map((f) => ({ ...f })),
    showCalendar: true,
    weeklyHours: { ...DEFAULT_WEEKLY_HOURS },
    closedDates: [],
    slotIntervalMinutes: 60,
    minLeadHours: 24,
    maxDaysAhead: 60,
    bufferMinutes: 0,
    useCleanerAvailability: false,
    defaultDurationMin: 120,
    autoCreateTask: true,
    autoCreateProperty: true,
  }
}

function originBase() {
  if (typeof window !== "undefined") return window.location.origin
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.tidyflowapp.com"
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <OpsField label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1 dark:border-navy-800"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${opsFieldCls} font-mono text-xs uppercase`}
          placeholder="#0B1F33"
        />
      </div>
    </OpsField>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <OpsCard>
      <div className="mb-4 border-b border-control-border pb-3 dark:border-navy-800">
        <h2 className="text-sm font-extrabold text-navy-900 dark:text-white">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </OpsCard>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-navy-800 dark:bg-navy-950/40">
      <div>
        <p className="text-sm font-semibold text-navy-900 dark:text-white">{label}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-amber-600" : "bg-slate-300 dark:bg-navy-700"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </label>
  )
}

export default function BookingWidgetPage() {
  return (
    <AdminLayout>
      <Content />
    </AdminLayout>
  )
}

function Content() {
  const [cfg, setCfg] = useState<WidgetConfig>(emptyConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [toast, setToast] = useState("")
  const [copied, setCopied] = useState<string | null>(null)
  const [newClosedDate, setNewClosedDate] = useState("")

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const res = await adminGet("/api/company/booking-widget")
      if (!res.data?.success) {
        setError(res.data?.message || "Failed to load booking page")
        return
      }
      const d = res.data.data
      setCfg({
        enabled: !!d.enabled,
        publicSlug: d.publicSlug || "",
        publicUrl: d.publicUrl,
        embedSnippet: d.embedSnippet,
        headline: d.headline || "",
        description: d.description || "",
        successMessage: d.successMessage || "",
        logoUrl: d.logoUrl || "",
        primaryColor: d.primaryColor || DEFAULT_THEME.primaryColor,
        accentColor: d.accentColor || DEFAULT_THEME.accentColor,
        backgroundColor: d.backgroundColor || DEFAULT_THEME.backgroundColor,
        textColor: d.textColor || DEFAULT_THEME.textColor,
        formFields: Array.isArray(d.formFields)
          ? d.formFields
          : DEFAULT_FORM_FIELDS.map((f) => ({ ...f })),
        showCalendar: d.showCalendar !== false,
        weeklyHours: d.weeklyHours || { ...DEFAULT_WEEKLY_HOURS },
        closedDates: Array.isArray(d.closedDates) ? d.closedDates : [],
        slotIntervalMinutes: Number(d.slotIntervalMinutes) || 60,
        minLeadHours: Number(d.minLeadHours) || 24,
        maxDaysAhead: Number(d.maxDaysAhead) || 60,
        bufferMinutes: Number(d.bufferMinutes) || 0,
        useCleanerAvailability: !!d.useCleanerAvailability,
        defaultDurationMin: Number(d.defaultDurationMin) || 120,
        autoCreateTask: d.autoCreateTask !== false,
        autoCreateProperty: d.autoCreateProperty !== false,
      })
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load booking page")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const publicPath = cfg.publicUrl || (cfg.publicSlug ? `/book/${cfg.publicSlug}` : "")
  const publicAbsolute = publicPath ? `${originBase()}${publicPath}` : ""

  const iframeSnippet = useMemo(() => {
    if (cfg.embedSnippet) return cfg.embedSnippet
    if (!cfg.publicSlug) return ""
    return `<iframe src="${originBase()}/book/${cfg.publicSlug}?embed=1" title="Book online" style="width:100%;min-height:720px;border:0;border-radius:16px;" loading="lazy"></iframe>`
  }, [cfg.embedSnippet, cfg.publicSlug])

  const scriptSnippet = useMemo(() => {
    if (!cfg.publicSlug) return ""
    return `<div data-tidyflow-book="${cfg.publicSlug}"></div>\n<script src="${originBase()}/embed/book.js" async></script>`
  }, [cfg.publicSlug])

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      setError("Could not copy to clipboard")
    }
  }

  const setDayHours = (dayKey: string, hours: DayHours) => {
    setCfg((c) => ({
      ...c,
      weeklyHours: { ...c.weeklyHours, [dayKey]: hours },
    }))
  }

  const updateField = (id: string, patch: Partial<BookingFormField>) => {
    setCfg((c) => ({
      ...c,
      formFields: c.formFields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }))
  }

  const addClosedDate = () => {
    const iso = newClosedDate.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      setError("Use an ISO date (YYYY-MM-DD)")
      return
    }
    if (cfg.closedDates.includes(iso)) return
    setCfg((c) => ({
      ...c,
      closedDates: [...c.closedDates, iso].sort(),
    }))
    setNewClosedDate("")
  }

  const save = async () => {
    try {
      setSaving(true)
      setError("")
      const res = await adminPatch("/api/company/booking-widget", {
        enabled: cfg.enabled,
        headline: cfg.headline,
        description: cfg.description,
        successMessage: cfg.successMessage,
        logoUrl: cfg.logoUrl || null,
        primaryColor: cfg.primaryColor,
        accentColor: cfg.accentColor,
        backgroundColor: cfg.backgroundColor,
        textColor: cfg.textColor,
        formFields: cfg.formFields,
        showCalendar: cfg.showCalendar,
        weeklyHours: cfg.weeklyHours,
        closedDates: cfg.closedDates,
        slotIntervalMinutes: Number(cfg.slotIntervalMinutes),
        minLeadHours: Number(cfg.minLeadHours),
        maxDaysAhead: Number(cfg.maxDaysAhead),
        bufferMinutes: Number(cfg.bufferMinutes),
        useCleanerAvailability: cfg.useCleanerAvailability,
        defaultDurationMin: Number(cfg.defaultDurationMin),
        autoCreateTask: cfg.autoCreateTask,
        autoCreateProperty: cfg.autoCreateProperty,
      })
      if (res.data?.success) {
        setToast(res.data.message || "Booking page saved")
        const d = res.data.data
        if (d) {
          setCfg((c) => ({
            ...c,
            publicSlug: d.publicSlug || c.publicSlug,
            publicUrl: d.publicUrl || c.publicUrl,
            embedSnippet: d.embedSnippet || c.embedSnippet,
          }))
        }
      } else setError(res.data?.message || "Save failed")
    } catch (e: any) {
      setError(e.response?.data?.message || "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-1">
        <OpsSkeleton rows={5} cols={3} message="Loading booking page…" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <OpsPageHeader
        eyebrow="Manage"
        title="Booking page"
        subtitle="Personalize your public booking link and website embed"
        actions={
          <div className="flex flex-wrap gap-2">
            <OpsRefreshButton onClick={load} loading={loading} />
            {publicPath ? (
              <OpsSecondaryButton
                onClick={() => window.open(publicPath, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink size={14} /> Live preview
              </OpsSecondaryButton>
            ) : null}
            <OpsPrimaryButton onClick={save} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarHeart size={14} />}
              Save changes
            </OpsPrimaryButton>
          </div>
        }
      />

      {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
      {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}

      {/* Enable + share */}
      <Section
        title="Public link & embed"
        subtitle="Turn on online booking and share the page on your site"
      >
        <div className="space-y-4">
          <ToggleRow
            label="Enable public booking"
            hint="When off, the public /book page returns unavailable"
            checked={cfg.enabled}
            onChange={(v) => setCfg((c) => ({ ...c, enabled: v }))}
          />

          <OpsField label="Public booking URL">
            <div className="flex flex-wrap gap-2">
              <input
                readOnly
                value={publicAbsolute || "—"}
                className={`${opsFieldCls} flex-1 font-mono text-xs`}
              />
              <OpsSecondaryButton
                disabled={!publicAbsolute}
                onClick={() => copyText("link", publicAbsolute)}
              >
                {copied === "link" ? <Check size={14} /> : <Copy size={14} />}
                {copied === "link" ? "Copied" : "Copy link"}
              </OpsSecondaryButton>
            </div>
          </OpsField>

          <div className="grid gap-4 lg:grid-cols-2">
            <OpsField label="Iframe embed">
              <textarea
                readOnly
                rows={5}
                value={iframeSnippet}
                className={`${opsFieldCls} font-mono text-[11px] leading-relaxed`}
              />
              <div className="mt-2">
                <OpsSecondaryButton
                  disabled={!iframeSnippet}
                  onClick={() => copyText("iframe", iframeSnippet)}
                >
                  {copied === "iframe" ? <Check size={14} /> : <Copy size={14} />}
                  Copy iframe
                </OpsSecondaryButton>
              </div>
            </OpsField>
            <OpsField
              label="Script embed"
              hint='Uses /embed/book.js with data-tidyflow-book="{slug}"'
            >
              <textarea
                readOnly
                rows={5}
                value={scriptSnippet}
                className={`${opsFieldCls} font-mono text-[11px] leading-relaxed`}
              />
              <div className="mt-2">
                <OpsSecondaryButton
                  disabled={!scriptSnippet}
                  onClick={() => copyText("script", scriptSnippet)}
                >
                  {copied === "script" ? <Check size={14} /> : <Copy size={14} />}
                  Copy script
                </OpsSecondaryButton>
              </div>
            </OpsField>
          </div>
        </div>
      </Section>

      {/* Brand */}
      <Section title="Brand colors" subtitle="Navy/amber defaults match TidyFlow; override to match your brand">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ColorField
            label="Primary"
            value={cfg.primaryColor}
            onChange={(v) => setCfg((c) => ({ ...c, primaryColor: v }))}
          />
          <ColorField
            label="Accent"
            value={cfg.accentColor}
            onChange={(v) => setCfg((c) => ({ ...c, accentColor: v }))}
          />
          <ColorField
            label="Background"
            value={cfg.backgroundColor}
            onChange={(v) => setCfg((c) => ({ ...c, backgroundColor: v }))}
          />
          <ColorField
            label="Text"
            value={cfg.textColor}
            onChange={(v) => setCfg((c) => ({ ...c, textColor: v }))}
          />
        </div>
        <div
          className="mt-4 overflow-hidden rounded-xl border border-control-border"
          style={{ background: cfg.backgroundColor, color: cfg.textColor }}
        >
          <div className="px-4 py-3" style={{ background: cfg.primaryColor, color: "#fff" }}>
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">Preview</p>
            <p className="text-lg font-extrabold">{cfg.headline || "Book a cleaning"}</p>
          </div>
          <div className="px-4 py-3 text-sm">
            <p className="opacity-80">{cfg.description || "Choose a time that works for you."}</p>
            <button
              type="button"
              className="mt-3 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
              style={{ background: cfg.accentColor }}
            >
              Request booking
            </button>
          </div>
        </div>
      </Section>

      {/* Copy */}
      <Section title="Page copy" subtitle="Headline, description, success message, and logo">
        <div className="grid gap-4 md:grid-cols-2">
          <OpsField label="Headline" required>
            <input
              className={opsFieldCls}
              value={cfg.headline}
              onChange={(e) => setCfg((c) => ({ ...c, headline: e.target.value }))}
              maxLength={120}
            />
          </OpsField>
          <OpsField label="Logo URL">
            <input
              className={opsFieldCls}
              value={cfg.logoUrl}
              onChange={(e) => setCfg((c) => ({ ...c, logoUrl: e.target.value }))}
              placeholder="https://…"
            />
          </OpsField>
          <OpsField label="Description">
            <textarea
              rows={3}
              className={opsFieldCls}
              value={cfg.description}
              onChange={(e) => setCfg((c) => ({ ...c, description: e.target.value }))}
            />
          </OpsField>
          <OpsField label="Success message">
            <textarea
              rows={3}
              className={opsFieldCls}
              value={cfg.successMessage}
              onChange={(e) => setCfg((c) => ({ ...c, successMessage: e.target.value }))}
            />
          </OpsField>
        </div>
      </Section>

      {/* Form fields */}
      <Section title="Form fields" subtitle="Enable or require each default field on the public form">
        {cfg.formFields.length === 0 ? (
          <OpsEmpty message="No form fields configured" />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-navy-900">
            {cfg.formFields.map((f) => (
              <div
                key={f.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-navy-900 dark:text-white">{f.label}</p>
                  <p className="font-mono text-[10px] uppercase text-slate-400">
                    {f.id} · {f.type}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={f.enabled}
                      onChange={(e) => updateField(f.id, { enabled: e.target.checked })}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    Enabled
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={f.required}
                      disabled={!f.enabled}
                      onChange={(e) => updateField(f.id, { required: e.target.checked })}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 disabled:opacity-40"
                    />
                    Required
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Calendar */}
      <Section title="Calendar & availability" subtitle="Hours, closed dates, lead times, and automation">
        <div className="mb-4 space-y-2">
          <ToggleRow
            label="Show calendar on booking page"
            checked={cfg.showCalendar}
            onChange={(v) => setCfg((c) => ({ ...c, showCalendar: v }))}
          />
          <ToggleRow
            label="Respect cleaner availability"
            hint="Only offer slots when a cleaner is free"
            checked={cfg.useCleanerAvailability}
            onChange={(v) => setCfg((c) => ({ ...c, useCleanerAvailability: v }))}
          />
          <ToggleRow
            label="Auto-create task on approve"
            checked={cfg.autoCreateTask}
            onChange={(v) => setCfg((c) => ({ ...c, autoCreateTask: v }))}
          />
          <ToggleRow
            label="Auto-create property from address"
            checked={cfg.autoCreateProperty}
            onChange={(v) => setCfg((c) => ({ ...c, autoCreateProperty: v }))}
          />
        </div>

        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Weekly hours
        </p>
        <div className="mb-5 space-y-2">
          {DAY_LABELS.map(({ key, label }) => {
            const hours = cfg.weeklyHours?.[key] ?? null
            const closed = hours == null
            return (
              <div
                key={key}
                className="grid grid-cols-1 items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-navy-800 sm:grid-cols-[140px_1fr_auto]"
              >
                <p className="text-sm font-semibold text-navy-900 dark:text-white">{label}</p>
                {closed ? (
                  <p className="text-xs font-medium text-slate-400">Closed</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      value={hours.start}
                      onChange={(e) =>
                        setDayHours(key, { start: e.target.value, end: hours.end })
                      }
                      className={`${opsFieldCls} w-auto`}
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <input
                      type="time"
                      value={hours.end}
                      onChange={(e) =>
                        setDayHours(key, { start: hours.start, end: e.target.value })
                      }
                      className={`${opsFieldCls} w-auto`}
                    />
                  </div>
                )}
                <label className="inline-flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={closed}
                    onChange={(e) =>
                      setDayHours(
                        key,
                        e.target.checked ? null : { start: "09:00", end: "17:00" }
                      )
                    }
                    className="rounded border-slate-300 text-amber-600"
                  />
                  Closed
                </label>
              </div>
            )
          })}
        </div>

        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Closed dates
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            type="date"
            value={newClosedDate}
            onChange={(e) => setNewClosedDate(e.target.value)}
            className={`${opsFieldCls} w-auto`}
          />
          <OpsSecondaryButton onClick={addClosedDate}>
            <Plus size={14} /> Add date
          </OpsSecondaryButton>
        </div>
        {cfg.closedDates.length === 0 ? (
          <p className="mb-5 text-xs text-slate-400">No closed dates</p>
        ) : (
          <ul className="mb-5 flex flex-wrap gap-2">
            {cfg.closedDates.map((d) => (
              <li
                key={d}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs dark:border-navy-800 dark:bg-navy-950"
              >
                {d}
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700"
                  onClick={() =>
                    setCfg((c) => ({
                      ...c,
                      closedDates: c.closedDates.filter((x) => x !== d),
                    }))
                  }
                  title="Remove"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <OpsField label="Slot interval (minutes)">
            <input
              type="number"
              min={15}
              max={240}
              className={opsFieldCls}
              value={cfg.slotIntervalMinutes}
              onChange={(e) =>
                setCfg((c) => ({ ...c, slotIntervalMinutes: Number(e.target.value) }))
              }
            />
          </OpsField>
          <OpsField label="Min lead hours">
            <input
              type="number"
              min={0}
              max={168}
              className={opsFieldCls}
              value={cfg.minLeadHours}
              onChange={(e) =>
                setCfg((c) => ({ ...c, minLeadHours: Number(e.target.value) }))
              }
            />
          </OpsField>
          <OpsField label="Max days ahead">
            <input
              type="number"
              min={7}
              max={365}
              className={opsFieldCls}
              value={cfg.maxDaysAhead}
              onChange={(e) =>
                setCfg((c) => ({ ...c, maxDaysAhead: Number(e.target.value) }))
              }
            />
          </OpsField>
          <OpsField label="Buffer (minutes)">
            <input
              type="number"
              min={0}
              max={240}
              className={opsFieldCls}
              value={cfg.bufferMinutes}
              onChange={(e) =>
                setCfg((c) => ({ ...c, bufferMinutes: Number(e.target.value) }))
              }
            />
          </OpsField>
          <OpsField label="Default duration (minutes)">
            <input
              type="number"
              min={30}
              max={480}
              className={opsFieldCls}
              value={cfg.defaultDurationMin}
              onChange={(e) =>
                setCfg((c) => ({ ...c, defaultDurationMin: Number(e.target.value) }))
              }
            />
          </OpsField>
        </div>
      </Section>

      <div className="flex justify-end gap-2 pb-6">
        <OpsSecondaryButton
          disabled={!publicPath}
          onClick={() => window.open(publicPath, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink size={14} /> Live preview
        </OpsSecondaryButton>
        <OpsPrimaryButton onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Save changes
        </OpsPrimaryButton>
      </div>
    </div>
  )
}
