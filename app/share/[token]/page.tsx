"use client"

/**
 * Public read-only client portal for share links.
 * Fetches GET /api/share/[token] — no auth required.
 */
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { MapPin, ShieldCheck, Camera, AlertTriangle, Loader2 } from "lucide-react"

type PortalPhoto = {
  id: number
  url: string
  photoType?: string | null
  caption?: string | null
}

type PortalData = {
  companyName?: string | null
  title?: string | null
  status?: string | null
  completedAt?: string | null
  averageScore?: number | null
  property?: { address?: string | null; clientName?: string | null } | null
  assignedUser?: { firstName?: string | null; lastName?: string | null } | null
  photos?: PortalPhoto[]
  proof?: {
    cleaners?: Array<{ name: string; workMinutes?: number; startWithinGeofence?: boolean | null }>
    totalWorkMinutes?: number
    gps?: {
      checkpointCount?: number
      onSiteCount?: number
      startOnSite?: boolean
      flaggedCheckpoints?: Array<{
        latitude: number
        longitude: number
        recordedAt: string
      }>
    }
  }
}

export default function SharePortalPage() {
  const params = useParams()
  const token = typeof params?.token === "string" ? params.token : ""
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<"invalid" | "expired" | "network" | null>(null)

  useEffect(() => {
    if (!token) {
      setError("invalid")
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`/api/share/${encodeURIComponent(token)}`)
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (res.status === 410) {
          setError("expired")
          setData(null)
          return
        }
        if (!res.ok || !json?.success) {
          setError(res.status === 404 || res.status === 400 ? "invalid" : "network")
          setData(null)
          return
        }
        setData(json.data as PortalData)
      } catch {
        if (!cancelled) {
          setError("network")
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const beforePhotos = useMemo(
    () => (data?.photos || []).filter((p) => (p.photoType || "").toLowerCase() === "before"),
    [data]
  )
  const afterPhotos = useMemo(
    () => (data?.photos || []).filter((p) => (p.photoType || "").toLowerCase() === "after"),
    [data]
  )

  const cleanerName = useMemo(() => {
    if (data?.assignedUser) {
      const n = [data.assignedUser.firstName, data.assignedUser.lastName].filter(Boolean).join(" ").trim()
      if (n) return n
    }
    return data?.proof?.cleaners?.[0]?.name || null
  }, [data])

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-sm font-medium">Loading cleaning report…</p>
        </div>
      </Shell>
    )
  }

  if (error || !data) {
    const title =
      error === "expired" ? "This link has expired" : error === "network" ? "Could not load report" : "Link invalid or expired"
    const detail =
      error === "expired"
        ? "Ask the cleaning company for a fresh share link."
        : error === "network"
          ? "Check your connection and try again."
          : "This share link is no longer available."
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl border border-amber-500/20 bg-navy-900/80 px-8 py-12 text-center shadow-xl">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-4 text-xl font-extrabold text-white">{title}</h1>
          <p className="mt-2 text-sm text-slate-400">{detail}</p>
        </div>
      </Shell>
    )
  }

  const gps = data.proof?.gps
  const statusLabel = (data.status || "—").replace(/_/g, " ")

  return (
    <Shell>
      <header className="overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-br from-navy-900 via-navy-950 to-[#061018] shadow-xl">
        <div className="border-b border-amber-500/15 px-5 py-4 sm:px-8 sm:py-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400">
            Cleaning report
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {data.companyName || "TidyFlow"}
          </h1>
          {data.property?.address && (
            <p className="mt-2 flex items-start gap-2 text-sm text-slate-300">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
              <span>{data.property.address}</span>
            </p>
          )}
          {data.title && <p className="mt-1 text-xs font-medium text-slate-500">{data.title}</p>}
        </div>
        <div className="grid grid-cols-2 gap-px bg-amber-500/10 sm:grid-cols-4">
          <Stat label="Status" value={statusLabel} />
          <Stat label="Cleaner" value={cleanerName || "—"} />
          <Stat
            label="Quality score"
            value={data.averageScore != null ? `${data.averageScore}/100` : "—"}
          />
          <Stat
            label="Completed"
            value={
              data.completedAt
                ? new Date(data.completedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—"
            }
          />
        </div>
      </header>

      {gps && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            <h2 className="text-base font-bold text-navy-900">GPS verification</h2>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {gps.checkpointCount ?? 0} location checkpoint
            {(gps.checkpointCount ?? 0) === 1 ? "" : "s"}
            {(gps.onSiteCount ?? 0) > 0 ? ` · ${gps.onSiteCount} on site` : ""}
            {gps.startOnSite === true ? " · Started on site" : ""}
          </p>
          {data.proof?.cleaners && data.proof.cleaners.length > 0 && (
            <ul className="mt-4 space-y-2">
              {data.proof.cleaners.map((c, i) => (
                <li
                  key={`${c.name}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="font-semibold text-navy-900">{c.name}</span>
                  <span className="text-xs text-slate-500">
                    {c.workMinutes != null && c.workMinutes > 0
                      ? `${c.workMinutes} min`
                      : "Time n/a"}
                    {c.startWithinGeofence === true
                      ? " · On site start"
                      : c.startWithinGeofence === false
                        ? " · Off site start"
                        : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(gps.flaggedCheckpoints?.length ?? 0) > 0 && (
            <div className="mt-4 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-rose-700">
                Flagged off-site points
              </p>
              <ul className="mt-2 space-y-1">
                {gps.flaggedCheckpoints!.slice(0, 5).map((g, i) => (
                  <li key={`${g.recordedAt}-${i}`} className="text-xs text-rose-800">
                    {Number(g.latitude).toFixed(5)}, {Number(g.longitude).toFixed(5)}
                    {" · "}
                    {new Date(g.recordedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <PhotoGrid title="Before photos" photos={beforePhotos} />
      <PhotoGrid title="After photos" photos={afterPhotos} />

      <p className="mt-10 text-center text-[11px] text-slate-400">
        Powered by <span className="font-semibold text-navy-800">TidyFlow</span>
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F4F6F9] via-[#EEF1F6] to-[#E8ECF2]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-navy-950/90 px-4 py-3 sm:px-5 sm:py-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold capitalize text-white">{value}</p>
    </div>
  )
}

function PhotoGrid({ title, photos }: { title: string; photos: PortalPhoto[] }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Camera className="h-4 w-4 text-amber-600" />
        <h2 className="text-base font-bold text-navy-900">
          {title}{" "}
          <span className="font-mono text-sm font-medium text-slate-400">({photos.length})</span>
        </h2>
      </div>
      {photos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center text-sm text-slate-400">
          No photos yet
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption || title}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              />
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
