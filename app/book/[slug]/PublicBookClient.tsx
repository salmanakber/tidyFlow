"use client"

/**
 * Public booking — link + embed share this surface.
 * High-class editorial layout: brand plane + booking atelier.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react"
import { useParams, useSearchParams } from "next/navigation"
import {
  tidyflowMarketingUrl,
  BOOKING_RECURRING_OPTIONS,
  type BookingFormField,
} from "@/lib/booking-widget"

type Theme = {
  primary: string
  accent: string
  background: string
  text: string
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
  serviceOptions: Array<{ id: string; label: string; durationMinutes: number }>
  showCalendar: boolean
  showRecurringOption?: boolean
  recurringOptions?: typeof BOOKING_RECURRING_OPTIONS
}

type DayInfo = { date: string; available: boolean; slotCount: number }
type Slot = { start: string; end: string; label: string }

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "").trim()
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ]
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

function rgba(hex: string, a: number) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`
}

function TidyFlowWordmark({ ink }: { ink: string }) {
  return (
    <a
      href={tidyflowMarketingUrl()}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-2.5 rounded-full border px-3.5 py-2 transition hover:-translate-y-0.5"
      style={{
        borderColor: rgba(ink, 0.12),
        background: rgba("#ffffff", 0.78),
        boxShadow: `0 8px 30px ${rgba(ink, 0.06)}`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/logot-transparent.png"
        alt="TidyFlow"
        width={28}
        height={28}
        className="h-7 w-7 object-contain"
      />
      <span className="text-[11px] tracking-[0.04em]" style={{ color: rgba(ink, 0.55) }}>
        Powered by{" "}
        <strong className="font-semibold" style={{ color: ink }}>
          TidyFlow
        </strong>
      </span>
    </a>
  )
}

export default function PublicBookPage() {
  const params = useParams()
  const search = useSearchParams()
  const slug = typeof params?.slug === "string" ? params.slug : ""
  const isEmbed = search.get("embed") === "1"

  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState(() => {
    const n = new Date()
    return { year: n.getFullYear(), month: n.getMonth() + 1 }
  })
  const [days, setDays] = useState<DayInfo[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [wantsRecurring, setWantsRecurring] = useState(false)
  const [recurringPattern, setRecurringPattern] = useState<
    "weekly" | "biweekly" | "monthly"
  >("weekly")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [trackUrl, setTrackUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<"when" | "details">("when")
  const [ready, setReady] = useState(false)
  const [previewOverride, setPreviewOverride] = useState<{
    primaryColor?: string
    accentColor?: string
    backgroundColor?: string
    textColor?: string
    headline?: string
    description?: string
    logoUrl?: string | null
  } | null>(null)

  const duration = useMemo(() => {
    const svc = answers.serviceType
    const match = config?.serviceOptions.find(
      (s) => s.label === svc || s.id === svc
    )
    return match?.durationMinutes || 120
  }, [answers.serviceType, config?.serviceOptions])

  useEffect(() => {
    const t = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Live preview from Booking studio (postMessage) — colors/copy without save
  useEffect(() => {
    if (!isEmbed) return
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const data = e.data
      if (!data || data.type !== "tidyflow-booking-preview") return
      setPreviewOverride({
        primaryColor: data.primaryColor,
        accentColor: data.accentColor,
        backgroundColor: data.backgroundColor,
        textColor: data.textColor,
        headline: data.headline,
        description: data.description,
        logoUrl: data.logoUrl,
      })
    }
    window.addEventListener("message", onMsg)
    // Tell parent we're ready to receive theme
    try {
      window.parent?.postMessage({ type: "tidyflow-booking-ready" }, window.location.origin)
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("message", onMsg)
  }, [isEmbed])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/public/book/${encodeURIComponent(slug)}`)
        const json = await res.json()
        if (!res.ok || !json?.success) {
          setError(json?.message || "Booking unavailable")
          return
        }
        if (cancelled) return
        setConfig(json.data)
        const svc = json.data.serviceOptions?.[0]?.label
        if (svc) setAnswers((a) => ({ ...a, serviceType: a.serviceType || svc }))
        if (!json.data.showCalendar) setPhase("details")
      } catch {
        if (!cancelled) setError("Could not load booking page")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  useEffect(() => {
    if (!slug || !config?.showCalendar) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/public/book/${encodeURIComponent(slug)}?mode=month&year=${month.year}&month=${month.month}&duration=${duration}`
        )
        const json = await res.json()
        if (!cancelled && json?.success) setDays(json.data.days || [])
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, config?.showCalendar, month, duration])

  useEffect(() => {
    // Changing the day clears the chosen time; changing service duration must NOT
    setSelectedSlot(null)
  }, [selectedDate])

  useEffect(() => {
    if (!selectedDate || !slug) {
      setSlots([])
      return
    }
    let cancelled = false
    ;(async () => {
      setSlotsLoading(true)
      try {
        const res = await fetch(
          `/api/public/book/${encodeURIComponent(slug)}?mode=slots&date=${selectedDate}&duration=${duration}`
        )
        const json = await res.json()
        if (!cancelled && json?.success) {
          const next: Slot[] = json.data.slots || []
          setSlots(next)
          // Keep prior time if still offered; otherwise keep it so submit stays enabled
          // after the guest changes service on the details step.
          setSelectedSlot((prev) => {
            if (!prev) return null
            const match = next.find((s) => s.start === prev.start)
            return match || prev
          })
        }
      } finally {
        if (!cancelled) setSlotsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedDate, slug, duration])

  const monthLabel = useMemo(
    () =>
      new Date(month.year, month.month - 1, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [month]
  )

  const calendarCells = useMemo(() => {
    const firstDow = new Date(month.year, month.month - 1, 1).getDay()
    const dim = new Date(month.year, month.month, 0).getDate()
    const cells: Array<DayInfo | null> = []
    for (let i = 0; i < firstDow; i++) cells.push(null)
    for (let d = 1; d <= dim; d++) {
      const key = `${month.year}-${pad(month.month)}-${pad(d)}`
      cells.push(
        days.find((x) => x.date === key) || {
          date: key,
          available: false,
          slotCount: 0,
        }
      )
    }
    return cells
  }, [month, days])

  async function submit() {
    if (!config || (!selectedSlot && config.showCalendar)) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/public/book/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...answers,
          requestedStart:
            selectedSlot?.start || new Date().toISOString(),
          source: isEmbed ? "embed" : "link",
          answers: {
            ...answers,
            ...(config.showRecurringOption
              ? {
                  wantsRecurring,
                  recurringRequested: wantsRecurring,
                  recurringPattern: wantsRecurring
                    ? recurringPattern
                    : undefined,
                }
              : {}),
          },
          wantsRecurring: !!config.showRecurringOption && wantsRecurring,
          recurringPattern:
            config.showRecurringOption && wantsRecurring
              ? recurringPattern
              : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        setError(json?.message || "Could not submit booking")
        return
      }
      setDone(json.data?.message || config.successMessage)
      if (json.data?.trackUrl) setTrackUrl(json.data.trackUrl)
      else if (json.data?.trackToken)
        setTrackUrl(`/book/track/${json.data.trackToken}`)
    } catch {
      setError("Network error — please try again")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a1520]">
        <div className="h-11 w-11 animate-spin rounded-full border-2 border-white/15 border-t-[#c4a574]" />
      </div>
    )
  }

  if ((error && !config) || !config) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a1520] px-6 text-center">
        <p className="font-[family-name:var(--bk-display)] text-2xl text-white">
          {error || "Booking unavailable"}
        </p>
        <TidyFlowWordmark ink="#c4a574" />
      </div>
    )
  }

  const liveTheme = {
    primary: previewOverride?.primaryColor || config.theme.primary,
    accent: previewOverride?.accentColor || config.theme.accent,
    background: previewOverride?.backgroundColor || config.theme.background,
    text: previewOverride?.textColor || config.theme.text,
  }
  const liveHeadline = previewOverride?.headline ?? config.headline
  const liveDescription = previewOverride?.description ?? config.description
  const liveLogo =
    previewOverride?.logoUrl !== undefined
      ? previewOverride.logoUrl
      : config.logoUrl

  const theme = liveTheme

  const cssVars = {
    ["--bk-primary" as string]: theme.primary,
    ["--bk-accent" as string]: theme.accent,
    ["--bk-bg" as string]: theme.background,
    ["--bk-text" as string]: theme.text,
    ["--bk-display" as string]: '"Cormorant Garamond", Georgia, serif',
    ["--bk-body" as string]: '"Outfit", system-ui, sans-serif',
  } as CSSProperties

  const selectionLabel = selectedSlot
    ? new Date(selectedSlot.start).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : selectedDate
      ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : null

  return (
    <div
      style={cssVars}
      className={`bk-atelier ${ready ? "bk-ready" : ""} ${
        isEmbed ? "" : "lg:grid lg:min-h-screen lg:grid-cols-[minmax(300px,42vw)_minmax(0,1fr)]"
      }`}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Outfit:wght@300;400;500;600;700&display=swap');
        .bk-atelier {
          min-height: 100vh;
          font-family: var(--bk-body);
          color: var(--bk-text);
          background:
            radial-gradient(1200px 600px at 10% -10%, ${rgba(theme.accent, 0.18)}, transparent 55%),
            radial-gradient(900px 500px at 100% 0%, ${rgba(theme.primary, 0.35)}, transparent 50%),
            linear-gradient(165deg, ${theme.background} 0%, #ffffff 48%, ${rgba(theme.primary, 0.04)} 100%);
        }
        .bk-atelier.bk-ready .bk-rise {
          animation: bkRise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .bk-atelier.bk-ready .bk-rise-2 { animation-delay: 0.1s; }
        .bk-atelier.bk-ready .bk-rise-3 { animation-delay: 0.18s; }
        .bk-atelier.bk-ready .bk-rise-4 { animation-delay: 0.26s; }
        @keyframes bkRise {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: none; }
        }
        .bk-display { font-family: var(--bk-display); font-weight: 600; letter-spacing: -0.02em; }
        .bk-panel {
          background: rgba(255,255,255,0.78);
          backdrop-filter: blur(18px);
          border: 1px solid ${rgba(theme.primary, 0.08)};
          box-shadow:
            0 1px 0 ${rgba("#fff", 0.7)} inset,
            0 24px 60px ${rgba(theme.primary, 0.08)};
        }
        .bk-input {
          width: 100%;
          border-radius: 14px;
          border: 1px solid ${rgba(theme.primary, 0.1)};
          background: rgba(255,255,255,0.92);
          padding: 0.85rem 1rem;
          font-size: 0.9375rem;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .bk-input:focus {
          outline: none;
          border-color: ${theme.accent};
          box-shadow: 0 0 0 3px ${rgba(theme.accent, 0.18)};
        }
        .bk-cta {
          background: linear-gradient(135deg, ${theme.primary}, ${rgba(theme.primary, 0.85)});
          color: #fff;
          border-radius: 14px;
          font-weight: 600;
          letter-spacing: 0.02em;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 12px 28px ${rgba(theme.primary, 0.28)};
        }
        .bk-cta:hover:not(:disabled) { transform: translateY(-1px); }
        .bk-cta:disabled { opacity: 0.5; }
        .bk-day {
          aspect-ratio: 1;
          border-radius: 14px;
          font-size: 0.875rem;
          font-weight: 500;
          transition: transform 0.15s, background 0.15s;
        }
        .bk-day-avail {
          background: ${rgba(theme.accent, 0.12)};
          color: var(--bk-text);
        }
        .bk-day-avail:hover { transform: scale(1.05); background: ${rgba(theme.accent, 0.22)}; }
        .bk-day-sel {
          background: ${theme.primary};
          color: #fff;
          box-shadow: 0 8px 20px ${rgba(theme.primary, 0.35)};
        }
        .bk-slot {
          border-radius: 999px;
          border: 1px solid ${rgba(theme.primary, 0.12)};
          padding: 0.55rem 1rem;
          font-size: 0.8125rem;
          font-weight: 600;
          background: #fff;
          transition: all 0.15s;
        }
        .bk-slot-sel {
          background: ${theme.accent};
          border-color: transparent;
          color: #fff;
          box-shadow: 0 8px 18px ${rgba(theme.accent, 0.35)};
        }
        .bk-brand-plane {
          background:
            linear-gradient(145deg, ${theme.primary} 0%, ${rgba(theme.primary, 0.88)} 55%, ${rgba(theme.accent, 0.55)} 140%);
        }
        .bk-grain {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E");
        }
      `}</style>

        {/* Brand plane — full-bleed left, sticky, no outer gap */}
        {!isEmbed && (
          <aside className="bk-brand-plane bk-rise relative hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:overflow-hidden lg:p-12 xl:p-16">
            <div className="bk-grain pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay" />
            <div
              className="pointer-events-none absolute -right-16 top-16 h-80 w-80 rounded-full blur-3xl"
              style={{ background: rgba("#fff", 0.1) }}
            />
            <div
              className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full blur-3xl"
              style={{ background: rgba(theme.accent, 0.25) }}
            />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/8 px-3 py-2.5 backdrop-blur-md">
                {liveLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={liveLogo}
                    alt=""
                    className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/25"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-lg font-semibold text-white ring-1 ring-white/20">
                    {config.companyName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.22em] text-white/55 uppercase">
                    Book with
                  </p>
                  <p className="text-sm font-semibold tracking-wide text-white">
                    {config.companyName}
                  </p>
                </div>
              </div>

              <h1 className="bk-display mt-16 max-w-lg text-[3.25rem] leading-[1.02] text-white xl:text-[3.75rem]">
                {liveHeadline}
              </h1>
              <p
                className="mt-6 max-w-md text-[15px] leading-relaxed"
                style={{ color: rgba("#ffffff", 0.72) }}
              >
                {liveDescription}
              </p>

              <div className="mt-10 flex flex-col gap-3">
                {[
                  "Pick a time that works for you",
                  "Your request goes straight to the team",
                  "We’ll confirm shortly",
                ].map((line) => (
                  <div key={line} className="flex items-center gap-3 text-sm text-white/70">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{ background: rgba("#fff", 0.12) }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 13l4 4L19 7"
                          stroke="#fff"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10">
              <a
                href={tidyflowMarketingUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-white/8 px-3.5 py-2 text-xs text-white/60 backdrop-blur transition hover:bg-white/12 hover:text-white/85"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/logot-transparent.png"
                  alt=""
                  className="h-5 w-5 rounded object-contain"
                />
                Powered by TidyFlow · tidyflowapp.com
              </a>
            </div>
          </aside>
        )}

        {/* Booking atelier */}
        <main
          className={`relative flex flex-col ${
            isEmbed
              ? "px-3 py-4 sm:px-5"
              : "min-h-screen px-4 py-8 sm:px-8 lg:px-12 lg:py-12 xl:px-16"
          }`}
        >
          {isEmbed && (
            <header className="bk-rise mb-6">
              <div className="flex items-center gap-3">
                {liveLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={liveLogo}
                    alt=""
                    className="h-11 w-11 rounded-xl object-cover"
                  />
                ) : null}
                <div>
                  <p
                    className="text-[10px] font-semibold tracking-[0.2em] uppercase"
                    style={{ color: rgba(theme.text, 0.45) }}
                  >
                    {config.companyName}
                  </p>
                  <h1 className="bk-display text-3xl leading-tight sm:text-4xl">
                    {liveHeadline}
                  </h1>
                </div>
              </div>
              <p className="mt-2 max-w-lg text-sm leading-relaxed" style={{ color: theme.text, opacity: 0.72 }}>
                {liveDescription}
              </p>
            </header>
          )}

          {!isEmbed && (
            <div className="bk-rise mb-6 lg:hidden">
              <p
                className="text-[10px] font-semibold tracking-[0.2em] uppercase"
                style={{ color: rgba(theme.text, 0.45) }}
              >
                {config.companyName}
              </p>
              <h1 className="bk-display mt-1 text-4xl leading-tight" style={{ color: theme.text }}>
                {liveHeadline}
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed" style={{ color: theme.text, opacity: 0.7 }}>
                {liveDescription}
              </p>
            </div>
          )}

          {done ? (
            <section className="bk-panel bk-rise-2 rounded-[28px] px-8 py-14 text-center sm:px-12">
              <div
                className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ background: rgba(theme.accent, 0.15) }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 13l4 4L19 7"
                    stroke={theme.accent}
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h2 className="bk-display text-3xl sm:text-4xl">You're on the list</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed opacity-65">
                {done}
              </p>
              {trackUrl && (
                <a
                  href={trackUrl}
                  className="bk-cta mt-6 inline-block px-8 py-3 text-sm"
                >
                  Track your booking
                </a>
              )}
            </section>
          ) : (
            <section className="bk-panel bk-rise-2 rounded-[28px] p-5 sm:p-8">
              {/* Progress */}
              {config.showCalendar && (
                <div className="mb-7 flex items-center gap-2">
                  {(
                    [
                      ["when", "Schedule"],
                      ["details", "Your details"],
                    ] as const
                  ).map(([id, label], i) => {
                    const active = phase === id
                    const doneStep = phase === "details" && id === "when"
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          if (id === "details" && !selectedSlot) return
                          setPhase(id)
                        }}
                        className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                        style={{
                          background: active
                            ? theme.primary
                            : doneStep
                              ? rgba(theme.accent, 0.15)
                              : rgba(theme.primary, 0.05),
                          color: active
                            ? "#fff"
                            : doneStep
                              ? theme.accent
                              : rgba(theme.text, 0.45),
                        }}
                      >
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
                          style={{
                            background: active
                              ? rgba("#fff", 0.2)
                              : rgba(theme.primary, 0.08),
                          }}
                        >
                          {doneStep ? "✓" : i + 1}
                        </span>
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}

              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {phase === "when" && config.showCalendar && (
                <div className="space-y-7">
                  <p className="text-sm leading-relaxed" style={{ color: theme.text, opacity: 0.72 }}>
                    {liveDescription}
                  </p>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p
                        className="text-[10px] font-semibold tracking-[0.18em] uppercase"
                        style={{ color: rgba(theme.text, 0.4) }}
                      >
                        Select a day
                      </p>
                      <h2 className="bk-display mt-1 text-2xl sm:text-3xl" style={{ color: theme.text }}>
                        {monthLabel}
                      </h2>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded-xl px-3 py-2 text-lg opacity-60 hover:bg-black/5 hover:opacity-100"
                        onClick={() =>
                          setMonth((m) => {
                            const d = new Date(m.year, m.month - 2, 1)
                            return {
                              year: d.getFullYear(),
                              month: d.getMonth() + 1,
                            }
                          })
                        }
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="rounded-xl px-3 py-2 text-lg opacity-60 hover:bg-black/5 hover:opacity-100"
                        onClick={() =>
                          setMonth((m) => {
                            const d = new Date(m.year, m.month, 1)
                            return {
                              year: d.getFullYear(),
                              month: d.getMonth() + 1,
                            }
                          })
                        }
                      >
                        ›
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold tracking-wider uppercase opacity-35">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                      <div key={`${d}-${i}`}>{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {calendarCells.map((cell, i) =>
                      !cell ? (
                        <div key={`e-${i}`} />
                      ) : (
                        <button
                          key={cell.date}
                          type="button"
                          disabled={!cell.available}
                          onClick={() => setSelectedDate(cell.date)}
                          className={`bk-day ${
                            selectedDate === cell.date
                              ? "bk-day-sel"
                              : cell.available
                                ? "bk-day-avail"
                                : "opacity-20"
                          }`}
                        >
                          {Number(cell.date.slice(-2))}
                        </button>
                      )
                    )}
                  </div>

                  {selectedDate && (
                    <div className="bk-rise-3 border-t pt-6" style={{ borderColor: rgba(theme.primary, 0.08) }}>
                      <p
                        className="mb-3 text-[10px] font-semibold tracking-[0.18em] uppercase"
                        style={{ color: rgba(theme.text, 0.4) }}
                      >
                        Available times
                      </p>
                      {slotsLoading ? (
                        <p className="text-sm opacity-40">Finding openings…</p>
                      ) : slots.length === 0 ? (
                        <p className="text-sm opacity-40">
                          No openings this day — try another.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {slots.map((s) => (
                            <button
                              key={s.start}
                              type="button"
                              onClick={() => setSelectedSlot(s)}
                              className={`bk-slot ${
                                selectedSlot?.start === s.start ? "bk-slot-sel" : ""
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedSlot && (
                        <button
                          type="button"
                          className="bk-cta mt-7 w-full py-3.5 text-sm sm:w-auto sm:px-10"
                          onClick={() => setPhase("details")}
                        >
                          Continue with {selectionLabel}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {phase === "details" && (
                <div className="space-y-5">
                  {selectionLabel && (
                    <div
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3"
                      style={{ background: rgba(theme.primary, 0.04) }}
                    >
                      <p className="text-sm">
                        <span className="opacity-45">Appointment · </span>
                        <strong>{selectionLabel}</strong>
                      </p>
                      {config.showCalendar && (
                        <button
                          type="button"
                          className="text-xs font-semibold underline-offset-2 hover:underline"
                          style={{ color: theme.accent }}
                          onClick={() => setPhase("when")}
                        >
                          Change
                        </button>
                      )}
                    </div>
                  )}

                  {config.formFields.map((field, idx) => {
                    const isChoice =
                      field.type === "select" ||
                      field.type === "dropdown" ||
                      field.type === "radio"
                    const isPlan = field.type === "plan" || field.id === "serviceType"
                    const choiceOpts =
                      field.options && field.options.length > 0
                        ? field.options
                        : isPlan
                          ? config.serviceOptions.map((s) => s.label)
                          : []

                    return (
                      <div
                        key={field.id}
                        className={`bk-rise-${Math.min(idx + 2, 4)} block`}
                      >
                        <span
                          className="mb-1.5 block text-[10px] font-semibold tracking-[0.16em] uppercase"
                          style={{ color: rgba(theme.text, 0.42) }}
                        >
                          {field.label}
                          {field.required ? " *" : ""}
                        </span>
                        {field.helpText ? (
                          <p
                            className="mb-2 text-xs"
                            style={{ color: theme.text, opacity: 0.55 }}
                          >
                            {field.helpText}
                          </p>
                        ) : null}

                        {field.type === "textarea" ? (
                          <textarea
                            className="bk-input"
                            rows={3}
                            placeholder={field.placeholder}
                            required={field.required}
                            value={answers[field.id] || ""}
                            onChange={(e) =>
                              setAnswers((a) => ({
                                ...a,
                                [field.id]: e.target.value,
                              }))
                            }
                          />
                        ) : field.type === "checkbox" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setAnswers((a) => ({
                                ...a,
                                [field.id]:
                                  a[field.id] === "yes" || a[field.id] === "true"
                                    ? "no"
                                    : "yes",
                              }))
                            }
                            className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition"
                            style={{
                              borderColor:
                                answers[field.id] === "yes" ||
                                answers[field.id] === "true"
                                  ? theme.accent
                                  : rgba(theme.primary, 0.12),
                              background:
                                answers[field.id] === "yes" ||
                                answers[field.id] === "true"
                                  ? rgba(theme.accent, 0.1)
                                  : "#fff",
                            }}
                          >
                            {field.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={field.imageUrl}
                                alt=""
                                className="h-12 w-12 rounded-xl object-cover"
                              />
                            ) : (
                              <span
                                className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
                                style={{ background: rgba(theme.primary, 0.08) }}
                              >
                                {field.icon === "check" || !field.icon ? "✓" : field.icon.slice(0, 2)}
                              </span>
                            )}
                            <span className="flex-1 text-sm font-semibold" style={{ color: theme.text }}>
                              {field.placeholder || field.label}
                            </span>
                            <span
                              className="flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold"
                              style={{
                                borderColor: theme.accent,
                                background:
                                  answers[field.id] === "yes" ||
                                  answers[field.id] === "true"
                                    ? theme.accent
                                    : "transparent",
                                color:
                                  answers[field.id] === "yes" ||
                                  answers[field.id] === "true"
                                    ? "#fff"
                                    : theme.accent,
                              }}
                            >
                              {(answers[field.id] === "yes" ||
                                answers[field.id] === "true") &&
                                "✓"}
                            </span>
                          </button>
                        ) : isPlan ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {config.serviceOptions.map((s) => {
                              const selected =
                                answers[field.id] === s.label ||
                                answers[field.id] === s.id
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() =>
                                    setAnswers((a) => ({
                                      ...a,
                                      [field.id]: s.label,
                                      serviceType: s.label,
                                    }))
                                  }
                                  className="rounded-2xl border px-4 py-3 text-left transition"
                                  style={{
                                    borderColor: selected
                                      ? theme.accent
                                      : rgba(theme.primary, 0.1),
                                    background: selected
                                      ? rgba(theme.accent, 0.1)
                                      : "#fff",
                                    boxShadow: selected
                                      ? `0 8px 20px ${rgba(theme.accent, 0.18)}`
                                      : undefined,
                                  }}
                                >
                                  <div className="flex items-start gap-3">
                                    {s.imageUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={s.imageUrl}
                                        alt=""
                                        className="h-11 w-11 rounded-xl object-cover"
                                      />
                                    ) : (
                                      <span
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                                        style={{
                                          background: rgba(theme.primary, 0.08),
                                          color: theme.primary,
                                        }}
                                      >
                                        {(s.icon || s.label).slice(0, 1).toUpperCase()}
                                      </span>
                                    )}
                                    <div className="min-w-0">
                                      <p
                                        className="text-sm font-bold"
                                        style={{ color: theme.text }}
                                      >
                                        {s.label}
                                      </p>
                                      <p
                                        className="mt-0.5 text-[11px]"
                                        style={{ color: theme.text, opacity: 0.5 }}
                                      >
                                        ~{s.durationMinutes} min
                                        {s.description ? ` · ${s.description}` : ""}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        ) : field.type === "radio" ? (
                          <div className="flex flex-wrap gap-2">
                            {choiceOpts.map((opt) => {
                              const selected = answers[field.id] === opt
                              const icon = field.optionIcons?.[opt]
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() =>
                                    setAnswers((a) => ({ ...a, [field.id]: opt }))
                                  }
                                  className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition"
                                  style={{
                                    borderColor: selected
                                      ? theme.accent
                                      : rgba(theme.primary, 0.12),
                                    background: selected
                                      ? theme.accent
                                      : "#fff",
                                    color: selected ? "#fff" : theme.text,
                                  }}
                                >
                                  {icon?.startsWith("http") ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={icon} alt="" className="h-4 w-4 rounded-full object-cover" />
                                  ) : icon ? (
                                    <span>{icon.slice(0, 2)}</span>
                                  ) : null}
                                  {opt}
                                </button>
                              )
                            })}
                          </div>
                        ) : isChoice ? (
                          <select
                            className="bk-input"
                            required={field.required}
                            value={answers[field.id] || ""}
                            onChange={(e) =>
                              setAnswers((a) => ({
                                ...a,
                                [field.id]: e.target.value,
                                ...(field.id === "serviceType"
                                  ? { serviceType: e.target.value }
                                  : {}),
                              }))
                            }
                          >
                            <option value="">Select…</option>
                            {choiceOpts.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={
                              field.type === "email"
                                ? "email"
                                : field.type === "tel"
                                  ? "tel"
                                  : field.type === "number"
                                    ? "number"
                                    : "text"
                            }
                            className="bk-input"
                            placeholder={field.placeholder}
                            required={field.required}
                            value={answers[field.id] || ""}
                            onChange={(e) =>
                              setAnswers((a) => ({
                                ...a,
                                [field.id]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </div>
                    )
                  })}

                  {config.showRecurringOption && (
                    <div
                      className="bk-rise rounded-2xl border p-4"
                      style={{
                        borderColor: rgba(theme.primary, 0.12),
                        background: rgba(theme.primary, 0.03),
                      }}
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-[var(--bk-accent)]"
                          checked={wantsRecurring}
                          onChange={(e) => setWantsRecurring(e.target.checked)}
                        />
                        <span>
                          <span
                            className="block text-sm font-semibold"
                            style={{ color: theme.text }}
                          >
                            Make this a recurring clean
                          </span>
                          <span
                            className="mt-0.5 block text-[12px] opacity-60"
                            style={{ color: theme.text }}
                          >
                            Optional — we’ll confirm the schedule with you
                          </span>
                        </span>
                      </label>
                      {wantsRecurring && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {(
                            config.recurringOptions || BOOKING_RECURRING_OPTIONS
                          ).map((opt) => {
                            const on = recurringPattern === opt.value
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() =>
                                  setRecurringPattern(opt.value)
                                }
                                className="rounded-xl border px-3 py-2.5 text-left transition"
                                style={{
                                  borderColor: on
                                    ? theme.accent
                                    : rgba(theme.primary, 0.12),
                                  background: on
                                    ? rgba(theme.accent, 0.12)
                                    : "transparent",
                                  color: theme.text,
                                }}
                              >
                                <span className="block text-[13px] font-semibold">
                                  {opt.label}
                                </span>
                                <span className="block text-[11px] opacity-55">
                                  {opt.hint}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={submitting || (config.showCalendar && !selectedSlot)}
                    onClick={() => void submit()}
                    className="bk-cta mt-2 w-full py-3.5 text-sm"
                  >
                    {submitting ? "Sending request…" : "Request booking"}
                  </button>
                </div>
              )}
            </section>
          )}

          <footer className="bk-rise-4 mt-10 flex flex-col items-center gap-2 pb-4">
            <TidyFlowWordmark ink={theme.primary} />
            <a
              href={tidyflowMarketingUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] opacity-35 transition hover:opacity-70"
            >
              tidyflowapp.com — cleaning company operations
            </a>
          </footer>
        </main>
    </div>
  )
}
