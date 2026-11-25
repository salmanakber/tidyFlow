"use client"

/**
 * Light-grey Shopify-style 3D globe with real country outlines + active user popover.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import type { FleetMapMarker } from "@/components/ops/LiveFleetMap"
import { MapPin, Radio, ShieldAlert, Building2, X } from "lucide-react"

type Vec3 = { x: number; y: number; z: number }
type Ring = Array<[number, number]> // [lng, lat]
type CountryPoly = { rings: Ring[] }

type Hit = { m: FleetMapMarker; x: number; y: number; r: number }

type PopoverState = {
  marker: FleetMapMarker
  x: number
  y: number
}

const GEO_URL =
  "https://cdn.jsdelivr.net/gh/holtzy/D3-graph-gallery@master/DATA/world.geojson"

function latLngToVec(lat: number, lng: number, radius = 1): Vec3 {
  const φ = (lat * Math.PI) / 180
  const λ = (lng * Math.PI) / 180
  return {
    x: radius * Math.cos(φ) * Math.cos(λ),
    y: radius * Math.sin(φ),
    z: radius * Math.cos(φ) * Math.sin(λ),
  }
}

function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c }
}

function rotateX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c }
}

function simplifyRing(ring: Ring, step = 2): Ring {
  if (ring.length < 8) return ring
  const out: Ring = []
  for (let i = 0; i < ring.length; i += step) out.push(ring[i])
  const last = ring[ring.length - 1]
  const first = out[0]
  if (!first || last[0] !== first[0] || last[1] !== first[1]) out.push(last)
  return out
}

function parseCountries(geo: any): CountryPoly[] {
  const features = Array.isArray(geo?.features) ? geo.features : []
  const countries: CountryPoly[] = []
  for (const f of features) {
    const g = f?.geometry
    if (!g) continue
    const rings: Ring[] = []
    if (g.type === "Polygon") {
      for (const ring of g.coordinates || []) {
        rings.push(simplifyRing(ring as Ring, 3))
      }
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates || []) {
        for (const ring of poly || []) {
          rings.push(simplifyRing(ring as Ring, 3))
        }
      }
    }
    if (rings.length) countries.push({ rings })
  }
  return countries
}

function signalLabel(s?: FleetMapMarker["signal"]) {
  if (s === "live") return "Live"
  if (s === "stale") return "Stale"
  if (s === "offline") return "Offline"
  return "Unknown"
}

function signalTone(s?: FleetMapMarker["signal"]) {
  if (s === "live") return "bg-emerald-100 text-emerald-800"
  if (s === "stale") return "bg-amber-100 text-amber-800"
  if (s === "offline") return "bg-slate-200 text-slate-600"
  return "bg-slate-100 text-slate-500"
}

function kindIcon(kind: FleetMapMarker["kind"]) {
  if (kind === "sos") return ShieldAlert
  if (kind === "property") return Building2
  return Radio
}

export default function LiveFleetGlobe({
  markers,
  height = 460,
  onMarkerClick,
}: {
  markers: FleetMapMarker[]
  height?: number
  onMarkerClick?: (m: FleetMapMarker) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const rotRef = useRef(0.55)
  const tiltRef = useRef(0.28)
  const dragRef = useRef<{ x: number; y: number; rot: number; tilt: number } | null>(null)
  const markersRef = useRef(markers)
  markersRef.current = markers
  const clickRef = useRef(onMarkerClick)
  clickRef.current = onMarkerClick
  const hitRef = useRef<Hit[]>([])
  const countriesRef = useRef<CountryPoly[]>([])
  const [geoReady, setGeoReady] = useState(false)
  const [popover, setPopover] = useState<PopoverState | null>(null)

  const liveCount = useMemo(
    () => markers.filter((m) => m.kind === "cleaner" && m.signal === "live").length,
    [markers]
  )

  // Load real country GeoJSON once
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(GEO_URL)
        const json = await res.json()
        if (cancelled) return
        countriesRef.current = parseCountries(json)
        setGeoReady(true)
      } catch {
        if (!cancelled) setGeoReady(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Aim globe toward first live cleaner when available
  useEffect(() => {
    const live = markers.find((m) => m.kind === "cleaner" && Number.isFinite(m.lat))
    if (!live) return
    rotRef.current = (-live.lng * Math.PI) / 180
    tiltRef.current = Math.max(-0.6, Math.min(0.6, (live.lat * Math.PI) / 180 / 2.2))
  }, [markers.length])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let alive = true
    let auto = true

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = wrap.clientWidth
      const h = height
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    const project = (lat: number, lng: number) => {
      let v = latLngToVec(lat, lng)
      v = rotateY(v, rotRef.current)
      v = rotateX(v, tiltRef.current)
      return v
    }

    const draw = () => {
      if (!alive) return
      const w = wrap.clientWidth
      const h = height
      const cx = w / 2
      const cy = h / 2 + 6
      const R = Math.min(w, h) * 0.4

      if (auto && !dragRef.current) rotRef.current += 0.0016

      // Light workspace background
      ctx.clearRect(0, 0, w, h)
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, "#F8FAFC")
      bg.addColorStop(1, "#EEF2F7")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // Soft ground shadow
      ctx.beginPath()
      ctx.ellipse(cx, cy + R * 0.92, R * 0.72, R * 0.12, 0, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(148,163,184,0.22)"
      ctx.fill()

      // Atmosphere (light)
      const atm = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.18)
      atm.addColorStop(0, "rgba(148,163,184,0.16)")
      atm.addColorStop(1, "rgba(148,163,184,0)")
      ctx.fillStyle = atm
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2)
      ctx.fill()

      // Ocean sphere — light grey
      const ocean = ctx.createRadialGradient(
        cx - R * 0.35,
        cy - R * 0.4,
        R * 0.08,
        cx,
        cy,
        R
      )
      ocean.addColorStop(0, "#F1F5F9")
      ocean.addColorStop(0.45, "#E2E8F0")
      ocean.addColorStop(0.85, "#CBD5E1")
      ocean.addColorStop(1, "#94A3B8")
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = ocean
      ctx.fill()

      // Clip to sphere for land
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.clip()

      // Real countries
      const countries = countriesRef.current
      for (const country of countries) {
        for (const ring of country.rings) {
          if (!ring?.length) continue
          let started = false
          ctx.beginPath()
          for (let i = 0; i < ring.length; i++) {
            const [lng, lat] = ring[i]
            const v = project(lat, lng)
            if (v.z < -0.02) {
              started = false
              continue
            }
            const x = cx + v.x * R
            const y = cy - v.y * R
            if (!started) {
              ctx.moveTo(x, y)
              started = true
            } else {
              ctx.lineTo(x, y)
            }
          }
          if (!started) continue
          ctx.closePath()
          ctx.fillStyle = "rgba(148,163,184,0.55)"
          ctx.fill()
          ctx.strokeStyle = "rgba(100,116,139,0.45)"
          ctx.lineWidth = 0.6
          ctx.stroke()
        }
      }

      // Subtle graticule
      ctx.strokeStyle = "rgba(148,163,184,0.22)"
      ctx.lineWidth = 0.7
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath()
        let started = false
        for (let lng = -180; lng <= 180; lng += 5) {
          const v = project(lat, lng)
          if (v.z < 0) {
            started = false
            continue
          }
          const x = cx + v.x * R
          const y = cy - v.y * R
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      ctx.restore()

      // Sphere rim + highlight
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.strokeStyle = "rgba(100,116,139,0.35)"
      ctx.lineWidth = 1.25
      ctx.stroke()

      const spec = ctx.createRadialGradient(
        cx - R * 0.38,
        cy - R * 0.48,
        0,
        cx - R * 0.2,
        cy - R * 0.28,
        R * 0.75
      )
      spec.addColorStop(0, "rgba(255,255,255,0.55)")
      spec.addColorStop(0.35, "rgba(255,255,255,0.12)")
      spec.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = spec
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()

      // Markers
      const hits: Hit[] = []
      const list = markersRef.current.filter(
        (m) => Number.isFinite(m.lat) && Number.isFinite(m.lng)
      )
      for (const m of list) {
        const v = project(m.lat, m.lng)
        if (v.z < 0.05) continue
        const x = cx + v.x * R
        const y = cy - v.y * R
        const depth = (v.z + 1) / 2
        const r = 5 + depth * 2.5
        const color =
          m.kind === "sos"
            ? "#E11D48"
            : m.warn
              ? "#D97706"
              : m.kind === "property"
                ? "#64748B"
                : m.signal === "live"
                  ? "#059669"
                  : "#94A3B8"

        // pin stem
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y - r * 1.6)
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(x, y - r * 1.6, r, 0, Math.PI * 2)
        ctx.fillStyle = "#FFFFFF"
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y - r * 1.6, r * 0.45, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()

        // pulse for live cleaners
        if (m.kind === "cleaner" && m.signal === "live") {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 350 + m.lat)
          ctx.beginPath()
          ctx.arc(x, y - r * 1.6, r + 3 + pulse * 4, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(5,150,105,${0.35 - pulse * 0.2})`
          ctx.lineWidth = 2
          ctx.stroke()
        }

        hits.push({ m, x, y: y - r * 1.6, r: r + 8 })
      }
      hitRef.current = hits

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    const findHit = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      return hitRef.current.find((h) => (h.x - x) ** 2 + (h.y - y) ** 2 <= h.r ** 2) || null
    }

    const onDown = (e: PointerEvent) => {
      auto = false
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        rot: rotRef.current,
        tilt: tiltRef.current,
      }
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.x
        const dy = e.clientY - dragRef.current.y
        rotRef.current = dragRef.current.rot + dx * 0.007
        tiltRef.current = Math.max(
          -0.85,
          Math.min(0.85, dragRef.current.tilt + dy * 0.005)
        )
        return
      }
      const hit = findHit(e.clientX, e.clientY)
      canvas.style.cursor = hit || dragRef.current ? "pointer" : "grab"
      if (hit) {
        setPopover({ marker: hit.m, x: hit.x, y: hit.y })
      }
    }
    const onUp = () => {
      dragRef.current = null
      setTimeout(() => {
        auto = true
      }, 1800)
    }
    const onClick = (e: MouseEvent) => {
      const hit = findHit(e.clientX, e.clientY)
      if (!hit) {
        setPopover(null)
        return
      }
      setPopover({ marker: hit.m, x: hit.x, y: hit.y })
      clickRef.current?.(hit.m)
    }
    const onLeave = () => {
      if (!dragRef.current) canvas.style.cursor = "grab"
    }

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)
    canvas.addEventListener("click", onClick)
    canvas.addEventListener("pointerleave", onLeave)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("click", onClick)
      canvas.removeEventListener("pointerleave", onLeave)
    }
  }, [height, geoReady])

  return (
    <div
      ref={wrapRef}
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
      style={{ height }}
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />

      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <span className="rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-sm backdrop-blur-sm">
          Light globe · real countries
        </span>
        {liveCount > 0 && (
          <span className="rounded-lg border border-emerald-200 bg-emerald-50/95 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-700 shadow-sm">
            {liveCount} live
          </span>
        )}
      </div>

      {!geoReady && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-500 shadow-sm">
          Loading country map…
        </div>
      )}

      {markers.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm">
            Waiting for live GPS pins…
          </p>
        </div>
      )}

      {popover && (
        <div
          className="absolute z-20 w-[240px] -translate-x-1/2 -translate-y-[110%] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{
            left: Math.max(120, Math.min((wrapRef.current?.clientWidth || 300) - 120, popover.x)),
            top: Math.max(8, popover.y),
          }}
          onMouseLeave={() => setPopover(null)}
        >
          <button
            type="button"
            className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={() => setPopover(null)}
            aria-label="Close"
          >
            <X size={12} />
          </button>
          <div className="flex items-start gap-2.5 pr-4">
            <div
              className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${
                popover.marker.kind === "sos"
                  ? "bg-rose-100 text-rose-600"
                  : popover.marker.kind === "property"
                    ? "bg-slate-100 text-slate-600"
                    : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {(() => {
                const Icon = kindIcon(popover.marker.kind)
                return <Icon size={16} />
              })()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-navy-900">{popover.marker.label}</p>
              {popover.marker.sub ? (
                <p className="mt-0.5 truncate text-[11px] text-slate-500">{popover.marker.sub}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${signalTone(
                    popover.marker.signal
                  )}`}
                >
                  {signalLabel(popover.marker.signal)}
                </span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                  {popover.marker.kind}
                </span>
              </div>
              <p className="mt-2 flex items-center gap-1 font-mono text-[10px] text-slate-400">
                <MapPin size={10} />
                {popover.marker.lat.toFixed(4)}, {popover.marker.lng.toFixed(4)}
              </p>
              <button
                type="button"
                className="mt-2.5 inline-flex h-8 w-full items-center justify-center rounded-lg bg-navy-900 text-[11px] font-bold text-amber-300 hover:bg-navy-800"
                onClick={() => {
                  onMarkerClick?.(popover.marker)
                  setPopover(null)
                }}
              >
                Open details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
