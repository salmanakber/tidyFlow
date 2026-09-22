"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react"
import { useParams, useSearchParams } from "next/navigation"
import {
  tidyflowMarketingUrl,
  type BookingFormField,
} from "@/lib/booking-widget"

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Theme = {
  primary: string
  accent: string
  background: string
  text: string
}

type ServiceOption = {
  id: string
  label: string
  durationMinutes: number
}

type PublicConfig = {
  slug: string
  companyName: string
  headline: string
  description: string
  successMessage: string
  logoUrl: string | null
  theme: Theme
  formFields: BookingFormField[]
  serviceOptions: ServiceOption[]
  showCalendar: boolean
}

type MonthDay = { date: string; available: boolean; slotCount: number }
type Slot = { start: string; end: string; label: string }

type Step = "schedule" | "details" | "success"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function dateKey(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`
}

function parseDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number)
  return { y, m, d }
}

function formatLongDate(key: string) {
  const { y, m, d } = parseDateKey(key)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("")
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "").trim()
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16)
    const g = parseInt(h[1] + h[1], 16)
    const b = parseInt(h[2] + h[2], 16)
    return [r, g, b]
  }
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ]
  }
  return null
}

function withAlpha(hex: string, alpha: number) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

function fieldInputType(t: BookingFormField["type"]) {
  if (t === "email") return "email"
  if (t === "tel") return "tel"
  if (t === "number") return "number"
  return "text"
}

/* ─── Subcomponents ─────────────────────────────────────────────────────── */

function TidyFlowMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.12" />
      <path
        d="M8 11.5h16M16 11.5v13"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="8.5" r="1.6" fill="currentColor" />
      <path
        d="M11 22c1.2 2 2.8 3 5 3s3.8-1 5-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-9 w-9 animate-spin rounded-full border-2 border-[var(--bk-primary)]/20 border-t-[var(--bk-primary)] ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}

function StepDots({
  step,
  showCalendar,
  accent,
}: {
  step: Step
  showCalendar: boolean
  accent: string
}) {
  const items = showCalendar
    ? [
        { id: "schedule" as const, label: "Time" },
        { id: "details" as const, label: "Details" },
        { id: "success" as const, label: "Done" },
      ]
    : [
        { id: "details" as const, label: "Details" },
        { id: "success" as const, label: "Done" },
      ]

  const order = items.map((i) => i.id)
  const activeIdx = Math.max(0, order.indexOf(step === "schedule" ? "schedule" : step))

  return (
    <ol className="flex items-center gap-2" aria-label="Booking progress">
      {items.map((item, i) => {
        const done = i < activeIdx
        const active = i === activeIdx
        return (
          <li key={item.id} className="flex items-center gap-2">
            {i > 0 ? (
              <span
                className="hidden h-px w-6 sm:block"
                style={{
                  background: done || active
                    ? accent
                    : withAlpha("#0F172A", 0.12),
                }}
              />
            ) : null}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-all duration-300 ${
                active
                  ? "text-[var(--bk-primary)]"
                  : done
                    ? "text-[var(--bk-accent)]"
                    : "text-[var(--bk-text)]/40"
              }`}
              style={{
                background: active
                  ? withAlpha(accent, 0.14)
                  : done
                    ? withAlpha(accent, 0.08)
                    : "transparent",
              }}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  active || done
                    ? "bg-[var(--bk-primary)] text-white"
                    : "bg-[var(--bk-text)]/10 text-[var(--bk-text)]/50"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              {item.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/* ─── Main page ─────────────────────────────────────────────────────────── */

export default function PublicBookPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = String(params?.slug || "")
  const isEmbed = searchParams.get("embed") === "1"

  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const now = useMemo(() => new Date(), [])
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [monthDays, setMonthDays] = useState<MonthDay[]>([])
  const [monthLoading, setMonthLoading] = useState(false)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  const [duration, setDuration] = useState(120)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [step, setStep] = useState<Step>("schedule")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState("")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  /* Config fetch */
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(`/api/public/book/${encodeURIComponent(slug)}`)
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.message || "Booking page not found")
        }
        if (cancelled) return
        const data = json.data as PublicConfig
        setConfig(data)
        const defaultDur =
          data.serviceOptions?.[0]?.durationMinutes || 120
        setDuration(defaultDur)

        const initial: Record<string, string> = {}
        for (const f of data.formFields || []) {
          initial[f.id] = ""
        }
        setAnswers(initial)

        if (!data.showCalendar) {
          setStep("details")
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Unable to load booking page")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  /* Month availability */
  const fetchMonth = useCallback(
    async (year: number, month: number, dur: number) => {
      if (!slug) return
      setMonthLoading(true)
      try {
        const q = new URLSearchParams({
          mode: "month",
          year: String(year),
          month: String(month),
          duration: String(dur),
        })
        const res = await fetch(
          `/api/public/book/${encodeURIComponent(slug)}?${q}`
        )
        const json = await res.json()
        if (res.ok && json.success) {
          setMonthDays(json.data?.days || [])
        } else {
          setMonthDays([])
        }
      } catch {
        setMonthDays([])
      } finally {
        setMonthLoading(false)
      }
    },
    [slug]
  )

  useEffect(() => {
    if (!config?.showCalendar) return
    fetchMonth(viewYear, viewMonth, duration)
  }, [config, viewYear, viewMonth, duration, fetchMonth])

  /* Day slots */
  useEffect(() => {
    if (!slug || !selectedDate || !config?.showCalendar) return
    let cancelled = false
    ;(async () => {
      setSlotsLoading(true)
      setSelectedSlot(null)
      try {
        const q = new URLSearchParams({
          mode: "slots",
          date: selectedDate,
          duration: String(duration),
        })
        const res = await fetch(
          `/api/public/book/${encodeURIComponent(slug)}?${q}`
        )
        const json = await res.json()
        if (!cancelled && res.ok && json.success) {
          setSlots(json.data?.slots || [])
        } else if (!cancelled) {
          setSlots([])
        }
      } catch {
        if (!cancelled) setSlots([])
      } finally {
        if (!cancelled) setSlotsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, selectedDate, duration, config?.showCalendar])

  /* Calendar grid cells */
  const calendarCells = useMemo(() => {
    const first = new Date(viewYear, viewMonth - 1, 1)
    const startPad = first.getDay()
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate()
    const byDate = new Map(monthDays.map((d) => [d.date, d]))
    const cells: Array<{
      key: string
      day: number | null
      available: boolean
      slotCount: number
      isToday: boolean
    }> = []

    for (let i = 0; i < startPad; i++) {
      cells.push({
        key: `pad-${i}`,
        day: null,
        available: false,
        slotCount: 0,
        isToday: false,
      })
    }

    const todayKey = dateKey(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate()
    )

    for (let d = 1; d <= daysInMonth; d++) {
      const key = dateKey(viewYear, viewMonth, d)
      const info = byDate.get(key)
      cells.push({
        key,
        day: d,
        available: !!info?.available,
        slotCount: info?.slotCount || 0,
        isToday: key === todayKey,
      })
    }
    return cells
  }, [viewYear, viewMonth, monthDays, now])

  const canPrevMonth = useMemo(() => {
    const cur = new Date(now.getFullYear(), now.getMonth(), 1)
    const view = new Date(viewYear, viewMonth - 1, 1)
    return view > cur
  }, [now, viewYear, viewMonth])

  const shiftMonth = (delta: number) => {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    setViewYear(y)
    setViewMonth(m)
    setSelectedDate(null)
    setSlots([])
    setSelectedSlot(null)
  }

  const setAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
    // Sync duration when service select changes
    if (id === "serviceType" && config?.serviceOptions?.length) {
      const match = config.serviceOptions.find(
        (s) => s.label === value || s.id === value
      )
      if (match?.durationMinutes) {
        setDuration(match.durationMinutes)
        setSelectedSlot(null)
      }
    }
  }

  const validateForm = (): string | null => {
    if (!config) return "Not ready"
    if (config.showCalendar && !selectedSlot) {
      return "Please choose a date and time"
    }
    for (const f of config.formFields) {
      const v = (answers[f.id] || "").trim()
      if (f.required && !v) return `${f.label} is required`
      if (f.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return "Please enter a valid email"
      }
    }
    return null
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!config || submitting) return
    const err = validateForm()
    if (err) {
      setSubmitError(err)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload: Record<string, unknown> = {
        ...answers,
        answers,
        name: answers.name || answers.guestName || "",
        email: answers.email || "",
        phone: answers.phone || "",
        address: answers.address || "",
        serviceType: answers.serviceType || "",
        notes: answers.notes || "",
        requestedStart: selectedSlot?.start || null,
        source: isEmbed ? "embed" : "link",
      }
      const res = await fetch(`/api/public/book/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Could not submit booking")
      }
      setSuccessMsg(
        json.data?.message || config.successMessage || "Thanks! We’ll be in touch."
      )
      setStep("success")
    } catch (err: any) {
      setSubmitError(err?.message || "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  /* Loading / error shells */
  if (loading) {
    return (
      <div
        className="bk-root flex min-h-screen items-center justify-center"
        style={{ background: "#F7F4EF" }}
      >
        <div className="flex flex-col items-center gap-3 animate-in fade-in duration-500">
          <Spinner />
          <p className="text-sm text-[#0F172A]/60">Loading booking…</p>
        </div>
      </div>
    )
  }

  if (loadError || !config) {
    return (
      <div
        className="bk-root flex min-h-screen items-center justify-center px-4"
        style={{ background: "#F7F4EF" }}
      >
        <div className="max-w-md rounded-2xl border border-[#0B1F33]/10 bg-white/80 p-8 text-center shadow-sm backdrop-blur">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1F33]/5 text-[#0B1F33]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 8v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="12" cy="16.5" r="1" fill="currentColor" />
            </svg>
          </div>
          <h1 className="font-serif text-2xl font-semibold text-[#0B1F33]">
            Page unavailable
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#0F172A]/65">
            {loadError || "This booking link is offline or doesn’t exist."}
          </p>
        </div>
      </div>
    )
  }

  const theme = config.theme
  const cssVars: CSSProperties = {
    ["--bk-primary" as string]: theme.primary,
    ["--bk-accent" as string]: theme.accent,
    ["--bk-bg" as string]: theme.background,
    ["--bk-text" as string]: theme.text,
  }

  const showHero = !isEmbed
  const continueToDetails = () => {
    if (!selectedSlot) {
      setSubmitError("Please select a time slot")
      return
    }
    setSubmitError(null)
    setStep("details")
  }

  return (
    <div
      className={`bk-root relative min-h-screen overflow-x-hidden text-[var(--bk-text)] transition-opacity duration-500 ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
      style={{
        ...cssVars,
        background: "var(--bk-bg)",
        color: "var(--bk-text)",
      }}
    >
      {/* Atmospheric background */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: withAlpha(theme.primary, 0.08) }}
        />
        <div
          className="absolute -right-16 top-40 h-80 w-80 rounded-full blur-3xl"
          style={{ background: withAlpha(theme.accent, 0.12) }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full blur-3xl"
          style={{ background: withAlpha(theme.primary, 0.05) }}
        />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />
      </div>

      <div
        className={`relative mx-auto w-full ${
          isEmbed ? "max-w-xl px-3 py-3 sm:px-4 sm:py-4" : "max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:py-14"
        }`}
      >
        {/* ── Hero / compact header ── */}
        {showHero ? (
          <header className="mb-8 animate-in fade-in slide-in-from-bottom-3 duration-700">
            <div className="overflow-hidden rounded-[1.75rem] border border-[var(--bk-primary)]/10 shadow-[0_20px_60px_-24px_rgba(11,31,51,0.35)]">
              <div
                className="relative px-6 pb-8 pt-8 sm:px-10 sm:pb-10 sm:pt-10"
                style={{
                  background: `linear-gradient(145deg, ${theme.primary} 0%, ${withAlpha(theme.primary, 0.88)} 55%, ${withAlpha(theme.accent, 0.85)} 140%)`,
                  color: "#fff",
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-30"
                  style={{
                    background:
                      "radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.35), transparent 55%)",
                  }}
                />
                <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-start gap-4">
                    {config.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={config.logoUrl}
                        alt=""
                        className="h-14 w-14 rounded-2xl object-cover shadow-lg ring-2 ring-white/25 sm:h-16 sm:w-16"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold tracking-wide shadow-lg ring-2 ring-white/20 sm:h-16 sm:w-16 sm:text-xl">
                        {initials(config.companyName)}
                      </div>
                    )}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                        {config.companyName}
                      </p>
                      <h1 className="font-serif mt-1.5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                        {config.headline}
                      </h1>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-white/80 sm:text-[15px]">
                        {config.description}
                      </p>
                    </div>
                  </div>
                  {step !== "success" ? (
                    <div className="shrink-0 self-start sm:self-end">
                      <StepDots
                        step={step}
                        showCalendar={config.showCalendar}
                        accent={theme.accent}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>
        ) : (
          <header className="mb-4 flex items-center justify-between gap-3 animate-in fade-in duration-400">
            <div className="flex min-w-0 items-center gap-2.5">
              {config.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={config.logoUrl}
                  alt=""
                  className="h-9 w-9 rounded-xl object-cover ring-1 ring-[var(--bk-primary)]/15"
                />
              ) : (
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white"
                  style={{ background: "var(--bk-primary)" }}
                >
                  {initials(config.companyName)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--bk-text)]/45">
                  {config.companyName}
                </p>
                <h1 className="font-serif truncate text-lg font-semibold leading-tight">
                  {config.headline}
                </h1>
              </div>
            </div>
            {step !== "success" ? (
              <StepDots
                step={step}
                showCalendar={config.showCalendar}
                accent={theme.accent}
              />
            ) : null}
          </header>
        )}

        {/* ── Main card ── */}
        <main
          className={`relative overflow-hidden border border-[var(--bk-primary)]/8 bg-white/75 shadow-[0_12px_40px_-18px_rgba(11,31,51,0.28)] backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-600 ${
            isEmbed ? "rounded-2xl p-4 sm:p-5" : "rounded-[1.5rem] p-5 sm:p-8"
          }`}
        >
          {step === "success" ? (
            <SuccessPanel
              message={successMsg}
              companyName={config.companyName}
              isEmbed={isEmbed}
            />
          ) : null}

          {step === "schedule" && config.showCalendar ? (
            <section className="space-y-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-serif text-xl font-semibold tracking-tight sm:text-2xl">
                    Pick a day
                  </h2>
                  <p className="mt-1 text-sm text-[var(--bk-text)]/55">
                    Available times update as you choose a date.
                  </p>
                </div>
                {config.serviceOptions?.length > 1 ? (
                  <label className="mt-2 flex flex-col gap-1 sm:mt-0 sm:min-w-[200px]">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--bk-text)]/45">
                      Service length
                    </span>
                    <select
                      className="bk-input rounded-xl border border-[var(--bk-primary)]/12 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--bk-accent)] focus:ring-2 focus:ring-[var(--bk-accent)]/25"
                      value={
                        config.serviceOptions.find(
                          (s) => s.durationMinutes === duration
                        )?.label || config.serviceOptions[0]?.label
                      }
                      onChange={(e) => {
                        const match = config.serviceOptions.find(
                          (s) => s.label === e.target.value
                        )
                        if (match) {
                          setDuration(match.durationMinutes)
                          setAnswer("serviceType", match.label)
                        }
                      }}
                    >
                      {config.serviceOptions.map((s) => (
                        <option key={s.id} value={s.label}>
                          {s.label} · {s.durationMinutes} min
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              {/* Month nav */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={!canPrevMonth}
                  onClick={() => shiftMonth(-1)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--bk-primary)]/10 bg-white text-[var(--bk-primary)] transition hover:bg-[var(--bk-primary)]/5 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Previous month"
                >
                  <ChevronLeft />
                </button>
                <h3 className="font-serif text-base font-semibold sm:text-lg">
                  {MONTHS[viewMonth - 1]} {viewYear}
                </h3>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--bk-primary)]/10 bg-white text-[var(--bk-primary)] transition hover:bg-[var(--bk-primary)]/5"
                  aria-label="Next month"
                >
                  <ChevronRight />
                </button>
              </div>

              <div className="relative">
                {monthLoading ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-[2px]">
                    <Spinner className="h-8 w-8" />
                  </div>
                ) : null}

                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {WEEKDAYS.map((d) => (
                    <div
                      key={d}
                      className="pb-1 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--bk-text)]/40 sm:text-[11px]"
                    >
                      {d}
                    </div>
                  ))}
                  {calendarCells.map((cell) => {
                    if (cell.day === null) {
                      return <div key={cell.key} className="aspect-square" />
                    }
                    const selected = selectedDate === cell.key
                    const disabled = !cell.available
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSelectedDate(cell.key)
                          setSubmitError(null)
                        }}
                        className={`group relative aspect-square rounded-xl text-sm font-semibold transition-all duration-200 sm:rounded-2xl sm:text-[15px] ${
                          selected
                            ? "scale-[1.04] text-white shadow-md"
                            : disabled
                              ? "cursor-not-allowed text-[var(--bk-text)]/25"
                              : "hover:-translate-y-0.5 hover:shadow-sm"
                        }`}
                        style={
                          selected
                            ? { background: "var(--bk-primary)" }
                            : disabled
                              ? { background: withAlpha(theme.text, 0.03) }
                              : {
                                  background: withAlpha(theme.accent, 0.12),
                                  color: "var(--bk-primary)",
                                }
                        }
                        aria-pressed={selected}
                        aria-label={`${cell.key}${cell.available ? `, ${cell.slotCount} slots` : ", unavailable"}`}
                      >
                        <span className="relative z-10">{cell.day}</span>
                        {cell.isToday && !selected ? (
                          <span
                            className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full sm:bottom-1.5"
                            style={{ background: "var(--bk-accent)" }}
                          />
                        ) : null}
                        {cell.available && !selected ? (
                          <span
                            className="absolute right-1 top-1 hidden h-1.5 w-1.5 rounded-full opacity-70 sm:block"
                            style={{ background: "var(--bk-accent)" }}
                          />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Slots */}
              <div className="pt-1">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h2 className="font-serif text-lg font-semibold sm:text-xl">
                    {selectedDate
                      ? formatLongDate(selectedDate)
                      : "Choose a time"}
                  </h2>
                  {selectedDate && !slotsLoading ? (
                    <span className="text-xs text-[var(--bk-text)]/45">
                      {slots.length} open
                    </span>
                  ) : null}
                </div>

                {!selectedDate ? (
                  <p className="rounded-2xl border border-dashed border-[var(--bk-primary)]/15 bg-[var(--bk-primary)]/[0.02] px-4 py-8 text-center text-sm text-[var(--bk-text)]/50">
                    Select an available day on the calendar.
                  </p>
                ) : slotsLoading ? (
                  <div className="flex justify-center py-10">
                    <Spinner />
                  </div>
                ) : slots.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[var(--bk-primary)]/15 bg-[var(--bk-primary)]/[0.02] px-4 py-8 text-center text-sm text-[var(--bk-text)]/50">
                    No open times this day — try another date.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {slots.map((slot) => {
                      const on = selectedSlot?.start === slot.start
                      return (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => {
                            setSelectedSlot(slot)
                            setSubmitError(null)
                          }}
                          className={`rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-200 ${
                            on
                              ? "scale-[1.02] text-white shadow-md"
                              : "border border-[var(--bk-primary)]/10 bg-white hover:border-[var(--bk-accent)]/50 hover:bg-[var(--bk-accent)]/5"
                          }`}
                          style={on ? { background: "var(--bk-accent)" } : undefined}
                          aria-pressed={on}
                        >
                          {slot.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {submitError ? (
                <p className="text-sm font-medium text-red-600" role="alert">
                  {submitError}
                </p>
              ) : null}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={continueToDetails}
                  disabled={!selectedSlot}
                  className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold text-white shadow-lg transition enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: "var(--bk-primary)",
                    boxShadow: `0 12px 28px -10px ${withAlpha(theme.primary, 0.55)}`,
                  }}
                >
                  Continue
                  <ArrowRight />
                </button>
              </div>
            </section>
          ) : null}

          {step === "details" ? (
            <section className="animate-in fade-in slide-in-from-right-2 duration-400">
              {config.showCalendar && selectedSlot && selectedDate ? (
                <button
                  type="button"
                  onClick={() => {
                    setStep("schedule")
                    setSubmitError(null)
                  }}
                  className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--bk-primary)]/70 transition hover:text-[var(--bk-primary)]"
                >
                  <ChevronLeft />
                  Change time
                  <span className="ml-1 font-normal text-[var(--bk-text)]/45">
                    · {formatLongDate(selectedDate)} at {selectedSlot.label}
                  </span>
                </button>
              ) : null}

              <div className="mb-6">
                <h2 className="font-serif text-xl font-semibold tracking-tight sm:text-2xl">
                  Your details
                </h2>
                <p className="mt-1 text-sm text-[var(--bk-text)]/55">
                  We’ll use this to confirm your booking.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {config.formFields.map((field) => (
                  <FieldControl
                    key={field.id}
                    field={field}
                    value={answers[field.id] || ""}
                    onChange={(v) => setAnswer(field.id, v)}
                    serviceOptions={
                      field.id === "serviceType" ? config.serviceOptions : undefined
                    }
                  />
                ))}

                {submitError ? (
                  <p className="text-sm font-medium text-red-600" role="alert">
                    {submitError}
                  </p>
                ) : null}

                <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-between">
                  {config.showCalendar ? (
                    <button
                      type="button"
                      onClick={() => setStep("schedule")}
                      className="rounded-2xl border border-[var(--bk-primary)]/12 px-5 py-3 text-sm font-semibold text-[var(--bk-primary)] transition hover:bg-[var(--bk-primary)]/5"
                    >
                      Back
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-sm font-bold text-white shadow-lg transition enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:opacity-60"
                    style={{
                      background: "var(--bk-primary)",
                      boxShadow: `0 12px 28px -10px ${withAlpha(theme.primary, 0.55)}`,
                    }}
                  >
                    {submitting ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Request booking
                        <ArrowRight />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>
          ) : null}
        </main>

        {/* Footer */}
        <footer
          className={`flex items-center justify-center gap-2 text-[var(--bk-text)]/45 ${
            isEmbed ? "mt-4 pb-1" : "mt-8 pb-2"
          }`}
        >
          <a
            href={tidyflowMarketingUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition hover:bg-[var(--bk-primary)]/5 hover:text-[var(--bk-primary)]"
          >
            <span className="text-[var(--bk-primary)]/70 transition group-hover:text-[var(--bk-primary)]">
              <TidyFlowMark size={isEmbed ? 16 : 18} />
            </span>
            Powered by TidyFlow
          </a>
        </footer>
      </div>

      <style jsx global>{`
        @keyframes bk-fade-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-in {
          animation: bk-fade-up 0.55s ease both;
        }
        .fade-in {
          animation-name: bk-fade-up;
        }
        .slide-in-from-bottom-2 {
          --tw-enter-translate-y: 0.5rem;
        }
        .slide-in-from-bottom-3 {
          --tw-enter-translate-y: 0.75rem;
        }
        .slide-in-from-right-2 {
          animation-name: bk-slide-right;
        }
        @keyframes bk-slide-right {
          from {
            opacity: 0;
            transform: translateX(12px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .duration-400 {
          animation-duration: 0.4s;
        }
        .duration-500 {
          animation-duration: 0.5s;
        }
        .duration-600 {
          animation-duration: 0.6s;
        }
        .duration-700 {
          animation-duration: 0.7s;
        }
        .bk-root .bk-input:focus {
          outline: none;
        }
      `}</style>
    </div>
  )
}

/* ─── Field control ─────────────────────────────────────────────────────── */

function FieldControl({
  field,
  value,
  onChange,
  serviceOptions,
}: {
  field: BookingFormField
  value: string
  onChange: (v: string) => void
  serviceOptions?: ServiceOption[]
}) {
  const baseCls =
    "w-full rounded-xl border border-[var(--bk-primary)]/12 bg-white px-3.5 py-3 text-sm text-[var(--bk-text)] outline-none transition placeholder:text-[var(--bk-text)]/35 focus:border-[var(--bk-accent)] focus:ring-2 focus:ring-[var(--bk-accent)]/25"

  const options =
    field.type === "select"
      ? field.options?.length
        ? field.options
        : serviceOptions?.map((s) => s.label) || []
      : []

  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-1 text-[13px] font-semibold text-[var(--bk-text)]/80">
        {field.label}
        {field.required ? (
          <span className="text-[var(--bk-accent)]" aria-hidden>
            *
          </span>
        ) : (
          <span className="text-[11px] font-normal text-[var(--bk-text)]/35">
            optional
          </span>
        )}
      </span>
      {field.type === "textarea" ? (
        <textarea
          className={`${baseCls} min-h-[96px] resize-y`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          rows={3}
        />
      ) : field.type === "select" ? (
        <select
          className={baseCls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={fieldInputType(field.type)}
          className={baseCls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          autoComplete={
            field.id === "email"
              ? "email"
              : field.id === "name"
                ? "name"
                : field.id === "phone"
                  ? "tel"
                  : field.id === "address"
                    ? "street-address"
                    : undefined
          }
        />
      )}
    </label>
  )
}

/* ─── Success ───────────────────────────────────────────────────────────── */

function SuccessPanel({
  message,
  companyName,
  isEmbed,
}: {
  message: string
  companyName: string
  isEmbed: boolean
}) {
  return (
    <div
      className={`flex flex-col items-center text-center animate-in fade-in duration-600 ${
        isEmbed ? "py-6" : "py-10 sm:py-14"
      }`}
    >
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg"
        style={{
          background: "var(--bk-accent)",
          boxShadow: "0 14px 30px -12px var(--bk-accent)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
        You’re booked in
      </h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--bk-text)]/65 sm:text-[15px]">
        {message}
      </p>
      <p className="mt-6 text-xs font-medium uppercase tracking-[0.16em] text-[var(--bk-text)]/40">
        {companyName}
      </p>
    </div>
  )
}

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 18l6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
