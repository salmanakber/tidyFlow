"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { tidyflowMarketingUrl } from "@/lib/booking-widget"

type TrackData = {
  guestName: string
  companyName: string
  serviceType?: string | null
  address?: string | null
  requestedStart: string
  status: string
  branding: {
    logoUrl: string | null
    primary: string
    accent: string
    background: string
  }
}

function statusCopy(status: string) {
  const s = status.toLowerCase()
  if (s === "converted" || s === "approved")
    return { label: "Confirmed", hint: "Your appointment is on the calendar." }
  if (s === "pending")
    return { label: "Received", hint: "The team will confirm shortly." }
  if (s === "rejected")
    return { label: "Declined", hint: "Please contact the company to reschedule." }
  if (s === "cancelled")
    return { label: "Cancelled", hint: "This booking is no longer active." }
  return { label: status, hint: "" }
}

export default function BookingTrackPage() {
  const params = useParams()
  const token = typeof params?.token === "string" ? params.token : ""
  const [data, setData] = useState<TrackData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/public/book/track/${encodeURIComponent(token)}`
        )
        const json = await res.json()
        if (!res.ok || !json?.success) {
          setError(json?.message || "Booking not found")
          return
        }
        if (!cancelled) setData(json.data)
      } catch {
        if (!cancelled) setError("Could not load booking")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a1520]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[#c4a574]" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0a1520] px-6 text-center text-white">
        <p className="font-serif text-2xl">{error || "Not found"}</p>
        <a href={tidyflowMarketingUrl()} className="text-sm text-amber-400/80">
          tidyflowapp.com
        </a>
      </div>
    )
  }

  const b = data.branding
  const st = statusCopy(data.status)
  const when = new Date(data.requestedStart).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <div
      className="min-h-screen px-4 py-12 sm:px-6"
      style={{
        background: `linear-gradient(165deg, ${b.background} 0%, #fff 55%)`,
        fontFamily: "Outfit, system-ui, sans-serif",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Outfit:wght@400;500;600;700&display=swap');`}</style>
      <div className="mx-auto max-w-lg">
        <div
          className="overflow-hidden rounded-[28px] shadow-2xl"
          style={{ boxShadow: `0 24px 60px ${b.primary}22` }}
        >
          <div
            className="px-7 pb-8 pt-7 text-white"
            style={{
              background: `linear-gradient(145deg, ${b.primary} 0%, ${b.primary}ee 60%, ${b.accent}99 140%)`,
            }}
          >
            <div className="flex items-center gap-3">
              {b.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.logoUrl}
                  alt=""
                  className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/25"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-lg font-semibold">
                  {data.companyName.slice(0, 1)}
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold tracking-[0.2em] text-white/55 uppercase">
                  Booking status
                </p>
                <p className="text-sm font-semibold">{data.companyName}</p>
              </div>
            </div>
            <h1
              className="mt-8 text-4xl leading-tight text-white"
              style={{ fontFamily: "Cormorant Garamond, Georgia, serif" }}
            >
              Hi {data.guestName.split(" ")[0]}
            </h1>
            <p className="mt-2 text-sm text-white/70">{st.hint}</p>
          </div>

          <div className="space-y-4 bg-white px-7 py-7">
            <div
              className="inline-flex rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase"
              style={{ background: `${b.accent}18`, color: b.accent }}
            >
              {st.label}
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-bold tracking-[0.14em] text-slate-400 uppercase">
                  When
                </dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{when}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-[0.14em] text-slate-400 uppercase">
                  Service
                </dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {data.serviceType || "Cleaning"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold tracking-[0.14em] text-slate-400 uppercase">
                  Address
                </dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {data.address || "To be confirmed"}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-2">
          <a
            href={tidyflowMarketingUrl()}
            className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/80 px-3.5 py-2 text-xs shadow-sm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/logot-transparent.png"
              alt=""
              className="h-6 w-6 object-contain"
            />
            Powered by <strong>TidyFlow</strong>
          </a>
        </div>
      </div>
    </div>
  )
}
