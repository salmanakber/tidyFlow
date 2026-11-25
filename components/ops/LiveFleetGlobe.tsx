"use client"

/**
 * Light-grey Shopify-style 3D globe:
 * real countries, city/country labels, zoom, active-user popovers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FleetMapMarker } from "@/components/ops/LiveFleetMap"
import {
  MapPin,
  Radio,
  ShieldAlert,
  Building2,
  X,
  ZoomIn,
  ZoomOut,
  LocateFixed,
} from "lucide-react"

type Vec3 = { x: number; y: number; z: number }
type Ring = Array<[number, number]>
type CountryPoly = { rings: Ring[]; name?: string; lat: number; lng: number }
type Hit = { m: FleetMapMarker; x: number; y: number; r: number }
type PlaceInfo = { city?: string; country?: string; label: string }

type PopoverState = {
  marker: FleetMapMarker
  place?: PlaceInfo | null
  x: number
  y: number
}

const GEO_URL =
  "https://cdn.jsdelivr.net/gh/holtzy/D3-graph-gallery@master/DATA/world.geojson"

/** Major cities drawn as labels when zoomed in enough */
const CITY_LABELS: Array<{ name: string; country: string; lat: number; lng: number }> = [
  { name: "London", country: "UK", lat: 51.5074, lng: -0.1278 },
  { name: "Manchester", country: "UK", lat: 53.4808, lng: -2.2426 },
  { name: "Birmingham", country: "UK", lat: 52.4862, lng: -1.8904 },
  { name: "New York", country: "USA", lat: 40.7128, lng: -74.006 },
  { name: "Los Angeles", country: "USA", lat: 34.0522, lng: -118.2437 },
  { name: "Chicago", country: "USA", lat: 41.8781, lng: -87.6298 },
  { name: "Toronto", country: "Canada", lat: 43.6532, lng: -79.3832 },
  { name: "Vancouver", country: "Canada", lat: 49.2827, lng: -123.1207 },
  { name: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { name: "Berlin", country: "Germany", lat: 52.52, lng: 13.405 },
  { name: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038 },
  { name: "Rome", country: "Italy", lat: 41.9028, lng: 12.4964 },
  { name: "Amsterdam", country: "Netherlands", lat: 52.3676, lng: 4.9041 },
  { name: "Dubai", country: "UAE", lat: 25.2048, lng: 55.2708 },
  { name: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lng: 46.6753 },
  { name: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198 },
  { name: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503 },
  { name: "Sydney", country: "Australia", lat: -33.8688, lng: 151.2093 },
  { name: "Melbourne", country: "Australia", lat: -37.8136, lng: 144.9631 },
  { name: "Auckland", country: "New Zealand", lat: -36.8509, lng: 174.7645 },
  { name: "São Paulo", country: "Brazil", lat: -23.5505, lng: -46.6333 },
  { name: "Mexico City", country: "Mexico", lat: 19.4326, lng: -99.1332 },
  { name: "Lagos", country: "Nigeria", lat: 6.5244, lng: 3.3792 },
  { name: "Cairo", country: "Egypt", lat: 30.0444, lng: 31.2357 },
  { name: "Mumbai", country: "India", lat: 19.076, lng: 72.8777 },
  { name: "Delhi", country: "India", lat: 28.7041, lng: 77.1025 },
  { name: "Hong Kong", country: "China", lat: 22.3193, lng: 114.1694 },
  { name: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.978 },
  { name: "Istanbul", country: "Turkey", lat: 41.0082, lng: 28.9784 },
  { name: "Stockholm", country: "Sweden", lat: 59.3293, lng: 18.0686 },
  { name: "Dublin", country: "Ireland", lat: 53.3498, lng: -6.2603 },
  { name: "Lisbon", country: "Portugal", lat: 38.7223, lng: -9.1393 },
]

const placeCache = new Map<string, PlaceInfo>()

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

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function ringCentroid(ring: Ring): { lat: number; lng: number } {
  let lat = 0
  let lng = 0
  let n = 0
  for (const [lo, la] of ring) {
    if (!Number.isFinite(lo) || !Number.isFinite(la)) continue
    lng += lo
    lat += la
    n++
  }
  if (!n) return { lat: 0, lng: 0 }
  return { lat: lat / n, lng: lng / n }
}

function parseCountries(geo: any): CountryPoly[] {
  const features = Array.isArray(geo?.features) ? geo.features : []
  const countries: CountryPoly[] = []
  for (const f of features) {
    const g = f?.geometry
    if (!g) continue
    const rings: Ring[] = []
    if (g.type === "Polygon") {
      for (const ring of g.coordinates || []) rings.push(simplifyRing(ring as Ring, 3))
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates || []) {
        for (const ring of poly || []) rings.push(simplifyRing(ring as Ring, 3))
      }
    }
    if (!rings.length) continue
    const name = String(f?.properties?.name || f?.properties?.NAME || "").trim() || undefined
    const c = ringCentroid(rings[0])
    countries.push({ rings, name, lat: c.lat, lng: c.lng })
  }
  return countries
}

/** Always-available place label from nearest known city (no network). */
function nearestCityPlace(lat: number, lng: number): PlaceInfo {
  let best = CITY_LABELS[0]
  let bestD = Infinity
  for (const c of CITY_LABELS) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  // ~8° ≈ rough regional match; beyond that still show nearest for orientation
  const city = bestD < 64 ? best.name : undefined
  const country = best.country
  const label = city ? `${city}, ${country}` : `Near ${country}`
  return { city, country, label }
}

async function reverseGeocode(lat: number, lng: number): Promise<PlaceInfo> {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  if (placeCache.has(key)) return placeCache.get(key)!
  const fallback = nearestCityPlace(lat, lng)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    })
    if (!res.ok) {
      placeCache.set(key, fallback)
      return fallback
    }
    const data = await res.json()
    const a = data?.address || {}
    const city =
      a.city || a.town || a.village || a.municipality || a.suburb || a.county || fallback.city
    const country = a.country || fallback.country
    const label = [city, country].filter(Boolean).join(", ") || fallback.label
    const info = { city, country, label }
    placeCache.set(key, info)
    return info
  } catch {
    placeCache.set(key, fallback)
    return fallback
  }
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
  const zoomRef = useRef(1.35)
  const dragRef = useRef<{ x: number; y: number; rot: number; tilt: number } | null>(null)
  const markersRef = useRef(markers)
  markersRef.current = markers
  const clickRef = useRef(onMarkerClick)
  clickRef.current = onMarkerClick
  const hitRef = useRef<Hit[]>([])
  const countriesRef = useRef<CountryPoly[]>([])
  const placesRef = useRef<Record<string, PlaceInfo>>({})
  const [geoReady, setGeoReady] = useState(false)
  const [zoom, setZoom] = useState(1.35)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [, bump] = useState(0)

  const liveCount = useMemo(
    () => markers.filter((m) => m.kind === "cleaner" && m.signal === "live").length,
    [markers]
  )

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

  // Instant nearest-city labels, then refine via reverse geocode when available
  useEffect(() => {
    let cancelled = false
    const targets = markers
      .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng))
      .slice(0, 40)
    for (const m of targets) {
      if (!placesRef.current[m.id]) {
        placesRef.current[m.id] = nearestCityPlace(m.lat, m.lng)
      }
    }
    bump((n) => n + 1)
    ;(async () => {
      for (const m of targets) {
        if (cancelled) return
        const info = await reverseGeocode(m.lat, m.lng)
        placesRef.current[m.id] = info
        bump((n) => n + 1)
        await new Promise((r) => setTimeout(r, 400))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [markers])

  useEffect(() => {
    const live = markers.find((m) => m.kind === "cleaner" && Number.isFinite(m.lat))
    if (!live) return
    rotRef.current = (-live.lng * Math.PI) / 180
    tiltRef.current = Math.max(-0.6, Math.min(0.6, (live.lat * Math.PI) / 180 / 2.2))
  }, [markers.length])

  const applyZoom = useCallback((next: number) => {
    const z = Math.max(0.85, Math.min(3.2, next))
    zoomRef.current = z
    setZoom(z)
  }, [])

  const focusNearestLive = useCallback(() => {
    const live = markersRef.current.find(
      (m) => m.kind === "cleaner" && Number.isFinite(m.lat)
    )
    if (!live) return
    rotRef.current = (-live.lng * Math.PI) / 180
    tiltRef.current = Math.max(-0.6, Math.min(0.6, (live.lat * Math.PI) / 180 / 2.2))
    applyZoom(Math.max(zoomRef.current, 1.6))
  }, [applyZoom])

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
      const R = Math.min(w, h) * 0.36 * zoomRef.current

      if (auto && !dragRef.current) rotRef.current += 0.0012

      ctx.clearRect(0, 0, w, h)
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, "#F8FAFC")
      bg.addColorStop(1, "#EEF2F7")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      ctx.beginPath()
      ctx.ellipse(cx, cy + R * 0.92, R * 0.72, R * 0.12, 0, 0, Math.PI * 2)
      ctx.fillStyle = "rgba(148,163,184,0.2)"
      ctx.fill()

      const atm = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.18)
      atm.addColorStop(0, "rgba(148,163,184,0.14)")
      atm.addColorStop(1, "rgba(148,163,184,0)")
      ctx.fillStyle = atm
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2)
      ctx.fill()

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

      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.clip()

      for (const country of countriesRef.current) {
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
            } else ctx.lineTo(x, y)
          }
          if (!started) continue
          ctx.closePath()
          ctx.fillStyle = "rgba(148,163,184,0.55)"
          ctx.fill()
          ctx.strokeStyle = "rgba(100,116,139,0.4)"
          ctx.lineWidth = 0.55
          ctx.stroke()
        }
      }

      ctx.restore()

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

      // Only draw pins + labels for real GPS markers (never blanket country/city names)
      const hits: Hit[] = []
      const list = markersRef.current.filter(
        (m) => Number.isFinite(m.lat) && Number.isFinite(m.lng)
      )
      const t = Date.now()
      for (const m of list) {
        const v = project(m.lat, m.lng)
        if (v.z < 0.08) continue
        const x = cx + v.x * R
        const y = cy - v.y * R
        const depth = (v.z + 1) / 2
        const baseR = (6 + depth * 2.2) * Math.min(1.3, 0.9 + zoomRef.current * 0.12)
        const bounce = Math.sin(t / 420 + m.lat * 3 + m.lng) * 2.2
        const pinY = y - baseR * 1.75 + bounce
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

        // Soft ground ripple under pin
        const ripple = 0.5 + 0.5 * Math.sin(t / 500 + m.lng)
        ctx.beginPath()
        ctx.ellipse(x, y + 1, baseR * (1.1 + ripple * 0.45), baseR * 0.28, 0, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(15,23,42,${0.08 + ripple * 0.06})`
        ctx.fill()

        // Expanding pulse rings for live cleaners / SOS
        if (m.signal === "live" || m.kind === "sos") {
          for (let ring = 0; ring < 2; ring++) {
            const phase = ((t / 900 + ring * 0.45 + m.lat) % 1)
            const rr = baseR + 4 + phase * 16
            const a = (1 - phase) * (m.kind === "sos" ? 0.45 : 0.32)
            ctx.beginPath()
            ctx.arc(x, pinY, rr, 0, Math.PI * 2)
            ctx.strokeStyle =
              m.kind === "sos"
                ? `rgba(225,29,72,${a})`
                : `rgba(5,150,105,${a})`
            ctx.lineWidth = 2
            ctx.stroke()
          }
        }

        // Pin stem
        ctx.strokeStyle = color
        ctx.lineWidth = 2.25
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, pinY)
        ctx.stroke()

        // Pin head (teardrop-ish circle)
        ctx.beginPath()
        ctx.arc(x, pinY, baseR, 0, Math.PI * 2)
        ctx.fillStyle = "#FFFFFF"
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 2.75
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, pinY, baseR * 0.42, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()

        // Compact name + location chip — only for this marker
        const place = placesRef.current[m.id]
        const title = (m.label || "Team").slice(0, 20)
        const placeLine = (place?.label || m.sub || "").slice(0, 26)
        const padX = 8
        const chipH = placeLine ? 34 : 22
        ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif"
        const titleW = ctx.measureText(title).width
        ctx.font = "9px ui-sans-serif, system-ui, sans-serif"
        const placeW = placeLine ? ctx.measureText(placeLine).width : 0
        const chipW = Math.max(titleW, placeW) + padX * 2
        const chipX = x + baseR + 8
        const chipY = pinY - chipH / 2

        // Keep chip on-screen
        const maxX = w - chipW - 6
        const drawX = Math.min(chipX, maxX)
        const drawY = Math.max(6, Math.min(h - chipH - 6, chipY))

        // Chip shadow + body
        ctx.fillStyle = "rgba(15,23,42,0.08)"
        ctx.beginPath()
        roundRect(ctx, drawX + 1, drawY + 2, chipW, chipH, 8)
        ctx.fill()
        ctx.fillStyle = "rgba(255,255,255,0.96)"
        ctx.beginPath()
        roundRect(ctx, drawX, drawY, chipW, chipH, 8)
        ctx.fill()
        ctx.strokeStyle = "rgba(226,232,240,0.95)"
        ctx.lineWidth = 1
        ctx.stroke()

        // Accent bar
        ctx.fillStyle = color
        ctx.beginPath()
        roundRect(ctx, drawX, drawY, 3, chipH, 2)
        ctx.fill()

        ctx.textAlign = "left"
        ctx.textBaseline = "alphabetic"
        ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif"
        ctx.fillStyle = "#0F172A"
        ctx.fillText(title, drawX + padX, drawY + (placeLine ? 14 : 15))
        if (placeLine) {
          ctx.font = "9px ui-sans-serif, system-ui, sans-serif"
          ctx.fillStyle = "#64748B"
          ctx.fillText(placeLine, drawX + padX, drawY + 27)
        }

        hits.push({ m, x, y: pinY, r: baseR + 12 })
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
      canvas.style.cursor = hit ? "pointer" : "grab"
      if (hit) {
        setPopover({
          marker: hit.m,
          place: placesRef.current[hit.m.id] || null,
          x: hit.x,
          y: hit.y,
        })
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
      setPopover({
        marker: hit.m,
        place: placesRef.current[hit.m.id] || null,
        x: hit.x,
        y: hit.y,
      })
      clickRef.current?.(hit.m)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      auto = false
      const next = zoomRef.current * (e.deltaY > 0 ? 0.92 : 1.08)
      const z = Math.max(0.85, Math.min(3.2, next))
      zoomRef.current = z
      setZoom(z)
    }

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)
    canvas.addEventListener("click", onClick)
    canvas.addEventListener("wheel", onWheel, { passive: false })

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("click", onClick)
      canvas.removeEventListener("wheel", onWheel)
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
          Live pins · zoom {zoom.toFixed(1)}x
        </span>
        {liveCount > 0 && (
          <span className="rounded-lg border border-emerald-200 bg-emerald-50/95 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-700 shadow-sm">
            {liveCount} live
          </span>
        )}
      </div>

      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => applyZoom(zoomRef.current + 0.25)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-amber-400 hover:text-amber-700"
          title="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={() => applyZoom(zoomRef.current - 0.25)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-amber-400 hover:text-amber-700"
          title="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={focusNearestLive}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-amber-400 hover:text-amber-700"
          title="Focus live cleaner"
        >
          <LocateFixed size={16} />
        </button>
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
          className="absolute z-20 w-[260px] -translate-x-1/2 -translate-y-[112%] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{
            left: Math.max(130, Math.min((wrapRef.current?.clientWidth || 300) - 130, popover.x)),
            top: Math.max(10, popover.y),
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
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                <MapPin size={11} className="shrink-0 text-amber-600" />
                <span className="truncate">
                  {popover.place?.label ||
                    popover.marker.sub ||
                    `${popover.marker.lat.toFixed(3)}, ${popover.marker.lng.toFixed(3)}`}
                </span>
              </p>
              {popover.place?.city || popover.place?.country ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Working from{" "}
                  <span className="font-semibold text-navy-800">
                    {[popover.place.city, popover.place.country].filter(Boolean).join(", ")}
                  </span>
                </p>
              ) : null}
              {popover.marker.sub ? (
                <p className="mt-1 truncate text-[11px] text-slate-500">{popover.marker.sub}</p>
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
