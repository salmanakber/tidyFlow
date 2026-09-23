"use client"

/**
 * Booking studio — dense, low-scroll personalization with live preview.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import AdminLayout from "@/components/AdminLayout"
import { adminGet, adminPatch, getAdminAuthHeaders } from "@/lib/admin-session"
import {
  DEFAULT_FORM_FIELDS,
  DEFAULT_SERVICE_OPTIONS,
  DEFAULT_THEME,
  DEFAULT_WEEKLY_HOURS,
  FIELD_TYPE_OPTIONS,
  newFieldId,
  type BookingFormField,
  type BookingFormFieldType,
  type BookingServiceOption,
  type DayHours,
  type WeeklyHours,
} from "@/lib/booking-widget"
import { OpsFlash, OpsSkeleton } from "@/components/ops/OpsChrome"
import {
  Check,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"

const DAY_LABELS: { key: string; label: string }[] = [
  { key: "1", label: "Mon" },
  { key: "2", label: "Tue" },
  { key: "3", label: "Wed" },
  { key: "4", label: "Thu" },
  { key: "5", label: "Fri" },
  { key: "6", label: "Sat" },
  { key: "0", label: "Sun" },
]

type StudioTab = "brand" | "fields" | "calendar" | "share"

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
  serviceOptions: BookingServiceOption[]
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
    enabled: true,
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
    serviceOptions: DEFAULT_SERVICE_OPTIONS.map((s) => ({ ...s })),
    showCalendar: true,
    weeklyHours: { ...DEFAULT_WEEKLY_HOURS },
    closedDates: [],
    slotIntervalMinutes: 60,
    minLeadHours: 24,
    maxDaysAhead: 60,
    bufferMinutes: 30,
    useCleanerAvailability: true,
    defaultDurationMin: 120,
    autoCreateTask: false,
    autoCreateProperty: true,
  }
}

function originBase() {
  if (typeof window !== "undefined") return window.location.origin
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.tidyflowapp.com"
}

const inp =
  "w-full rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-[13px] text-navy-900 outline-none transition placeholder:text-slate-300 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/15 dark:border-navy-800 dark:bg-navy-950 dark:text-white"

function L({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[9px] font-bold tracking-[0.14em] text-slate-400 uppercase">
      {children}
    </span>
  )
}

function Pill({
  on,
  label,
  onClick,
}: {
  on: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
        on
          ? "bg-navy-900 text-amber-300 dark:bg-amber-600 dark:text-white"
          : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-navy-900 dark:text-slate-400"
      }`}
    >
      {label}
    </button>
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
  const [tab, setTab] = useState<StudioTab>("brand")
  const [fieldsPanel, setFieldsPanel] = useState<"questions" | "services">(
    "questions"
  )
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null
  )
  const [previewKey, setPreviewKey] = useState(0)
  const [logoUploading, setLogoUploading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError("")
      const res = await adminGet("/api/company/booking-widget")
      if (!res.data?.success) {
        setError(res.data?.message || "Failed to load")
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
        serviceOptions: Array.isArray(d.serviceOptions)
          ? d.serviceOptions
          : DEFAULT_SERVICE_OPTIONS.map((s) => ({ ...s })),
        showCalendar: d.showCalendar !== false,
        weeklyHours: d.weeklyHours || { ...DEFAULT_WEEKLY_HOURS },
        closedDates: Array.isArray(d.closedDates) ? d.closedDates : [],
        slotIntervalMinutes: Number(d.slotIntervalMinutes) || 60,
        minLeadHours: Number(d.minLeadHours) || 24,
        maxDaysAhead: Number(d.maxDaysAhead) || 60,
        bufferMinutes: Number(d.bufferMinutes) || 30,
        useCleanerAvailability: !!d.useCleanerAvailability,
        defaultDurationMin: Number(d.defaultDurationMin) || 120,
        autoCreateTask: !!d.autoCreateTask,
        autoCreateProperty: d.autoCreateProperty !== false,
      })
      setPreviewKey((k) => k + 1)
    } catch (e: any) {
      setError(e.response?.data?.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Push live colors/copy into iframe preview (no save required)
  const pushPreview = useCallback(() => {
    const win = iframeRef.current?.contentWindow
    if (!win) return
    try {
      win.postMessage(
        {
          type: "tidyflow-booking-preview",
          primaryColor: cfg.primaryColor,
          accentColor: cfg.accentColor,
          backgroundColor: cfg.backgroundColor,
          textColor: cfg.textColor,
          headline: cfg.headline,
          description: cfg.description,
          logoUrl: cfg.logoUrl || null,
        },
        window.location.origin
      )
    } catch {
      /* ignore */
    }
  }, [cfg])

  useEffect(() => {
    pushPreview()
  }, [pushPreview])

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === "tidyflow-booking-ready") pushPreview()
    }
    window.addEventListener("message", onMsg)
    return () => window.removeEventListener("message", onMsg)
  }, [pushPreview])

  const uploadLogo = async (file: File) => {
    try {
      setLogoUploading(true)
      setError("")
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/company/booking-widget/logo", {
        method: "POST",
        headers: getAdminAuthHeaders(),
        body: fd,
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        setError(json?.message || "Logo upload failed")
        return
      }
      setCfg((c) => ({ ...c, logoUrl: json.data.url }))
      setToast("Logo uploaded")
      setPreviewKey((k) => k + 1)
    } catch (e: any) {
      setError(e?.message || "Logo upload failed")
    } finally {
      setLogoUploading(false)
    }
  }

  const publicPath =
    cfg.publicUrl || (cfg.publicSlug ? `/book/${cfg.publicSlug}` : "")
  const publicAbsolute = publicPath ? `${originBase()}${publicPath}` : ""
  const previewSrc = cfg.publicSlug
    ? `${publicPath}?embed=1&v=${previewKey}`
    : ""

  const iframeSnippet = useMemo(() => {
    if (!cfg.publicSlug) return ""
    return `<iframe src="${originBase()}/book/${cfg.publicSlug}?embed=1" title="Book online" style="width:100%;min-height:780px;border:0;border-radius:20px;" loading="lazy"></iframe>`
  }, [cfg.publicSlug])

  const scriptSnippet = useMemo(() => {
    if (!cfg.publicSlug) return ""
    return `<div data-tidyflow-book="${cfg.publicSlug}" data-height="820px"></div>\n<script src="${originBase()}/embed/book.js" async></script>`
  }, [cfg.publicSlug])

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1400)
    } catch {
      setError("Could not copy")
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

  const addField = () => {
    const id = newFieldId()
    setCfg((c) => ({
      ...c,
      formFields: [
        ...c.formFields,
        {
          id,
          label: "New question",
          type: "text" as BookingFormFieldType,
          required: false,
          enabled: true,
          placeholder: "",
        },
      ],
    }))
    setFieldsPanel("questions")
    setSelectedFieldId(id)
  }

  const removeField = (id: string) => {
    const locked = new Set(["name", "email", "phone", "address"])
    if (locked.has(id)) return
    const idx = cfg.formFields.findIndex((f) => f.id === id)
    const nextFields = cfg.formFields.filter((f) => f.id !== id)
    const nextId =
      nextFields[Math.min(Math.max(idx, 0), nextFields.length - 1)]?.id ?? null
    setCfg((c) => ({
      ...c,
      formFields: c.formFields.filter((f) => f.id !== id),
    }))
    setSelectedFieldId((cur) => (cur === id ? nextId : cur))
  }

  const moveField = (id: string, dir: -1 | 1) => {
    setCfg((c) => {
      const idx = c.formFields.findIndex((f) => f.id === id)
      if (idx < 0) return c
      const next = idx + dir
      if (next < 0 || next >= c.formFields.length) return c
      const copy = [...c.formFields]
      const [row] = copy.splice(idx, 1)
      copy.splice(next, 0, row)
      return { ...c, formFields: copy }
    })
  }

  const updateService = (id: string, patch: Partial<BookingServiceOption>) => {
    setCfg((c) => ({
      ...c,
      serviceOptions: c.serviceOptions.map((s) =>
        s.id === id ? { ...s, ...patch } : s
      ),
    }))
  }

  const addService = () => {
    const id = newFieldId("svc")
    setCfg((c) => ({
      ...c,
      serviceOptions: [
        ...c.serviceOptions,
        { id, label: "New service", durationMinutes: 120, icon: "sparkles" },
      ],
    }))
    setFieldsPanel("services")
    setSelectedServiceId(id)
  }

  const removeService = (id: string) => {
    const idx = cfg.serviceOptions.findIndex((s) => s.id === id)
    const next = cfg.serviceOptions.filter((s) => s.id !== id)
    const nextId =
      next[Math.min(Math.max(idx, 0), next.length - 1)]?.id ?? null
    setCfg((c) => ({
      ...c,
      serviceOptions: c.serviceOptions.filter((s) => s.id !== id),
    }))
    setSelectedServiceId((cur) => (cur === id ? nextId : cur))
  }

  const moveService = (id: string, dir: -1 | 1) => {
    setCfg((c) => {
      const idx = c.serviceOptions.findIndex((s) => s.id === id)
      if (idx < 0) return c
      const next = idx + dir
      if (next < 0 || next >= c.serviceOptions.length) return c
      const copy = [...c.serviceOptions]
      const [row] = copy.splice(idx, 1)
      copy.splice(next, 0, row)
      return { ...c, serviceOptions: copy }
    })
  }

  const selectedField =
    cfg.formFields.find((f) => f.id === selectedFieldId) || null
  const selectedService =
    cfg.serviceOptions.find((s) => s.id === selectedServiceId) || null

  const typeLabel = (type: string) =>
    FIELD_TYPE_OPTIONS.find((o) => o.value === type)?.label ||
    (type === "dropdown" ? "Dropdown" : type)

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
        serviceOptions: cfg.serviceOptions,
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
        setToast("Saved — preview refreshed")
        setPreviewKey((k) => k + 1)
        const d = res.data.data
        if (d) {
          setCfg((c) => ({
            ...c,
            publicSlug: d.publicSlug || c.publicSlug,
            publicUrl: d.publicUrl || c.publicUrl,
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
        <OpsSkeleton rows={4} cols={3} message="Opening booking studio…" />
      </div>
    )
  }

  const tabs: { id: StudioTab; label: string }[] = [
    { id: "brand", label: "Brand" },
    { id: "fields", label: "Fields" },
    { id: "calendar", label: "Calendar" },
    { id: "share", label: "Share" },
  ]

  return (
    <div className="flex h-[calc(100vh-5.5rem)] min-h-[560px] flex-col gap-3 overflow-hidden">
      {/* Compact toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-navy-900/8 bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 px-4 py-2.5 text-white shadow-lg shadow-navy-950/15">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logot-transparent.png"
            alt=""
            className="h-8 w-8 rounded-lg object-contain"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight">Booking studio</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wide uppercase ${
                  cfg.enabled
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-white/10 text-white/50"
                }`}
              >
                {cfg.enabled ? "Live" : "Paused"}
              </span>
            </div>
            <p className="truncate font-mono text-[10px] text-white/40">
              {publicAbsolute || "Save to generate your public link"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={cfg.enabled}
            onClick={() => setCfg((c) => ({ ...c, enabled: !c.enabled }))}
            className={`relative h-6 w-10 rounded-full transition ${
              cfg.enabled ? "bg-amber-500" : "bg-white/20"
            }`}
            title="Enable public booking"
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                cfg.enabled ? "translate-x-4" : ""
              }`}
            />
          </button>
          {publicPath ? (
            <button
              type="button"
              onClick={() =>
                window.open(publicPath, "_blank", "noopener,noreferrer")
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/10"
            >
              <ExternalLink size={12} /> Open
            </button>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-navy-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            Save
          </button>
        </div>
      </div>

      {(toast || error) && (
        <div className="shrink-0">
          {toast && <OpsFlash ok text={toast} onClose={() => setToast("")} />}
          {error && <OpsFlash ok={false} text={error} onClose={() => setError("")} />}
        </div>
      )}

      {/* Workspace: editor | preview — both fill remaining height */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Editor column */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-navy-800 dark:bg-control-darkCard">
          <div className="flex shrink-0 gap-1 border-b border-slate-100 px-3 py-2 dark:border-navy-800">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                  tab === t.id
                    ? "bg-navy-900 text-amber-300 dark:bg-amber-600 dark:text-white"
                    : "text-slate-500 hover:bg-slate-50 dark:hover:bg-navy-900"
                }`}
                onClick={() => {
                  setTab(t.id)
                  if (t.id === "fields") {
                    setSelectedFieldId((cur) =>
                      cur && cfg.formFields.some((f) => f.id === cur)
                        ? cur
                        : cfg.formFields[0]?.id || null
                    )
                    setSelectedServiceId((cur) =>
                      cur && cfg.serviceOptions.some((s) => s.id === cur)
                        ? cur
                        : cfg.serviceOptions[0]?.id || null
                    )
                  }
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            className={`min-h-0 flex-1 p-4 ${
              tab === "fields"
                ? "flex flex-col overflow-hidden"
                : "overflow-y-auto"
            }`}
          >
            {tab === "brand" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 md:col-span-2">
                  <div>
                    <L>Headline</L>
                    <input
                      className={inp}
                      value={cfg.headline}
                      onChange={(e) =>
                        setCfg((c) => ({ ...c, headline: e.target.value }))
                      }
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <L>Supporting line</L>
                      <textarea
                        rows={2}
                        className={inp}
                        value={cfg.description}
                        onChange={(e) =>
                          setCfg((c) => ({ ...c, description: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <L>Success message</L>
                      <textarea
                        rows={2}
                        className={inp}
                        value={cfg.successMessage}
                        onChange={(e) =>
                          setCfg((c) => ({
                            ...c,
                            successMessage: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <L>Company logo</L>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-navy-800 dark:bg-navy-950">
                        {cfg.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cfg.logoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImagePlus size={18} className="text-slate-300" />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) void uploadLogo(f)
                            e.target.value = ""
                          }}
                        />
                        <button
                          type="button"
                          disabled={logoUploading}
                          onClick={() => fileRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-2 text-[11px] font-bold text-amber-300 disabled:opacity-50 dark:bg-amber-600 dark:text-white"
                        >
                          {logoUploading ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <ImagePlus size={12} />
                          )}
                          {logoUploading ? "Uploading…" : "Choose image"}
                        </button>
                        {cfg.logoUrl ? (
                          <button
                            type="button"
                            onClick={() =>
                              setCfg((c) => ({ ...c, logoUrl: "" }))
                            }
                            className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-500 dark:border-navy-800"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      PNG/JPG/WebP · max 4MB · saved via Cloudinary
                    </p>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <L>Palette</L>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        ["primaryColor", "Primary"],
                        ["accentColor", "Accent"],
                        ["backgroundColor", "Background"],
                        ["textColor", "Text"],
                      ] as const
                    ).map(([key, label]) => (
                      <div
                        key={key}
                        className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2 dark:border-navy-800 dark:bg-navy-950"
                      >
                        <input
                          type="color"
                          value={cfg[key] || "#000000"}
                          onChange={(e) =>
                            setCfg((c) => ({ ...c, [key]: e.target.value }))
                          }
                          className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                        />
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-slate-400">
                            {label}
                          </p>
                          <input
                            className="w-full truncate bg-transparent font-mono text-[10px] uppercase outline-none"
                            value={cfg[key]}
                            onChange={(e) =>
                              setCfg((c) => ({ ...c, [key]: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "fields" && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {/* Sub-nav: Questions vs Services */}
                <div className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100/90 p-1 dark:bg-navy-950">
                  {(
                    [
                      [
                        "questions",
                        "Form questions",
                        cfg.formFields.filter((f) => f.enabled).length,
                      ],
                      ["services", "Services", cfg.serviceOptions.length],
                    ] as const
                  ).map(([id, label, count]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFieldsPanel(id)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                        fieldsPanel === id
                          ? "bg-white text-navy-900 shadow-sm dark:bg-navy-800 dark:text-white"
                          : "text-slate-500 hover:text-navy-900 dark:hover:text-white"
                      }`}
                    >
                      {label}
                      <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 font-mono text-[9px] dark:bg-navy-900">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>

                {fieldsPanel === "questions" ? (
                  <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
                    {/* Compact list */}
                    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-navy-800">
                      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-navy-800">
                        <p className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                          Tap a row to edit
                        </p>
                        <button
                          type="button"
                          onClick={addField}
                          className="inline-flex items-center gap-1 rounded-lg bg-navy-950 px-2.5 py-1.5 text-[10px] font-bold text-white"
                        >
                          <Plus size={12} /> Add
                        </button>
                      </div>
                      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
                        {cfg.formFields.map((f, idx) => {
                          const active = selectedFieldId === f.id
                          return (
                            <li key={f.id}>
                              <button
                                type="button"
                                onClick={() => setSelectedFieldId(f.id)}
                                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                                  active
                                    ? "bg-amber-50 ring-1 ring-amber-400/50 dark:bg-amber-950/40 dark:ring-amber-600/40"
                                    : "hover:bg-slate-50 dark:hover:bg-navy-900/60"
                                } ${!f.enabled ? "opacity-45" : ""}`}
                              >
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 font-mono text-[10px] font-bold text-slate-500 dark:bg-navy-900">
                                  {idx + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13px] font-bold text-navy-900 dark:text-white">
                                    {f.label || "Untitled"}
                                  </p>
                                  <p className="truncate font-mono text-[9px] text-slate-400">
                                    {typeLabel(f.type)}
                                    {f.required ? " · required" : ""}
                                    {!f.enabled ? " · hidden" : ""}
                                  </p>
                                </div>
                                <span
                                  className={`h-2 w-2 shrink-0 rounded-full ${
                                    f.enabled ? "bg-emerald-500" : "bg-slate-300"
                                  }`}
                                />
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>

                    {/* Single-field inspector */}
                    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 dark:border-navy-800 dark:bg-navy-950/40">
                      {!selectedField ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                          <p className="text-[13px] font-semibold text-navy-900 dark:text-white">
                            Select a question
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Or add a new one to start editing
                          </p>
                          <button
                            type="button"
                            onClick={addField}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-navy-950"
                          >
                            <Plus size={12} /> New question
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-navy-800">
                            <p className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                              Edit question
                            </p>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                title="Move up"
                                onClick={() => moveField(selectedField.id, -1)}
                                className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-navy-900 dark:hover:bg-navy-900"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                title="Move down"
                                onClick={() => moveField(selectedField.id, 1)}
                                className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-navy-900 dark:hover:bg-navy-900"
                              >
                                <ChevronDown size={14} />
                              </button>
                              {!["name", "email", "phone", "address"].includes(
                                selectedField.id
                              ) && (
                                <button
                                  type="button"
                                  title="Delete"
                                  onClick={() => removeField(selectedField.id)}
                                  className="rounded-md p-1 text-rose-500 hover:bg-rose-50"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                            <div>
                              <L>Label</L>
                              <input
                                className={inp}
                                value={selectedField.label}
                                onChange={(e) =>
                                  updateField(selectedField.id, {
                                    label: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <L>Type</L>
                              <select
                                className={inp}
                                value={
                                  selectedField.type === "dropdown"
                                    ? "select"
                                    : selectedField.type
                                }
                                onChange={(e) =>
                                  updateField(selectedField.id, {
                                    type: e.target
                                      .value as BookingFormFieldType,
                                  })
                                }
                              >
                                {FIELD_TYPE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <Pill
                                on={selectedField.enabled}
                                label={
                                  selectedField.enabled ? "Visible" : "Hidden"
                                }
                                onClick={() =>
                                  updateField(selectedField.id, {
                                    enabled: !selectedField.enabled,
                                  })
                                }
                              />
                              <Pill
                                on={
                                  !!selectedField.required &&
                                  selectedField.enabled
                                }
                                label="Required"
                                onClick={() => {
                                  if (!selectedField.enabled) return
                                  updateField(selectedField.id, {
                                    required: !selectedField.required,
                                  })
                                }}
                              />
                            </div>
                            <div>
                              <L>
                                {selectedField.type === "checkbox"
                                  ? "Checkbox text"
                                  : "Placeholder"}
                              </L>
                              <input
                                className={inp}
                                value={selectedField.placeholder || ""}
                                onChange={(e) =>
                                  updateField(selectedField.id, {
                                    placeholder: e.target.value,
                                  })
                                }
                                placeholder="Optional hint for the guest"
                              />
                            </div>
                            {(selectedField.type === "checkbox" ||
                              selectedField.type === "plan") && (
                              <>
                                <div>
                                  <L>Icon name</L>
                                  <input
                                    className={inp}
                                    value={selectedField.icon || ""}
                                    onChange={(e) =>
                                      updateField(selectedField.id, {
                                        icon: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. home, sparkles"
                                  />
                                </div>
                                <div>
                                  <L>Image URL</L>
                                  <input
                                    className={inp}
                                    value={selectedField.imageUrl || ""}
                                    onChange={(e) =>
                                      updateField(selectedField.id, {
                                        imageUrl: e.target.value,
                                      })
                                    }
                                    placeholder="https://…"
                                  />
                                </div>
                              </>
                            )}
                            {["select", "dropdown", "radio"].includes(
                              selectedField.type
                            ) && (
                              <div>
                                <L>Options (one per line)</L>
                                <textarea
                                  className={inp}
                                  rows={4}
                                  value={(selectedField.options || []).join(
                                    "\n"
                                  )}
                                  onChange={(e) =>
                                    updateField(selectedField.id, {
                                      options: e.target.value
                                        .split("\n")
                                        .map((x) => x.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                  placeholder={"Option A\nOption B"}
                                />
                              </div>
                            )}
                            {selectedField.type === "plan" && (
                              <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                Service cards come from the{" "}
                                <button
                                  type="button"
                                  className="font-bold underline"
                                  onClick={() => setFieldsPanel("services")}
                                >
                                  Services
                                </button>{" "}
                                tab.
                              </p>
                            )}
                            <p className="font-mono text-[9px] text-slate-400">
                              id: {selectedField.id}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
                    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-navy-800">
                      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-navy-800">
                        <p className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                          Cleaning packages
                        </p>
                        <button
                          type="button"
                          onClick={addService}
                          className="inline-flex items-center gap-1 rounded-lg bg-navy-950 px-2.5 py-1.5 text-[10px] font-bold text-white"
                        >
                          <Plus size={12} /> Add
                        </button>
                      </div>
                      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
                        {cfg.serviceOptions.length === 0 ? (
                          <li className="px-3 py-8 text-center text-[11px] text-slate-400">
                            No services yet — add your first package
                          </li>
                        ) : (
                          cfg.serviceOptions.map((s, idx) => {
                            const active = selectedServiceId === s.id
                            return (
                              <li key={s.id}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedServiceId(s.id)}
                                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                                    active
                                      ? "bg-amber-50 ring-1 ring-amber-400/50 dark:bg-amber-950/40"
                                      : "hover:bg-slate-50 dark:hover:bg-navy-900/60"
                                  }`}
                                >
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 font-mono text-[10px] font-bold text-slate-500 dark:bg-navy-900">
                                    {idx + 1}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[13px] font-bold text-navy-900 dark:text-white">
                                      {s.label}
                                    </p>
                                    <p className="font-mono text-[9px] text-slate-400">
                                      {s.durationMinutes} min
                                    </p>
                                  </div>
                                </button>
                              </li>
                            )
                          })
                        )}
                      </ul>
                    </div>

                    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 dark:border-navy-800 dark:bg-navy-950/40">
                      {!selectedService ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                          <p className="text-[13px] font-semibold text-navy-900 dark:text-white">
                            Select a service
                          </p>
                          <button
                            type="button"
                            onClick={addService}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-navy-950"
                          >
                            <Plus size={12} /> New service
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-navy-800">
                            <p className="text-[10px] font-bold tracking-wide text-slate-400 uppercase">
                              Edit service
                            </p>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  moveService(selectedService.id, -1)
                                }
                                className="rounded-md p-1 text-slate-400 hover:bg-white dark:hover:bg-navy-900"
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  moveService(selectedService.id, 1)
                                }
                                className="rounded-md p-1 text-slate-400 hover:bg-white dark:hover:bg-navy-900"
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removeService(selectedService.id)
                                }
                                className="rounded-md p-1 text-rose-500 hover:bg-rose-50"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                            <div>
                              <L>Name</L>
                              <input
                                className={inp}
                                value={selectedService.label}
                                onChange={(e) =>
                                  updateService(selectedService.id, {
                                    label: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <L>Duration (minutes)</L>
                              <input
                                type="number"
                                min={15}
                                step={15}
                                className={inp}
                                value={selectedService.durationMinutes}
                                onChange={(e) =>
                                  updateService(selectedService.id, {
                                    durationMinutes: Math.max(
                                      15,
                                      Number(e.target.value) || 60
                                    ),
                                  })
                                }
                              />
                            </div>
                            <div>
                              <L>Short description</L>
                              <input
                                className={inp}
                                value={selectedService.description || ""}
                                onChange={(e) =>
                                  updateService(selectedService.id, {
                                    description: e.target.value,
                                  })
                                }
                                placeholder="Optional blurb on the card"
                              />
                            </div>
                            <div>
                              <L>Icon</L>
                              <input
                                className={inp}
                                value={selectedService.icon || ""}
                                onChange={(e) =>
                                  updateService(selectedService.id, {
                                    icon: e.target.value,
                                  })
                                }
                                placeholder="home, sparkles…"
                              />
                            </div>
                            <div>
                              <L>Image URL</L>
                              <input
                                className={inp}
                                value={selectedService.imageUrl || ""}
                                onChange={(e) =>
                                  updateService(selectedService.id, {
                                    imageUrl: e.target.value,
                                  })
                                }
                                placeholder="https://…"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "calendar" && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["showCalendar", "Calendar"],
                      ["useCleanerAvailability", "Cleaner hours"],
                      ["autoCreateProperty", "Auto property"],
                      ["autoCreateTask", "Auto task"],
                    ] as const
                  ).map(([key, label]) => (
                    <Pill
                      key={key}
                      on={!!cfg[key]}
                      label={label}
                      onClick={() =>
                        setCfg((c) => ({ ...c, [key]: !c[key] }))
                      }
                    />
                  ))}
                </div>

                <div>
                  <L>Weekly hours</L>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {DAY_LABELS.map(({ key, label }) => {
                      const hours = cfg.weeklyHours?.[key] ?? null
                      const closed = hours == null
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 dark:border-navy-800"
                        >
                          <span className="w-8 text-[11px] font-bold text-navy-900 dark:text-white">
                            {label}
                          </span>
                          {closed ? (
                            <span className="flex-1 text-[11px] text-slate-400">
                              Closed
                            </span>
                          ) : (
                            <div className="flex flex-1 items-center gap-1">
                              <input
                                type="time"
                                value={hours.start}
                                onChange={(e) =>
                                  setDayHours(key, {
                                    start: e.target.value,
                                    end: hours.end,
                                  })
                                }
                                className={`${inp} py-1 text-[11px]`}
                              />
                              <input
                                type="time"
                                value={hours.end}
                                onChange={(e) =>
                                  setDayHours(key, {
                                    start: hours.start,
                                    end: e.target.value,
                                  })
                                }
                                className={`${inp} py-1 text-[11px]`}
                              />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setDayHours(
                                key,
                                closed
                                  ? { start: "09:00", end: "17:00" }
                                  : null
                              )
                            }
                            className="text-[10px] font-bold text-slate-400 hover:text-navy-900"
                          >
                            {closed ? "Open" : "Off"}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <L>Closed dates</L>
                    <div className="mb-2 flex gap-1.5">
                      <input
                        type="date"
                        value={newClosedDate}
                        onChange={(e) => setNewClosedDate(e.target.value)}
                        className={inp}
                      />
                      <button
                        type="button"
                        className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 text-slate-600 hover:bg-slate-200 dark:bg-navy-900 dark:text-slate-300"
                        onClick={() => {
                          const iso = newClosedDate.trim()
                          if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return
                          if (cfg.closedDates.includes(iso)) return
                          setCfg((c) => ({
                            ...c,
                            closedDates: [...c.closedDates, iso].sort(),
                          }))
                          setNewClosedDate("")
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                      {cfg.closedDates.map((d) => (
                        <span
                          key={d}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] dark:border-navy-800 dark:bg-navy-950"
                        >
                          {d}
                          <button
                            type="button"
                            onClick={() =>
                              setCfg((c) => ({
                                ...c,
                                closedDates: c.closedDates.filter((x) => x !== d),
                              }))
                            }
                          >
                            <Trash2 size={10} className="text-red-500" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["slotIntervalMinutes", "Slot min"],
                        ["minLeadHours", "Lead hrs"],
                        ["maxDaysAhead", "Days ahead"],
                        ["bufferMinutes", "Buffer"],
                        ["defaultDurationMin", "Duration"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <L>{label}</L>
                        <input
                          type="number"
                          className={inp}
                          value={cfg[key]}
                          onChange={(e) =>
                            setCfg((c) => ({
                              ...c,
                              [key]: Number(e.target.value),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "share" && (
              <div className="space-y-3">
                <div>
                  <L>Public link</L>
                  <div className="flex gap-1.5">
                    <input
                      readOnly
                      value={publicAbsolute || "—"}
                      className={`${inp} font-mono text-[11px]`}
                    />
                    <button
                      type="button"
                      disabled={!publicAbsolute}
                      onClick={() => copyText("link", publicAbsolute)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold dark:border-navy-800"
                    >
                      {copied === "link" ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <L>Iframe</L>
                    <textarea
                      readOnly
                      rows={4}
                      value={iframeSnippet}
                      className={`${inp} font-mono text-[10px] leading-relaxed`}
                    />
                    <button
                      type="button"
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"
                      onClick={() => copyText("iframe", iframeSnippet)}
                    >
                      {copied === "iframe" ? <Check size={12} /> : <Copy size={12} />}{" "}
                      Copy iframe
                    </button>
                  </div>
                  <div>
                    <L>Script</L>
                    <textarea
                      readOnly
                      rows={4}
                      value={scriptSnippet}
                      className={`${inp} font-mono text-[10px] leading-relaxed`}
                    />
                    <button
                      type="button"
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"
                      onClick={() => copyText("script", scriptSnippet)}
                    >
                      {copied === "script" ? <Check size={12} /> : <Copy size={12} />}{" "}
                      Copy script
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preview column — fills height, no page scroll */}
        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-navy-900/10 bg-navy-950 p-2.5 shadow-xl shadow-navy-950/20 lg:flex">
          <div className="mb-2 flex shrink-0 items-center justify-between px-1.5">
            <p className="text-[9px] font-bold tracking-[0.16em] text-white/35 uppercase">
              Live preview
            </p>
            <p className="font-mono text-[9px] text-amber-400/70">
              {cfg.publicSlug || "…"}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-white">
            {previewSrc ? (
              <iframe
                ref={iframeRef}
                key={previewKey}
                src={previewSrc}
                title="Booking preview"
                className="h-full w-full border-0"
                onLoad={pushPreview}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Save to preview
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
